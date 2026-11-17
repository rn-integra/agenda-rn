import { cookies } from "next/headers";
import { ASSIST_COOKIE, ASSIST_TOKEN } from "@/app/authz";
import { hashToken } from "@/app/passwords";
import { secureMutation } from "@/lib/security/http";
import { supportAudit } from "@/lib/support/audit";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";

// Saída do acesso assistido: apaga a sessão assistida e o cookie. É a única gravação que passa
// enquanto o acesso assistido vale (allowAssisted), e também limpa um cookie que já perdeu a validade.
async function end() {
  const store = await cookies();
  const token = store.get(ASSIST_COOKIE)?.value;
  store.set(ASSIST_COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  let redirect = "/suporte/organizacoes";
  if (token && ASSIST_TOKEN.test(token)) {
    const removed = await getSupabaseAdmin().from("sessions").delete().eq("token_hash", await hashToken(token))
      .not("support_grant_id", "is", null).select("organization_id,support_staff_id");
    dbError(removed.error, "End assisted session");
    const row = removed.data?.[0];
    if (row?.support_staff_id) {
      await supportAudit(Number(row.support_staff_id), "assist_end", { organizationId: row.organization_id });
      redirect = `/suporte/organizacoes/${row.organization_id}`;
    }
  }
  return Response.json({ ok: true, redirect });
}

export const POST = secureMutation(end, { allowAssisted: true });
