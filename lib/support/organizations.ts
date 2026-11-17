import "server-only";
import { LOGIN_FAILURE_LIMITS, limitStatus } from "@/lib/security/rate-limit";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";

// Dados que o suporte vê das organizações: cadastro, equipe e acessos. Nunca pacientes,
// agenda ou faturamento (LGPD: só o necessário para dar suporte).

export const KIND_LABEL: Record<string, string> = {
  MANAGEMENT_COMPANY: "Empresa de gestão de agendas", CLINIC: "Clínica", SOLO_DOCTOR: "Médico autônomo",
};
export const ROLE_LABEL: Record<string, string> = { general_manager: "Gerente geral", secretary: "Secretária", doctor: "Médico" };

type Org = { id: string; name: string; kind: string; active: boolean; created_at: string; account_id: string };
type Membership = { organization_id: string; user_id: number; role: string; active: boolean; created_at: string };
type User = { id: number; name: string; email: string; active: boolean; email_verified_at: string | null };

// Último login de cada pessoa (registro de segurança "login_success").
async function lastLogins(userIds: number[]) {
  const map = new Map<number, string>();
  if (!userIds.length) return map;
  const { data, error } = await getSupabaseAdmin().from("security_events").select("actor_user_id,created_at")
    .eq("kind", "login_success").in("actor_user_id", userIds).order("created_at", { ascending: false }).limit(2000);
  dbError(error, "Read last logins");
  for (const row of (data || []) as { actor_user_id: number; created_at: string }[]) {
    if (!map.has(Number(row.actor_user_id))) map.set(Number(row.actor_user_id), row.created_at);
  }
  return map;
}

export function matchesSearch(text: string, query: string) {
  const fold = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return fold(text).includes(fold(query.trim()));
}

export async function listOrganizations(query = "") {
  const db = getSupabaseAdmin();
  const [orgs, members, accounts] = await Promise.all([
    db.from("organizations").select("id,name,kind,active,created_at,account_id").order("created_at", { ascending: false }).limit(1000),
    db.from("organization_memberships").select("organization_id,user_id,role,active,created_at").eq("active", true).limit(10000),
    db.from("accounts").select("id,owner_user_id").limit(1000),
  ]);
  dbError(orgs.error, "Read organizations"); dbError(members.error, "Read memberships"); dbError(accounts.error, "Read accounts");
  const memberships = (members.data || []) as Membership[];
  const owners = new Map<string, number>(((accounts.data || []) as { id: string; owner_user_id: number }[]).map(a => [a.id, Number(a.owner_user_id)]));
  const ids = [...new Set([...memberships.map(m => Number(m.user_id)), ...owners.values()])];
  const users = ids.length ? await db.from("users").select("id,name,email,active,email_verified_at").in("id", ids) : { data: [], error: null };
  dbError(users.error, "Read users");
  const people = new Map<number, User>(((users.data || []) as User[]).map(u => [Number(u.id), u]));
  const logins = await lastLogins(ids);
  const rows = ((orgs.data || []) as Org[]).map(org => {
    const team = memberships.filter(m => m.organization_id === org.id);
    const owner = people.get(owners.get(org.account_id) ?? -1) ?? null;
    const last = team.map(m => logins.get(Number(m.user_id))).filter(Boolean).sort().at(-1) ?? null;
    return { ...org, members: team.length, owner: owner && { name: owner.name, email: owner.email }, lastLogin: last };
  });
  if (!query.trim()) return rows;
  return rows.filter(row => matchesSearch([row.name, row.owner?.name, row.owner?.email].filter(Boolean).join(" "), query));
}

export async function loadOrganization(id: string) {
  const db = getSupabaseAdmin();
  const org = await db.from("organizations").select("id,name,kind,active,created_at,account_id").eq("id", id).maybeSingle();
  dbError(org.error, "Read organization");
  if (!org.data) return null;
  const [account, members, invites, events] = await Promise.all([
    db.from("accounts").select("id,name,owner_user_id,plan,status,max_organizations").eq("id", org.data.account_id).maybeSingle(),
    db.from("organization_memberships").select("organization_id,user_id,role,active,created_at").eq("organization_id", id).order("created_at"),
    db.from("auth_tokens").select("id,email,role,created_at,expires_at").eq("kind", "invite").eq("organization_id", id)
      .is("used_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }),
    db.from("security_events").select("id,kind,actor_user_id,created_at").eq("organization_id", id).order("created_at", { ascending: false }).limit(15),
  ]);
  dbError(account.error, "Read account"); dbError(members.error, "Read memberships"); dbError(invites.error, "Read invites"); dbError(events.error, "Read security events");
  const memberships = (members.data || []) as Membership[];
  const ids = [...new Set([...memberships.map(m => Number(m.user_id)), ...((events.data || []) as { actor_user_id: number | null }[]).map(e => Number(e.actor_user_id)).filter(Boolean)])];
  const users = ids.length ? await db.from("users").select("id,name,email,active,email_verified_at").in("id", ids) : { data: [], error: null };
  dbError(users.error, "Read users");
  const people = new Map<number, User>(((users.data || []) as User[]).map(u => [Number(u.id), u]));
  const logins = await lastLogins(memberships.map(m => Number(m.user_id)));
  const team = await Promise.all(memberships.map(async m => {
    const user = people.get(Number(m.user_id));
    const email = (user?.email || "").toLowerCase();
    const locks = email ? await Promise.all(LOGIN_FAILURE_LIMITS.map(l => limitStatus(l.scope, email, l.limit))) : [];
    const blocked = locks.filter(l => l.blocked);
    return {
      userId: Number(m.user_id), role: m.role, membershipActive: m.active, since: m.created_at,
      name: user?.name || `Usuário ${m.user_id}`, email: user?.email || "", userActive: user?.active ?? false,
      emailVerified: Boolean(user?.email_verified_at), lastLogin: logins.get(Number(m.user_id)) ?? null,
      failures: Math.max(0, ...locks.map(l => l.hits)), blockedUntil: blocked.map(l => l.until).filter(Boolean).sort().at(-1) ?? null,
    };
  }));
  const owner = account.data ? people.get(Number(account.data.owner_user_id)) ?? null : null;
  return {
    org: org.data as Org,
    account: account.data as { id: string; name: string; owner_user_id: number; plan: string; status: string; max_organizations: number } | null,
    ownerId: account.data ? Number(account.data.owner_user_id) : null, ownerName: owner?.name ?? null,
    team,
    invites: (invites.data || []) as { id: string; email: string; role: string; created_at: string; expires_at: string }[],
    events: ((events.data || []) as { id: number; kind: string; actor_user_id: number | null; created_at: string }[])
      .map(e => ({ ...e, actor: e.actor_user_id ? people.get(Number(e.actor_user_id))?.name ?? `Usuário ${e.actor_user_id}` : null })),
  };
}

export async function membershipInOrganization(organizationId: string, userId: number) {
  const db = getSupabaseAdmin();
  const member = await db.from("organization_memberships").select("user_id").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle();
  dbError(member.error, "Read membership");
  if (!member.data) return null;
  const user = await db.from("users").select("id,name,email,active").eq("id", userId).maybeSingle();
  dbError(user.error, "Read user");
  return (user.data as { id: number; name: string; email: string; active: boolean } | null) ?? null;
}
