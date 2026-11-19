import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {loadTs} from './load-ts.mjs';
import * as crypto from 'node:crypto';
const source=readFileSync(new URL('../app/api/documents/route.ts',import.meta.url),'utf8');
const DOC='11111111-1111-4111-8111-111111111111';
function fixture(session,doc=null){
 session=session&&{organization:{id:'org-1'},...session};
 const rows=[{id:'a',doctorId:'d1',patientId:'p',date:'2026-10-28',procedure:'Cirurgia',payment:{received_amount:1500},invoiceNumber:'NF-RESTRICTED',patientPrivate:{cpf:'00000000000'}},{id:'b',doctorId:'d2',patientId:'p'}];let allowed;
 const removed=[],queried=[];
 const db={storage:{from(){return {remove:async paths=>{removed.push(...paths);return {error:null}}}}},from(table){const filters={};const q={delete(){removed.push('metadata');return q},select(){return q},eq(k,v){filters[k]=v;return q},in(k,ids){allowed=ids;return q},order:async()=>({data:[{id:DOC,appointment_id:allowed[0]}]}),maybeSingle:async()=>({data:doc}),
  // appointments: só as linhas pedidas (por id ou paciente), no formato do banco.
  then(resolve,reject){const data=table==='appointments'?rows.filter(r=>(filters.id==null||r.id===filters.id)&&(filters.patient_id==null||r.patientId===filters.patient_id)).map(r=>({id:r.id,patient_id:r.patientId??null,professional_id:r.doctorId??null,anesthetist_id:r.anesthetistId??null,date:r.date??null,procedure:r.procedure??null})):[];queried.push({table,filters:{...filters}});return Promise.resolve({data,error:null}).then(resolve,reject)}};return q}};
 const exports=loadTs('app/api/documents/route.ts',{
  '@/app/authz':{getSession:async()=>session},
  '@/lib/supabase-admin':{getSupabaseAdmin:()=>db},
  '@/lib/agenda/store':{loadAgendaState:async()=>({state:{appointments:rows,cancelledAppointments:[]},revision:'2026-10-28T00:00:00.000Z'})},
  '@/lib/security/rate-limit':{consumeLimit:async()=>{}},
  '@/lib/compress-pdf':{compressPdf:async x=>({bytes:x,reason:'unchanged'})}
 });
 return {api:exports,ids:()=>allowed,removed,queried};
}
test('documents require a valid session',async()=>{const {api}=fixture(null);assert.equal((await api.GET(new Request('https://example.com/api/documents?appointmentId=a'))).status,401)});
test('patient documents include only surgeries in authorized agendas',async()=>{const f=fixture({account:{id:1,role:'secretary'},agendaIds:['d1']});const r=await f.api.GET(new Request('https://example.com/api/documents?patientId=p'));assert.equal(r.status,200);assert.deepEqual(Array.from(f.ids()),['a']);assert.equal((await r.json()).documents[0].surgery.id,'a')});
test('another surgery cannot be listed or receive uploads',async()=>{const {api}=fixture({account:{id:1,role:'doctor',doctorId:'d1'},services:{scheduling_enabled:true,billing_enabled:true,invoice_enabled:true},agendaIds:['d1']});assert.equal((await api.GET(new Request('https://example.com/api/documents?appointmentId=b'))).status,403);assert.equal((await api.POST(new Request('https://example.com/api/documents',{method:'POST',headers:{origin:'https://example.com','content-type':'application/json'},body:JSON.stringify({appointmentId:'b'})}))).status,403)});
test('invalid extensions and oversized uploads are rejected before storage',async()=>{const {api}=fixture({account:{id:1,role:'general_manager'},agendaIds:[]});for(const [name,size] of [['test.exe',10],['test.pdf',20971521]]){assert.equal((await api.POST(new Request('https://example.com/api/documents',{method:'POST',headers:{origin:'https://example.com','content-type':'application/json'},body:JSON.stringify({appointmentId:'a',name,size,category:'guide'})}))).status,400)}});
test('cross-origin writes are rejected',async()=>{const {api}=fixture(null);assert.equal((await api.POST(new Request('https://example.com/api/documents',{method:'POST',headers:{origin:'https://other.example'}}))).status,403)});
test('deletion requires confirmation and an accessible document',async()=>{const {api}=fixture({account:{id:1,role:'secretary'},agendaIds:['d1']});assert.equal((await api.DELETE(new Request('https://example.com/api/documents',{method:'DELETE',headers:{origin:'https://example.com','content-type':'application/json'},body:JSON.stringify({id:DOC})}))).status,400);assert.equal((await api.DELETE(new Request('https://example.com/api/documents',{method:'DELETE',headers:{origin:'https://example.com','content-type':'application/json'},body:JSON.stringify({id:DOC,confirmed:true})}))).status,404)});
test('authorized deletion removes storage and metadata; other agenda remains untouched',async()=>{for(const appointment_id of ['a','b']){const f=fixture({account:{id:1,role:'secretary'},agendaIds:['d1']},{id:DOC,appointment_id,object_path:'a/doc.pdf.compact.pdf'});const response=await f.api.DELETE(new Request('https://example.com/api/documents',{method:'DELETE',headers:{origin:'https://example.com','content-type':'application/json'},body:JSON.stringify({id:DOC,confirmed:true})}));assert.equal(response.status,appointment_id==='a'?200:404);assert.equal(f.removed.length,appointment_id==='a'?3:0)}});


test('document listing projects only the clinical heading, for every authorized role',async()=>{
 for(const account of [
  {account:{id:1,role:'general_manager'},agendaIds:[]},
  {account:{id:1,role:'secretary'},agendaIds:['d1']},
  {account:{id:1,role:'doctor',doctorId:'d1'},services:{scheduling_enabled:true,billing_enabled:false,invoice_enabled:false},agendaIds:['d1']}
 ]){
  const {api}=fixture(account);
  const r=await api.GET(new Request('https://example.com/api/documents?patientId=p'));
  assert.equal(r.status,200);
  const surgery=(await r.json()).documents[0].surgery;
  assert.deepEqual(surgery,{id:'a',date:'2026-10-28',procedure:'Cirurgia'});
  assert.equal(JSON.stringify(surgery).includes('NF-RESTRICTED'),false);
  assert.equal(JSON.stringify(surgery).includes('00000000000'),false);
 }
});
test('doctors without scheduling entitlement cannot list surgical documents',async()=>{
 const {api}=fixture({account:{id:1,role:'doctor',doctorId:'d1'},services:{scheduling_enabled:false,billing_enabled:true,invoice_enabled:true},agendaIds:['d1']});
 const r=await api.GET(new Request('https://example.com/api/documents?patientId=p'));
 assert.equal(r.status,401);
});

test('documentos: busca só o atendimento pedido, na organização da sessão, sem carregar a agenda inteira',async()=>{
 assert.doesNotMatch(source,/loadAgendaState/);
 const f=fixture({account:{id:1,role:'secretary'},agendaIds:['d1']});
 assert.equal((await f.api.GET(new Request('https://example.com/api/documents?appointmentId=a'))).status,200);
 assert.deepEqual(f.queried.filter(q=>q.table==='appointments').map(q=>q.filters),[{organization_id:'org-1',id:'a'}]);
});
test('documentos: identificador inválido responde 400, sem erro 500 nem alerta no monitor',async()=>{
 const {api}=fixture({account:{id:1,role:'general_manager'},agendaIds:[]});
 const send=(method,body)=>api[method](new Request('https://example.com/api/documents',{method,headers:{origin:'https://example.com','content-type':'application/json'},body:JSON.stringify(body)}));
 for(const id of [{a:1},'doc',42,null])assert.equal((await send('DELETE',{id,confirmed:true})).status,400,JSON.stringify(id));
 assert.equal((await send('PATCH',{id:{a:1}})).status,400);
 assert.equal((await api.GET(new Request('https://example.com/api/documents?id=nao-e-uuid'))).status,400);
});
