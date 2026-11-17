import { z } from "zod";
import { getSession } from "@/app/authz";
import { HttpError, readJson, secureMutation } from "@/lib/security/http";
import { consumeLimit } from "@/lib/security/rate-limit";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";
import { BODY_MAX, SUBJECT_MAX, TICKET_CATEGORIES, browserSummary, looksLikeCpf, sanitizePath } from "@/lib/support/ticket-rules";

const body = z.object({
  subject: z.string().trim().min(3, "Escreva um assunto com pelo menos 3 letras.").max(SUBJECT_MAX),
  category: z.enum(TICKET_CATEGORIES),
  message: z.string().trim().min(10, "Conte um pouco mais (pelo menos 10 letras).").max(BODY_MAX),
  from: z.string().max(400).optional().nullable(),
}).strict();

// Abre um chamado para o suporte RN Integra a partir do botão "Ajuda".
// O contexto técnico vai junto, sem nada do paciente: tela (sem identificadores), papel, versão e navegador.
async function create(request: Request) {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Entre novamente para pedir ajuda.");
  await consumeLimit("help-ticket-create", String(session.account.id), 10, 3600, "Você abriu muitos chamados na última hora. Aguarde um pouco.");
  const parsed = body.safeParse(await readJson(request, 16 * 1024));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message || "Confira os campos.");
  const { subject, category, message, from } = parsed.data;
  if (looksLikeCpf(`${subject} ${message}`)) throw new HttpError(400, "Parece haver um CPF no texto. Remova dados de pacientes antes de enviar.");
  const context = {
    page: sanitizePath(from), role: session.account.role,
    version: (process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7),
    browser: browserSummary(request.headers.get("user-agent")),
  };
  const db = getSupabaseAdmin();
  const ticket = await db.from("support_tickets").insert({
    organization_id: session.organization.id, created_by: session.account.id, subject, category, context,
  }).select("id").single();
  dbError(ticket.error, "Create ticket");
  const first = await db.from("support_ticket_messages").insert({
    ticket_id: ticket.data!.id, author_user_id: session.account.id, from_support: false, body: message });
  dbError(first.error, "Write first ticket message");
  return Response.json({ ok: true, id: Number(ticket.data!.id) });
}

export const POST = secureMutation(create);
