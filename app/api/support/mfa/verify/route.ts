import { HttpError, readJson, secureMutation } from "@/lib/security/http";
import { consumeLimit, refundLimit } from "@/lib/security/rate-limit";
import { requireSupportApi } from "@/lib/support/staff";
import { decryptMfaSecret } from "@/lib/support/mfa-crypto";
import { matchTotp } from "@/lib/support/totp";
import { supportAudit } from "@/lib/support/audit";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";

// Confere o código de 6 dígitos (5 erros em 15 min bloqueiam; o acerto devolve a tentativa). Na primeira vez, ativa o 2FA; depois, libera o console nesta sessão.
async function verify(request: Request) {
  const context = await requireSupportApi({ mfa: false });
  const body = await readJson(request, 1024);
  const code = String(body.code ?? "").replace(/\s/g, "");
  if (!context.secretEnc) throw new HttpError(409, "Configure o autenticador primeiro.");
  const userId = context.session.account.id;
  await consumeLimit("support-mfa-verify", String(userId), 5, 900, "Muitos códigos incorretos. Aguarde 15 minutos.");
  const step = await matchTotp(await decryptMfaSecret(context.secretEnc, userId), code, context.lastStep);
  if (step === null) throw new HttpError(400, "Código incorreto ou expirado.");
  const db = getSupabaseAdmin();
  // Grava o intervalo usado só se for mais novo que o último: duas chamadas com o mesmo código não passam.
  const used = await db.from("platform_staff")
    .update({ mfa_last_step: step, ...(context.mfaEnabled ? {} : { mfa_enabled_at: new Date().toISOString() }) })
    .eq("user_id", userId).or(`mfa_last_step.is.null,mfa_last_step.lt.${step}`).select("user_id");
  dbError(used.error, "Use MFA step");
  if (!used.data?.length) throw new HttpError(400, "Código incorreto ou expirado.");
  const session = await db.from("sessions").update({ mfa_verified_at: new Date().toISOString() }).eq("token_hash", context.tokenHash);
  dbError(session.error, "Mark session MFA");
  await refundLimit("support-mfa-verify", String(userId));
  await supportAudit(userId, context.mfaEnabled ? "mfa_verified" : "mfa_enabled");
  return Response.json({ ok: true });
}

export const POST = secureMutation(verify);
