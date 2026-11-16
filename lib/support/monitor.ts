import "server-only";
import { environment } from "@/lib/monitor/report";
import { PLAYBOOKS } from "@/lib/monitor/playbook";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";

export type Severity = "critical" | "error" | "warning" | "info";
export type IncidentRow = {
  id: number; source: string; severity: Severity; title: string; detail: string | null; route: string | null; playbook: string | null;
  auto_fix: string | null; organization_id: string | null; occurrences: number; first_seen: string; last_seen: string;
  alerted_at: string | null; resolved_at: string | null; snoozed_until: string | null;
};
export type Heartbeat = { name: string; last_run_at: string; ok: boolean };

// Quanto tempo sem rodar já é atraso: o monitor roda a cada 15 min; a manutenção, 1x por dia.
export const HEARTBEAT_LIMITS: Record<string, { label: string; minutes: number }> = {
  monitor: { label: "Monitor", minutes: 45 },
  maintenance: { label: "Manutenção diária", minutes: 26 * 60 },
};
export const SEVERITY_RANK: Record<Severity, number> = { critical: 4, error: 3, warning: 2, info: 1 };

export function heartbeatLate(beat: Heartbeat | undefined, name: string, now = Date.now()) {
  return !beat || now - Date.parse(beat.last_run_at) > HEARTBEAT_LIMITS[name].minutes * 60_000;
}

export function overallStatus(open: Pick<IncidentRow, "severity">[], heartbeats: Heartbeat[], now = Date.now()) {
  const worst = Math.max(0, ...open.map(i => SEVERITY_RANK[i.severity] ?? 0));
  const monitorLate = heartbeatLate(heartbeats.find(h => h.name === "monitor"), "monitor", now);
  if (worst >= 4) return { tone: "critical" as const, label: "Problema crítico", text: "Há incidente crítico aberto. Veja abaixo o que fazer." };
  if (worst === 3) return { tone: "error" as const, label: "Requer atenção", text: "Há erros abertos que precisam de análise." };
  if (monitorLate) return { tone: "warning" as const, label: "Monitor sem rodar", text: "A última verificação está atrasada; o quadro pode estar desatualizado." };
  if (worst === 2) return { tone: "warning" as const, label: "Pontos de atenção", text: "Nada grave, mas há avisos abertos." };
  return { tone: "ok" as const, label: "Tudo certo", text: "Nenhum problema aberto e o monitor está rodando." };
}

// Últimos 14 dias: incidentes que apareceram em cada dia (fuso de São Paulo).
export function dailyCounts(rows: Pick<IncidentRow, "first_seen">[], now = Date.now(), days = 14) {
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
  const buckets = Array.from({ length: days }, (_, i) => ({ day: format.format(now - (days - 1 - i) * 86_400_000), count: 0 }));
  const index = new Map(buckets.map((b, i) => [b.day, i]));
  for (const row of rows) { const i = index.get(format.format(Date.parse(row.first_seen))); if (i !== undefined) buckets[i].count++; }
  return buckets;
}

export function playbookFor(id: string | null) {
  return id ? PLAYBOOKS.find(p => p.id === id) ?? null : null;
}

const COLUMNS = "id,source,severity,title,detail,route,playbook,auto_fix,organization_id,occurrences,first_seen,last_seen,alerted_at,resolved_at,snoozed_until";

// Tudo o que a aba de monitoramento mostra, só do ambiente em que o console está rodando.
export async function loadMonitor(now = Date.now()) {
  const db = getSupabaseAdmin(), env = environment();
  const since = new Date(now - 14 * 86_400_000).toISOString();
  const [open, recent, beats] = await Promise.all([
    db.from("monitor_incidents").select(COLUMNS).eq("environment", env).is("resolved_at", null).order("last_seen", { ascending: false }).limit(100),
    db.from("monitor_incidents").select(COLUMNS).eq("environment", env).gte("first_seen", since).order("first_seen", { ascending: false }).limit(500),
    db.from("monitor_heartbeats").select("name,last_run_at,ok"),
  ]);
  dbError(open.error, "Read open incidents"); dbError(recent.error, "Read recent incidents"); dbError(beats.error, "Read heartbeats");
  const openRows = ((open.data || []) as IncidentRow[])
    .sort((a, b) => (SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]) || Date.parse(b.last_seen) - Date.parse(a.last_seen));
  const recentRows = (recent.data || []) as IncidentRow[];
  const heartbeats = (beats.data || []) as Heartbeat[];
  return {
    env, now, open: openRows, heartbeats,
    status: overallStatus(openRows, heartbeats, now),
    daily: dailyCounts(recentRows, now),
    repaired: recentRows.filter(r => r.auto_fix === "repaired").slice(0, 20),
    resolved: recentRows.filter(r => r.resolved_at && r.auto_fix !== "repaired")
      .sort((a, b) => Date.parse(b.resolved_at!) - Date.parse(a.resolved_at!)).slice(0, 20),
  };
}
