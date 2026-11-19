import { hashPassword, verifyPassword } from "@/app/passwords";
import { readJson, secureMutation } from "@/lib/security/http";
import { consumeLimit, refundLimit } from "@/lib/security/rate-limit";
import { SUPPORT_LOGIN_LIMITS, startSupportSession } from "@/lib/support/staff";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";

// Login do console do suporte: só contas de public.support_staff (contas de clínica não entram aqui).
// Depois da senha, o console ainda pede o código do autenticador (/suporte/verificar).

async function login(request: Request) {
  const data = await readJson(request, 4096);
  const refuse = () => Response.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
  if (typeof data.email !== "string" || typeof data.password !== "string" || data.email.length > 254 || data.password.length > 128 || data.password.length < 12) return refuse();
  const email = data.email.trim().toLowerCase(), password = data.password;
  if (process.env.VERCEL === "1") await consumeLimit("support-login-ip", request.headers.get("x-vercel-forwarded-for") || "unknown", 20, 900);
  // Cada tentativa é reservada antes de conferir a senha e devolvida quando ela está certa.
  for (const { scope, limit, seconds, message } of SUPPORT_LOGIN_LIMITS) await consumeLimit(scope, email, limit, seconds, message);
  const found = await getSupabaseAdmin().from("support_staff").select("id,active,password_hash,password_salt").eq("email", email).maybeSingle();
  dbError(found.error, "Read support account");
  const staff = found.data;
  if (!staff?.active || !staff.password_hash || !staff.password_salt) {
    await hashPassword(password); // mesmo tempo de resposta para conta inexistente
    return refuse();
  }
  if (!await verifyPassword(password, staff.password_hash, staff.password_salt)) return refuse();
  await Promise.all(SUPPORT_LOGIN_LIMITS.map(({ scope }) => refundLimit(scope, email)));
  await startSupportSession(Number(staff.id));
  return Response.json({ ok: true, next: "/suporte/verificar" });
}

// Rotas de conta do suporte não mexem em dados de clínica: valem mesmo com acesso assistido aberto.
export const POST = secureMutation(login, { allowAssisted: true, blockTrapped: true });
