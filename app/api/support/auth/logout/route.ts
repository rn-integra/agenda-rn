import { cookies } from "next/headers";
import { secureMutation } from "@/lib/security/http";
import { SUPPORT_COOKIE, supportTokenHash } from "@/lib/support/staff";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";

// Sai do console do suporte (só a sessão do console; não mexe em nenhuma conta de clínica).
async function logout() {
  const tokenHash = await supportTokenHash();
  if (tokenHash) {
    const result = await getSupabaseAdmin().from("support_sessions").delete().eq("token_hash", tokenHash);
    dbError(result.error, "Delete support session");
  }
  (await cookies()).set(SUPPORT_COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  return new Response(null, { status: 204 });
}

export const POST = secureMutation(logout, { allowAssisted: true });
