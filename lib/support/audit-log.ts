import "server-only";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";
import { SUPPORT_ACTION_LABEL } from "./audit-labels";

// Consulta do registro do suporte (public.support_audit) com filtros, para comprovar quem fez o quê.
// Só leitura: o registro não tem como ser alterado nem apagado (veja a migração support_audit_append_only).
export const AUDIT_PAGE_SIZE = 25;
export const AUDIT_EXPORT_LIMIT = 5000;

export type AuditFilters = { staff: number | null; action: string | null; org: string | null; q: string | null; from: string | null; to: string | null; page: number };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const text = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

// Lê os filtros da URL sem confiar em nada: o que não for válido é ignorado.
export function parseAuditFilters(params: Record<string, string | string[] | undefined>): AuditFilters {
  const one = (key: string) => { const v = params[key]; return Array.isArray(v) ? v[0] : v; };
  const staff = Number(one("pessoa"));
  const action = one("acao");
  const from = one("de"), to = one("ate");
  const page = Number(one("pagina"));
  return {
    staff: Number.isSafeInteger(staff) && staff > 0 ? staff : null,
    action: action && action in SUPPORT_ACTION_LABEL ? action : null,
    org: text(one("organizacao"), 80),
    q: text(one("busca"), 80),
    from: from && DAY.test(from) ? from : null,
    to: to && DAY.test(to) ? to : null,
    page: Number.isSafeInteger(page) && page > 1 && page <= 10_000 ? page : 1,
  };
}

// Dias do filtro no horário de São Paulo (UTC-3).
export function dayStart(day: string) { return new Date(`${day}T00:00:00-03:00`).toISOString(); }
export function dayEnd(day: string) { return new Date(Date.parse(`${day}T00:00:00-03:00`) + 86_400_000).toISOString(); }

// % e _ no texto buscado valem como letras, não como curingas.
export function likePattern(value: string) { return `%${value.replace(/[\\%_]/g, c => `\\${c}`)}%`; }

export type AuditEntry = { id: number; created_at: string; staff_user_id: number; staffName: string; action: string; organization_id: string | null; organization: string | null; target: string | null; metadata: Record<string, unknown> };

export async function searchSupportAudit(filters: AuditFilters, options: { limit?: number; offset?: number } = {}) {
  const db = getSupabaseAdmin();
  let orgIds: string[] | null = null;
  if (filters.org) {
    const orgs = await db.from("organizations").select("id").ilike("name", likePattern(filters.org)).limit(200);
    dbError(orgs.error, "Find organizations for audit");
    const found: string[] = (orgs.data || []).map((o: { id: string }) => String(o.id));
    if (!found.length) return { entries: [] as AuditEntry[], total: 0 };
    orgIds = found;
  }
  const limit = options.limit ?? AUDIT_PAGE_SIZE;
  const offset = options.offset ?? (filters.page - 1) * AUDIT_PAGE_SIZE;
  let query = db.from("support_audit").select("id,created_at,staff_user_id,action,organization_id,target,metadata", { count: "exact" })
    .order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit - 1);
  if (filters.staff) query = query.eq("staff_user_id", filters.staff);
  if (filters.action) query = query.eq("action", filters.action);
  if (orgIds) query = query.in("organization_id", orgIds);
  if (filters.q) query = query.ilike("target", likePattern(filters.q));
  if (filters.from) query = query.gte("created_at", dayStart(filters.from));
  if (filters.to) query = query.lt("created_at", dayEnd(filters.to));
  const result = await query;
  dbError(result.error, "Search support audit");
  const rows = (result.data || []) as Omit<AuditEntry, "staffName" | "organization">[];
  const userIds = [...new Set(rows.map(r => Number(r.staff_user_id)))];
  const orgList = [...new Set(rows.map(r => r.organization_id).filter((v): v is string => Boolean(v)))];
  const [users, orgs] = await Promise.all([
    userIds.length ? db.from("users").select("id,name").in("id", userIds) : Promise.resolve({ data: [], error: null }),
    orgList.length ? db.from("organizations").select("id,name").in("id", orgList) : Promise.resolve({ data: [], error: null }),
  ]);
  dbError(users.error, "Read audit names"); dbError(orgs.error, "Read audit organizations");
  const names = new Map<number, string>((users.data || []).map((u: { id: number; name: string | null }) => [Number(u.id), String(u.name || "")]));
  const orgNames = new Map<string, string>((orgs.data || []).map((o: { id: string; name: string | null }) => [String(o.id), String(o.name || "")]));
  return {
    total: result.count ?? rows.length,
    entries: rows.map(r => ({ ...r, metadata: r.metadata || {}, staffName: names.get(Number(r.staff_user_id)) || `Usuário ${r.staff_user_id}`,
      organization: r.organization_id ? orgNames.get(r.organization_id) || r.organization_id : null })),
  };
}

// Quem já apareceu no registro ou está na equipe (inclusive quem saiu): opções do filtro "Pessoa".
export async function auditPeople() {
  const db = getSupabaseAdmin();
  const staff = await db.from("platform_staff").select("user_id,active");
  dbError(staff.error, "Read staff for audit filter");
  const ids = (staff.data || []).map((s: { user_id: number }) => Number(s.user_id));
  if (!ids.length) return [];
  const users = await db.from("users").select("id,name").in("id", ids);
  dbError(users.error, "Read staff names for audit filter");
  const active = new Map((staff.data || []).map((s: { user_id: number; active: boolean }) => [Number(s.user_id), s.active]));
  const people: { id: number; name: string; active: boolean }[] = (users.data || []).map((u: { id: number; name: string | null }) =>
    ({ id: Number(u.id), name: String(u.name || `Usuário ${u.id}`), active: active.get(Number(u.id)) === true }));
  return people.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// CSV para guardar como comprovação (separador ";" para abrir direto no Excel em português).
export function auditCsv(entries: AuditEntry[]) {
  const cell = (value: unknown) => {
    let text = value == null ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; // evita fórmula ao abrir na planilha
    return `"${text.replace(/"/g, '""')}"`;
  };
  const header = ["Data e hora (UTC)", "Pessoa do suporte", "ID da pessoa", "Ação", "Código da ação", "Organização", "ID da organização", "Alvo", "Detalhes"];
  const lines = entries.map(e => [e.created_at, e.staffName, e.staff_user_id, SUPPORT_ACTION_LABEL[e.action] || e.action, e.action,
    e.organization || "", e.organization_id || "", e.target || "", Object.keys(e.metadata).length ? JSON.stringify(e.metadata) : ""].map(cell).join(";"));
  return "﻿" + [header.map(cell).join(";"), ...lines].join("\r\n") + "\r\n";
}
