import { z } from "zod";
import { getSession } from "@/app/authz";
import { HttpError, readJson, secureMutation } from "@/lib/security/http";
import { consumeLimit } from "@/lib/security/rate-limit";
import { addTicketMessage, canSeeTicket, loadTicket } from "@/lib/support/tickets";
import { BODY_MAX, looksLikeCpf, statusAfterCustomerMessage } from "@/lib/support/ticket-rules";

const body = z.object({
  ticketId: z.number().int().positive(),
  message: z.string().trim().max(BODY_MAX).optional(),
  resolve: z.boolean().optional(),
}).strict();

// Resposta de quem está na clínica: escreve no chamado (e o reabre) ou o marca como resolvido.
async function reply(request: Request) {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Entre novamente.");
  await consumeLimit("help-ticket-reply", String(session.account.id), 60, 3600);
  const parsed = body.safeParse(await readJson(request, 16 * 1024));
  if (!parsed.success) throw new HttpError(400, "Mensagem inválida.");
  const { ticketId, message, resolve } = parsed.data;
  if (!message && !resolve) throw new HttpError(400, "Escreva uma mensagem.");
  if (message && looksLikeCpf(message)) throw new HttpError(400, "Parece haver um CPF no texto. Remova dados de pacientes antes de enviar.");
  const data = await loadTicket(ticketId);
  if (!data || !canSeeTicket(session, data.ticket)) throw new HttpError(404, "Chamado não encontrado.");
  const { ticket } = data;
  if (resolve && !message && ticket.status === "resolved") return Response.json({ ok: true });
  await addTicketMessage(ticket, {
    authorId: session.account.id, fromSupport: false, body: message || null,
    status: resolve ? "resolved" : statusAfterCustomerMessage(ticket.status),
  });
  return Response.json({ ok: true });
}

export const POST = secureMutation(reply);
