import {canUseAgenda} from "@/lib/doctor-services";
import { consumeLimit } from "@/lib/security/rate-limit";
import { HttpError } from "@/lib/security/http";
import { readJson, secureMutation } from "@/lib/security/http";
import { createHash, randomUUID } from 'node:crypto';
import { getSession } from '@/app/authz';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { compressPdf } from '@/lib/compress-pdf';

export const runtime = 'nodejs';
export const maxDuration = 60;
const BUCKET = 'surgery-documents';
const MAX_SIZE = 20 * 1024 * 1024;
type Surgery = { id: string; patientId?: string; doctorId?: string; anesthetistId?: string; date?: string; procedure?: string };
type SurgeryRow = { id: string; patient_id: string|null; professional_id: string|null; anesthetist_id: string|null; date: string|null; procedure: string|null };
const SURGERY_COLUMNS = 'id,patient_id,professional_id,anesthetist_id,date,procedure';
const APPOINTMENT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const DOCUMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;
function permitted(session: Session, a: Surgery) {
 return session.account.role === 'general_manager' || [a.doctorId,a.anesthetistId].some(id => !!id && session.agendaIds.includes(id));
}
async function context() {
 const session = await getSession();
 if (!session || !canUseAgenda(session)) throw new Error('unauthorized');
 return { session, db: getSupabaseAdmin() };
}
type Db = ReturnType<typeof getSupabaseAdmin>;
// Só os atendimentos pedidos (por id ou por paciente), da organização da sessão; nunca a agenda inteira.
async function surgeries(db: Db, organizationId: string, column: 'id'|'patient_id', value: unknown): Promise<Surgery[]> {
 if (typeof value !== 'string' || !APPOINTMENT_ID.test(value)) return [];
 const { data, error } = await db.from('appointments').select(SURGERY_COLUMNS).eq('organization_id',organizationId).eq(column,value);
 if (error) throw error;
 return ((data || []) as SurgeryRow[]).map(r => ({ id:r.id, patientId:r.patient_id ?? undefined, doctorId:r.professional_id ?? undefined,
  anesthetistId:r.anesthetist_id ?? undefined, date:r.date ?? undefined, procedure:r.procedure ?? undefined }));
}
async function surgeryOf(db: Db, organizationId: string, id: unknown) { return (await surgeries(db, organizationId, 'id', id))[0]; }
function documentId(id: unknown): string {
 if (typeof id !== 'string' || !DOCUMENT_ID.test(id)) throw new HttpError(400, 'Documento inválido.');
 return id;
}
function failure(error: unknown) {
 if (error instanceof HttpError) return Response.json({error:error.message},{status:error.status});
 const unauthorized = error instanceof Error && error.message === 'unauthorized';
 return Response.json({ error: unauthorized ? 'Entre na sua conta.' : 'Não foi possível acessar os documentos. Tente novamente.' }, { status: unauthorized ? 401 : 500 });
}
function sameOrigin(request: Request) {
 const origin = request.headers.get('origin');
 return !origin || origin === new URL(request.url).origin;
}
export async function GET(request: Request) {
 try {
  const { session, db } = await context();
  const url = new URL(request.url), id = url.searchParams.get('id');
  if (id) {
   const { data: doc, error } = await db.from('surgery_documents').select('*').eq('organization_id',session.organization.id).eq('id',documentId(id)).eq('status','ready').maybeSingle();
   if (error) throw error;
   const linked = doc && await surgeryOf(db, session.organization.id, doc.appointment_id);
   if (!linked || !permitted(session,linked)) return Response.json({ error:'Documento não disponível.' },{ status:404 });
   const { data, error: signedError } = await db.storage.from(BUCKET).createSignedUrl(doc.object_path,60,url.searchParams.has('download') ? { download:doc.name } : undefined);
   if (signedError) throw signedError;
   return new Response(null,{ status:302,headers:{ Location:data.signedUrl,'Cache-Control':'no-store','Referrer-Policy':'no-referrer' } });
  }
  const appointmentId = url.searchParams.get('appointmentId'), patientId = url.searchParams.get('patientId');
  if (!appointmentId && !patientId) return Response.json({ error:'Selecione uma cirurgia.' },{ status:400 });
  const allowed = (appointmentId ? await surgeries(db, session.organization.id, 'id', appointmentId) : await surgeries(db, session.organization.id, 'patient_id', patientId)).filter(a => permitted(session,a));
  if (appointmentId && !allowed.length) return Response.json({ error:'Agenda sem permissão.' },{ status:403 });
  if (!allowed.length) return Response.json({ documents:[] });
  const { data, error } = await db.from('surgery_documents').select('id,appointment_id,name,category,size,created_at').eq('organization_id',session.organization.id).in('appointment_id',allowed.map(a=>a.id)).eq('status','ready').order('created_at',{ascending:false});
  if (error) throw error;
  // The browser only needs a heading for each surgery. Never serialize the raw
  // appointment: it can contain financial and other restricted patient fields.
  const previews = new Map(allowed.map(a => [a.id, { id:a.id, date:a.date ?? null, procedure:a.procedure ?? null }]));
  return Response.json({ documents:(data || []).map((d: { appointment_id:string }) => ({ ...d, surgery:previews.get(d.appointment_id) ?? null })) },{ headers:{'Cache-Control':'no-store'} });
 } catch(error) { return failure(error); }
}
async function handlePOST(request: Request) {
 if (!sameOrigin(request)) return Response.json({error:'Origem inválida.'},{status:403});
 try {
  const { session, db } = await context();
  await consumeLimit("pdf-upload",String(session.account.id),20,3600);
  const body = await readJson(request);
  const target = await surgeryOf(db, session.organization.id, body.appointmentId);
  if (!target || !permitted(session,target)) return Response.json({error:'Agenda sem permissão.'},{status:403});
  if (typeof body.name !== 'string' || !body.name.toLowerCase().endsWith('.pdf') || !Number.isInteger(body.size) || body.size <= 0 || body.size > MAX_SIZE || !['guide','report','summary','other'].includes(body.category)) return Response.json({error:'Selecione um PDF de até 20 MB e uma categoria.'},{status:400});
  const id = randomUUID(), path = `org/${session.organization.id}/${target.id}/${id}.pdf`, name = body.name.replace(/[\x00-\x1f/\\]/g,'_').slice(0,200);
  const { error } = await db.from('surgery_documents').insert({id,organization_id:session.organization.id,appointment_id:target.id,patient_id:target.patientId||null,object_path:path,name,category:body.category,size:body.size,uploaded_by:session.account.id});
  if (error) throw error;
  const { data, error: signError } = await db.storage.from(BUCKET).createSignedUploadUrl(path,{upsert:false});
  if (signError) { await db.from('surgery_documents').delete().eq('id',id); throw signError; }
  return Response.json({id,url:data.signedUrl},{headers:{'Cache-Control':'no-store'}});
 } catch(error) { return failure(error); }
}
async function handlePATCH(request: Request) {
 if (!sameOrigin(request)) return Response.json({error:'Origem inválida.'},{status:403});
 try {
  const { session, db } = await context();
  await consumeLimit("pdf-finalize",String(session.account.id),30,3600);
  const id = documentId((await readJson(request)).id);
  const { data: doc, error } = await db.from('surgery_documents').select('*').eq('organization_id',session.organization.id).eq('id',id).maybeSingle();
  if (error) throw error;
  const surgery = doc && await surgeryOf(db, session.organization.id, doc.appointment_id);
  if (!surgery || !permitted(session,surgery) || Number(doc.uploaded_by)!==session.account.id) return Response.json({error:'Envio não disponível.'},{status:403});
  if (doc.status==='ready') return Response.json({ok:true});
  const { data: file, error: downloadError } = await db.storage.from(BUCKET).download(doc.object_path);
  if (downloadError || !file) return Response.json({error:'O envio não terminou. Tente novamente.'},{status:409});
  const valid = file.size === Number(doc.size) && file.size <= MAX_SIZE && (await file.slice(0,5).text()) === '%PDF-';
  if (!valid) {
   await db.storage.from(BUCKET).remove([doc.object_path]);
   await db.from('surgery_documents').delete().eq('id',id).eq('status','pending');
   return Response.json({error:'Arquivo inválido. Envie um PDF original de até 20 MB.'},{status:400});
  }
  const original = Buffer.from(await file.arrayBuffer());
  const compressed = await compressPdf(original);
  // Publish a fresh server-written object; the client's upload URL never addresses a ready PDF.
  const storedPath = `org/${session.organization.id}/${surgery.id}/${randomUUID()}.verified.pdf`;
  {
   const {error: uploadError}=await db.storage.from(BUCKET).upload(storedPath,compressed.bytes,{contentType:'application/pdf',upsert:false});
   if(uploadError) throw uploadError;
  }
  const { error: updateError } = await db.from('surgery_documents').update({status:'ready',sha256:createHash('sha256').update(compressed.bytes).digest('hex'),size:compressed.bytes.length,object_path:storedPath}).eq('id',id).eq('status','pending');
  if (updateError?.code==='23505') {
   await db.storage.from(BUCKET).remove([...new Set([doc.object_path,storedPath])]);await db.from('surgery_documents').delete().eq('id',id).eq('status','pending');
   return Response.json({error:'Este PDF já está vinculado a esta cirurgia.'},{status:409});
  }
  if (updateError) throw updateError;
  if(storedPath!==doc.object_path) await db.storage.from(BUCKET).remove([doc.object_path]);
  return Response.json({ok:true,originalSize:original.length,size:compressed.bytes.length,compression:compressed.reason});
 } catch(error) { return failure(error); }
}

async function handleDELETE(request: Request) {
 if(!sameOrigin(request)) return Response.json({error:'Origem inválida.'},{status:403});
 try {
  const {session,db}=await context();
  const body=await readJson(request);
  if(body.confirmed!==true) return Response.json({error:'Confirme a exclusão do PDF.'},{status:400});
  const id=documentId(body.id);
  const {data:doc,error}=await db.from('surgery_documents').select('*').eq('organization_id',session.organization.id).eq('id',id).maybeSingle();
  if(error) throw error;
  const surgery=doc && await surgeryOf(db,session.organization.id,doc.appointment_id);
  if(!surgery||!permitted(session,surgery)) return Response.json({error:'Documento não disponível.'},{status:404});
  const originalPath=doc.object_path.replace(/\.compact\.pdf$/,'');
  const {error:removeError}=await db.storage.from(BUCKET).remove([originalPath,originalPath+'.compact.pdf']);
  if(removeError) throw removeError;
  const {error:deleteError}=await db.from('surgery_documents').delete().eq('id',id);
  if(deleteError) throw deleteError;
  return Response.json({ok:true});
 }catch(error){return failure(error)}
}


export const POST = secureMutation(handlePOST);
export const PATCH = secureMutation(handlePATCH);
export const DELETE = secureMutation(handleDELETE);
