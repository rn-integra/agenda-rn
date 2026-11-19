import "server-only";
import { trapStatus } from "@/lib/security/traps";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";

export const TRAP_KINDS = ["trap_triggered", "canary_key_used"] as const;
export const IP_HASH = /^[0-9a-f]{32}$/;
export type TrappedIp = { ipHash: string; hits: number; canary: boolean; lastPath: string | null; lastAgent: string | null; lastAt: string; blocked: boolean; until: string | null };
type TrapRow = { kind: string; target: string | null; details: { agent?: unknown } | null; ip_hash: string | null; created_at: string };

// Quem caiu nas armadilhas nas últimas 24 h, por IP (só o resumo do IP; o IP em si nunca é gravado).
export async function loadTraps(now = Date.now(), max = 15): Promise<TrappedIp[]> {
  const since = new Date(now - 86400_000).toISOString();
  const { data, error } = await getSupabaseAdmin().from("security_events").select("kind,target,details,ip_hash,created_at")
    .in("kind", [...TRAP_KINDS]).gte("created_at", since).order("created_at", { ascending: false }).limit(1000);
  dbError(error, "Read trap events");
  const groups = new Map<string, Omit<TrappedIp, "blocked" | "until">>();
  for (const row of (data || []) as TrapRow[]) {
    if (!row.ip_hash || !IP_HASH.test(row.ip_hash)) continue;
    const group = groups.get(row.ip_hash);
    if (group) { group.hits++; group.canary ||= row.kind === "canary_key_used"; continue; }
    if (groups.size >= max) continue;
    groups.set(row.ip_hash, { ipHash: row.ip_hash, hits: 1, canary: row.kind === "canary_key_used", lastPath: row.target,
      lastAgent: typeof row.details?.agent === "string" ? row.details.agent : null, lastAt: row.created_at });
  }
  return Promise.all([...groups.values()].map(async (group) => {
    const status = await trapStatus(group.ipHash).catch(() => ({ blocked: false, until: null }));
    return { ...group, blocked: status.blocked, until: status.until };
  }));
}
