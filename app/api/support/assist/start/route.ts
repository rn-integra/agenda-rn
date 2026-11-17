import { randomUUID } from "node:crypto";
import { z } from "zod";
import { cookies } from "next/headers";
import { ASSIST_COOKIE } from "@/app/authz";
import { hashToken } from "@/app/passwords";
import { HttpError, readJson, secureMutation } from "@/lib/security/http";
import { consumeLimit } from "@/lib/security/rate-limit";
import { requireSupportApi } from "@/lib/support/staff";
import { supportAudit } from "@/lib/support/audit";
import { ASSIST_SESSION_HOURS, activeGrant } from "@/lib/support/assist";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";

const body = z.object({ organizationId: z.string().uuid() }).strict();

// Entrada do suporte com acesso assistido: só com liberação ativa da gerência. Abre uma sessão
// em nome de quem liberou, marcada com quem do suporte está usando, e só de leitura.
async function start(request: Request) {
  const context = await requireSupportApi();
  const staffId = context.staff.id;
  await consumeLimit("support-assist-start", String(staffId), 10, 3600);
  const parsed = body.safeParse(await readJson(request, 1024));
  if (!parsed.success) throw new HttpError(400, "Organização inválida.");
  const { organizationId } = parsed.data;
  const grant = await activeGrant(organizationId);
  if (!grant) throw new HttpError(409, "A gerência desta organização não liberou o acesso do suporte, ou a liberação acabou.");

  const token = [randomUUID(), randomUUID(), randomUUID()].join("-");
  const expiresAt = new Date(Math.min(Date.parse(grant.expires_at), Date.now() + ASSIST_SESSION_HOURS * 3600_000));
  const created = await getSupabaseAdmin().from("sessions").insert({
    token_hash: await hashToken(token), user_id: grant.granted_by, organization_id: organizationId,
    expires_at: expiresAt.toISOString(), support_grant_id: grant.id, support_staff_id: staffId,
  });
  dbError(created.error, "Create assisted session");
  (await cookies()).set(ASSIST_COOKIE, token, { httpOnly: true, secure: true, sameSite: "strict", path: "/", expires: expiresAt });
  await supportAudit(staffId, "assist_start", { organizationId, target: `liberação ${grant.id}`, metadata: { grantId: grant.id, until: expiresAt.toISOString() } });
  return Response.json({ ok: true, redirect: "/hub" });
}

export const POST = secureMutation(start);
