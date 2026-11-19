import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hashToken } from "@/app/passwords";
import { HttpError } from "@/lib/security/http";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";

// Conta do suporte: separada das contas das clínicas (public.support_staff), com login, cookie e sessão
// próprios. Quem é do suporte não tem organização, Hub nem agenda; só o console.
export const SUPPORT_COOKIE = "rn_support_session";
// Quatro UUIDs (147 caracteres): formato diferente da sessão comum e da sessão assistida.
export const SUPPORT_TOKEN = /^[0-9a-f-]{147}$/;
// Link de primeiro acesso: 64 caracteres hexadecimais (gerado por public.support_staff_invite).
export const SUPPORT_SETUP_TOKEN = /^[0-9a-f]{64}$/;
// A sessão do console e a confirmação do código valem por 12 h; depois, entra de novo.
export const SUPPORT_SESSION_HOURS = 12;
export const SUPPORT_MFA_HOURS = 12;
// Senha errada no login do console (por e-mail). O link novo de acesso (support_staff_invite) zera os dois.
export const SUPPORT_LOGIN_LIMITS = [
  { scope: "support-login-account", limit: 5, seconds: 900, message: "Muitas tentativas com senha errada. Aguarde 15 minutos." },
  { scope: "support-login-account-day", limit: 10, seconds: 86400, message: "Muitas tentativas com senha errada. A conta fica bloqueada por até 24 horas; para entrar antes, peça um novo link de acesso à equipe da plataforma." },
] as const;

export type SupportStaff = { id: number; email: string; name: string };
export type SupportContext = {
  staff: SupportStaff; tokenHash: string;
  mfaEnabled: boolean;      // autenticador já configurado (primeiro código confirmado)
  mfaVerified: boolean;     // código confirmado nesta sessão, dentro do prazo
  secretEnc: string | null; lastStep: number | null;
};

export function mfaStillValid(verifiedAt: string | null | undefined, now = Date.now()) {
  if (!verifiedAt) return false;
  const at = Date.parse(verifiedAt);
  return Number.isFinite(at) && at <= now + 60_000 && now - at < SUPPORT_MFA_HOURS * 3600_000;
}

export function newSupportToken() {
  return [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()].join("-");
}

// Hash do token do cookie do console, ou null quando ausente/malformado (sem consulta ao banco).
export async function supportTokenHash() {
  const token = (await cookies()).get(SUPPORT_COOKIE)?.value;
  return token && SUPPORT_TOKEN.test(token) ? hashToken(token) : null;
}

type StaffRow = { id: number; email: string; name: string; active: boolean; mfa_secret_enc: string | null; mfa_enabled_at: string | null; mfa_last_step: number | null };

// Sessão do console válida, com a conta do suporte ativa, e em que ponto está o 2FA. Sem isso, null.
export async function supportContext(): Promise<SupportContext | null> {
  const tokenHash = await supportTokenHash();
  if (!tokenHash) return null;
  const result = await getSupabaseAdmin().from("support_sessions")
    .select("mfa_verified_at,support_staff!inner(id,email,name,active,mfa_secret_enc,mfa_enabled_at,mfa_last_step)")
    .eq("token_hash", tokenHash).gt("expires_at", new Date().toISOString()).maybeSingle();
  dbError(result.error, "Read support session");
  const staff = (result.data?.support_staff ?? null) as unknown as StaffRow | null;
  if (!result.data || !staff?.active) return null;
  const mfaEnabled = Boolean(staff.mfa_enabled_at && staff.mfa_secret_enc);
  return {
    staff: { id: Number(staff.id), email: String(staff.email), name: String(staff.name) }, tokenHash, mfaEnabled,
    mfaVerified: mfaEnabled && mfaStillValid(result.data.mfa_verified_at as string | null),
    secretEnc: staff.mfa_secret_enc ?? null,
    lastStep: staff.mfa_last_step == null ? null : Number(staff.mfa_last_step),
  };
}

// Abre a sessão do console (depois da senha ou do primeiro acesso). O código do autenticador vem em seguida.
export async function startSupportSession(staffId: number) {
  const db = getSupabaseAdmin();
  const token = newSupportToken();
  const expiresAt = new Date(Date.now() + SUPPORT_SESSION_HOURS * 3600_000);
  // Limpeza ocasional de sessões vencidas.
  if (Math.random() < 0.1) await db.from("support_sessions").delete().lt("expires_at", new Date().toISOString()).then(() => undefined, () => undefined);
  const created = await db.from("support_sessions").insert({ token_hash: await hashToken(token), staff_id: staffId, expires_at: expiresAt.toISOString() });
  dbError(created.error, "Create support session");
  const seen = await db.from("support_staff").update({ last_login_at: new Date().toISOString() }).eq("id", staffId);
  dbError(seen.error, "Mark support login");
  (await cookies()).set(SUPPORT_COOKIE, token, { httpOnly: true, secure: true, sameSite: "strict", path: "/", expires: expiresAt });
}

// Páginas do console: sem sessão do suporte vai para /suporte/entrar; sem o código, /suporte/verificar.
export async function requireSupportPage(options: { mfa?: boolean } = {}) {
  const context = await supportContext();
  if (!context) redirect("/suporte/entrar");
  if (options.mfa !== false && !context.mfaVerified) redirect("/suporte/verificar");
  return context;
}

// Rotas de API do console: mesmas regras, em forma de erro HTTP.
export async function requireSupportApi(options: { mfa?: boolean } = {}) {
  const context = await supportContext();
  if (!context) throw new HttpError(401, "Entre no console do suporte.");
  if (options.mfa !== false && !context.mfaVerified) throw new HttpError(403, "Confirme o código do autenticador.");
  return context;
}
