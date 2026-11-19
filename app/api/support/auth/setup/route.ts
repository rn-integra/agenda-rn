import { hashPassword, hashToken } from "@/app/passwords";
import { HttpError, readJson, secureMutation } from "@/lib/security/http";
import { clearLimit, consumeLimit } from "@/lib/security/rate-limit";
import { SUPPORT_LOGIN_LIMITS, SUPPORT_SETUP_TOKEN, startSupportSession } from "@/lib/support/staff";
import { supportAudit } from "@/lib/support/audit";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";

// Link de primeiro acesso (ou de nova senha) do suporte: a própria pessoa cria a senha.
// O link é de uso único e vem da equipe da plataforma (public.support_staff_invite).
async function setup(request: Request) {
  const data = await readJson(request, 2048);
  if (process.env.VERCEL === "1") await consumeLimit("support-setup-ip", request.headers.get("x-vercel-forwarded-for") || "unknown", 10, 3600);
  const token = typeof data.token === "string" ? data.token : "";
  const password = typeof data.password === "string" ? data.password : "";
  if (!SUPPORT_SETUP_TOKEN.test(token)) throw new HttpError(400, "Link inválido. Peça um novo à equipe da plataforma.");
  if (password.length < 12 || password.length > 128) throw new HttpError(400, "A senha precisa ter de 12 a 128 caracteres.");
  const credentials = await hashPassword(password);
  const result = await getSupabaseAdmin().rpc("support_staff_setup", { p_token_hash: await hashToken(token), p_hash: credentials.hash, p_salt: credentials.salt });
  dbError(result.error, "Use support setup link");
  if (result.data == null) throw new HttpError(400, "Este link venceu ou já foi usado. Peça um novo à equipe da plataforma.");
  const staffId = Number(result.data);
  // Quem recebeu um link novo não precisa esperar o bloqueio por senha errada acabar.
  const owner = await getSupabaseAdmin().from("support_staff").select("email").eq("id", staffId).maybeSingle();
  dbError(owner.error, "Read support account");
  const email = owner.data?.email ? String(owner.data.email) : "";
  if (email) await Promise.all(SUPPORT_LOGIN_LIMITS.map(({ scope }) => clearLimit(scope, email)));
  await supportAudit(staffId, "password_set");
  await startSupportSession(staffId);
  return Response.json({ ok: true, next: "/suporte/verificar" });
}

export const POST = secureMutation(setup, { allowAssisted: true });
