import "server-only";
import { notFound, redirect } from "next/navigation";
import { getSession, sessionTokenHash, type Session } from "@/app/authz";
import { HttpError } from "@/lib/security/http";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";

// A confirmação do código vale por 12 h dentro da mesma sessão; depois, pede de novo.
export const SUPPORT_MFA_HOURS = 12;

export type SupportContext = {
  session: Session; tokenHash: string;
  mfaEnabled: boolean;      // autenticador já configurado (primeiro código confirmado)
  mfaVerified: boolean;     // código confirmado nesta sessão, dentro do prazo
  secretEnc: string | null; lastStep: number | null;
};

export function mfaStillValid(verifiedAt: string | null | undefined, now = Date.now()) {
  if (!verifiedAt) return false;
  const at = Date.parse(verifiedAt);
  return Number.isFinite(at) && at <= now + 60_000 && now - at < SUPPORT_MFA_HOURS * 3600_000;
}

// Quem é da equipe de suporte (lista fechada em public.platform_staff) e em que ponto está o 2FA.
// Devolve null para quem não é da equipe: as rotas respondem "não encontrado" e não revelam o console.
export async function supportContext(session: Session | null): Promise<SupportContext | null> {
  if (!session) return null;
  const tokenHash = await sessionTokenHash();
  if (!tokenHash) return null;
  const db = getSupabaseAdmin();
  const staff = await db.from("platform_staff").select("mfa_secret_enc,mfa_enabled_at,mfa_last_step")
    .eq("user_id", session.account.id).eq("active", true).maybeSingle();
  dbError(staff.error, "Read platform staff");
  if (!staff.data) return null;
  const current = await db.from("sessions").select("mfa_verified_at").eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  dbError(current.error, "Read session MFA");
  if (!current.data) return null;
  const mfaEnabled = Boolean(staff.data.mfa_enabled_at && staff.data.mfa_secret_enc);
  return {
    session, tokenHash, mfaEnabled,
    mfaVerified: mfaEnabled && mfaStillValid(current.data.mfa_verified_at),
    secretEnc: staff.data.mfa_secret_enc ?? null,
    lastStep: staff.data.mfa_last_step == null ? null : Number(staff.data.mfa_last_step),
  };
}

// Páginas do console: sem login vai para /entrar; quem não é da equipe vê 404; sem o código, /suporte/verificar.
export async function requireSupportPage(options: { mfa?: boolean } = {}) {
  const session = await getSession();
  if (!session) redirect("/entrar");
  const context = await supportContext(session);
  if (!context) notFound();
  if (options.mfa !== false && !context.mfaVerified) redirect("/suporte/verificar");
  return context;
}

// Rotas de API do console: mesmas regras, em forma de erro HTTP.
export async function requireSupportApi(options: { mfa?: boolean } = {}) {
  const context = await supportContext(await getSession());
  if (!context) throw new HttpError(404, "Não encontrado.");
  if (options.mfa !== false && !context.mfaVerified) throw new HttpError(403, "Confirme o código do autenticador.");
  return context;
}
