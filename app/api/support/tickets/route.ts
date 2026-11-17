import { z } from "zod";
import { HttpError, readJson, secureMutation } from "@/lib/security/http";
import { consumeLimit } from "@/lib/security/rate-limit";
import { requireSupportApi } from "@/lib/support/staff";
import { supportAudit } from "@/lib/support/audit";
import { addTicketMessage, loadTicket } from "@/lib/support/tickets";
import { BODY_MAX, TICKET_STATUSES } from "@/lib/support/ticket-rules";

const body = z.object({
  ticketId: z.number().int().positive(),
  message: z.string().trim().max(BODY_MAX).optional(),
  status: z.enum(TICKET_STATUSES),
}).strict();

// Resposta do suporte e/ou mudança de status de um chamado. Fica no registro de atividades.
async function act(request: Request) {
  const context = await requireSupportApi();
  const staffId = context.session.account.id;
  await consumeLimit("support-ticket-action", String(staffId), 120, 3600);
  const parsed = body.safeParse(await readJson(request, 16 * 1024));
  if (!parsed.success) throw new HttpError(400, "Resposta inválida.");
  const { ticketId, message, status } = parsed.data;
  const data = await loadTicket(ticketId);
  if (!data) throw new HttpError(404, "Chamado não encontrado.");
  const { ticket } = data;
  if (!message && status === ticket.status) throw new HttpError(400, "Escreva uma resposta ou mude o status.");
  await addTicketMessage(ticket, { authorId: staffId, fromSupport: true, body: message || null, status });
  await supportAudit(staffId, message ? "ticket_reply" : "ticket_status", {
    organizationId: ticket.organization_id, target: `#${ticket.id} ${ticket.subject}`.slice(0, 200),
    metadata: { from: ticket.status, to: status },
  });
  return Response.json({ ok: true });
}

export const POST = secureMutation(act);
