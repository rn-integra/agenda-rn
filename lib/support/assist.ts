import "server-only";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";

// Acesso assistido (fase 5): a gerência libera o suporte por um tempo; enquanto valer, alguém da
// equipe abre uma sessão só de leitura, vendo o sistema como a gerência que liberou.
export const ASSIST_HOURS = [1, 4, 24] as const;
// Cada entrada do suporte dura no máximo 2 h (ou até a liberação acabar, o que vier antes).
export const ASSIST_SESSION_HOURS = 2;

export type Grant = {
  id: number; organization_id: string; granted_by: number; reason: string | null;
  created_at: string; expires_at: string; revoked_at: string | null; revoked_by: number | null;
};
const GRANT_COLUMNS = "id,organization_id,granted_by,reason,created_at,expires_at,revoked_at,revoked_by";

export function grantActive(grant: Pick<Grant, "expires_at" | "revoked_at"> | null | undefined, now = Date.now()) {
  return Boolean(grant && !grant.revoked_at && Date.parse(grant.expires_at) > now);
}

export async function activeGrant(organizationId: string) {
  const result = await getSupabaseAdmin().from("support_access_grants").select(GRANT_COLUMNS)
    .eq("organization_id", organizationId).is("revoked_at", null).gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  dbError(result.error, "Read support grant");
  return (result.data as Grant | null) ?? null;
}

// Encerra a liberação e derruba na hora as sessões assistidas abertas com ela.
export async function revokeGrant(grantId: number, revokedBy: number) {
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const revoked = await db.from("support_access_grants").update({ revoked_at: now, revoked_by: revokedBy })
    .eq("id", grantId).is("revoked_at", null).select("id");
  dbError(revoked.error, "Revoke support grant");
  const sessions = await db.from("sessions").delete().eq("support_grant_id", grantId);
  dbError(sessions.error, "End assisted sessions");
  return Boolean(revoked.data?.length);
}

// Registro que a gerência vê: liberações e tudo o que o suporte fez nesta organização.
export async function organizationSupportLog(organizationId: string) {
  const db = getSupabaseAdmin();
  const [grants, audit] = await Promise.all([
    db.from("support_access_grants").select(GRANT_COLUMNS).eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(8),
    db.from("support_audit").select("id,staff_id,action,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(8),
  ]);
  dbError(grants.error, "Read support grants"); dbError(audit.error, "Read support audit for organization");
  const grantRows = (grants.data || []) as Grant[];
  const auditRows = (audit.data || []) as { id: number; staff_id: number; action: string; created_at: string }[];
  // Quem liberou é da clínica (users); quem agiu é do suporte (support_staff).
  const userIds = [...new Set(grantRows.flatMap(g => [g.granted_by, g.revoked_by]).filter((v): v is number => v != null).map(Number))];
  const staffIds = [...new Set(auditRows.map(a => Number(a.staff_id)))];
  const [users, staff] = await Promise.all([
    userIds.length ? db.from("users").select("id,name").in("id", userIds) : Promise.resolve({ data: [], error: null }),
    staffIds.length ? db.from("support_staff").select("id,name").in("id", staffIds) : Promise.resolve({ data: [], error: null }),
  ]);
  dbError(users.error, "Read support log names"); dbError(staff.error, "Read support staff names");
  const toMap = (rows: { id: number; name: string | null }[] | null) => new Map<number, string>((rows || []).map(r => [Number(r.id), String(r.name || "")]));
  const names = toMap(users.data), staffNames = toMap(staff.data);
  return {
    grants: grantRows.map(g => ({ ...g, grantedByName: names.get(Number(g.granted_by)) || "—", revokedByName: g.revoked_by ? names.get(Number(g.revoked_by)) || "—" : null })),
    actions: auditRows.map(a => ({ ...a, staffName: staffNames.get(Number(a.staff_id)) || "Equipe RN Integra" })),
  };
}
