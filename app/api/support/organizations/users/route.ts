import { z } from "zod";
import { HttpError, readJson, secureMutation } from "@/lib/security/http";
import { LOGIN_FAILURE_LIMITS, clearLimit, consumeLimit } from "@/lib/security/rate-limit";
import { requireSupportApi } from "@/lib/support/staff";
import { supportAudit } from "@/lib/support/audit";
import { membershipInOrganization } from "@/lib/support/organizations";
import { appOrigin, emailConfigured, emails, newEmailToken, sendMail } from "@/lib/email";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";

const body = z.object({
  organizationId: z.string().uuid(),
  userId: z.number().int().positive(),
  action: z.enum(["unlock", "end_sessions", "reset_link"]),
}).strict();

// Ações do suporte sobre uma pessoa de uma organização. Nenhuma mostra ou define senha:
// desbloquear o login, encerrar as sessões abertas ou mandar o link de nova senha para o e-mail dela.
async function act(request: Request) {
  const context = await requireSupportApi();
  const staffId = context.session.account.id;
  await consumeLimit("support-user-action", String(staffId), 30, 3600);
  const parsed = body.safeParse(await readJson(request, 1024));
  if (!parsed.success) throw new HttpError(400, "Ação inválida.");
  const { organizationId, userId, action } = parsed.data;
  const user = await membershipInOrganization(organizationId, userId);
  if (!user) throw new HttpError(404, "Pessoa não encontrada nesta organização.");
  const email = user.email.trim().toLowerCase();
  let message: string;

  if (action === "unlock") {
    await Promise.all(LOGIN_FAILURE_LIMITS.map(({ scope }) => clearLimit(scope, email)));
    message = "Login desbloqueado. A pessoa já pode tentar de novo.";
  } else if (action === "end_sessions") {
    if (userId === staffId) throw new HttpError(400, "Para encerrar a sua própria sessão, use Sair.");
    const result = await getSupabaseAdmin().from("sessions").delete().eq("user_id", userId).select("id");
    dbError(result.error, "End sessions");
    message = `${result.data?.length ?? 0} sessão(ões) encerrada(s). A pessoa precisará entrar de novo.`;
  } else {
    if (!emailConfigured()) throw new HttpError(409, "O envio de e-mail não está configurado neste ambiente.");
    if (!user.active) throw new HttpError(409, "A conta está desativada.");
    await consumeLimit("support-reset-link", String(userId), 3, 3600, "Já enviamos links demais para esta pessoa. Aguarde 1 hora.");
    const { token, hash } = newEmailToken();
    const reset = await getSupabaseAdmin().rpc("request_password_reset", { p_email: email, p_token_hash: hash });
    if (reset.error || !reset.data) throw new HttpError(500, "Não foi possível gerar o link.");
    await sendMail(emails.reset(user.email, user.name || "", `${appOrigin(request)}/redefinir-senha?token=${token}`));
    message = "Link de nova senha enviado para o e-mail da pessoa. Ele vale por 1 hora.";
  }

  await supportAudit(staffId, `user_${action}`, { organizationId, target: `${user.name} (usuário ${userId})` });
  return Response.json({ ok: true, message });
}

export const POST = secureMutation(act);
