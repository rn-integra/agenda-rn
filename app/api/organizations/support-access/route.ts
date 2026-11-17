import { z } from "zod";
import { getSession } from "@/app/authz";
import { HttpError, readJson, secureMutation } from "@/lib/security/http";
import { consumeLimit } from "@/lib/security/rate-limit";
import { ASSIST_HOURS, activeGrant, revokeGrant } from "@/lib/support/assist";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("grant"), hours: z.number().refine(h => (ASSIST_HOURS as readonly number[]).includes(h)), reason: z.string().trim().max(200).optional() }).strict(),
  z.object({ action: z.literal("revoke") }).strict(),
]);

// A gerência libera (ou encerra) o acesso assistido do suporte RN Integra à organização ativa.
// Uma nova liberação substitui a anterior; encerrar derruba na hora quem estiver dentro.
async function act(request: Request) {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Entre novamente.");
  if (session.account.role !== "general_manager") throw new HttpError(403, "Somente a gerência libera o acesso do suporte.");
  await consumeLimit("support-access-grant", String(session.account.id), 20, 3600);
  const parsed = body.safeParse(await readJson(request, 2048));
  if (!parsed.success) throw new HttpError(400, "Escolha 1, 4 ou 24 horas.");
  const organizationId = session.organization.id;
  const current = await activeGrant(organizationId);

  if (parsed.data.action === "revoke") {
    if (current) await revokeGrant(current.id, session.account.id);
    return Response.json({ ok: true, message: "Acesso do suporte encerrado." });
  }

  if (current) await revokeGrant(current.id, session.account.id);
  const now = Date.now();
  const inserted = await getSupabaseAdmin().from("support_access_grants").insert({
    organization_id: organizationId, granted_by: session.account.id, reason: parsed.data.reason || null,
    created_at: new Date(now).toISOString(), expires_at: new Date(now + parsed.data.hours * 3600_000).toISOString(),
  }).select("id,expires_at").single();
  dbError(inserted.error, "Create support grant");
  return Response.json({ ok: true, expiresAt: inserted.data!.expires_at });
}

export const POST = secureMutation(act);
