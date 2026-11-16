import { secureMutation } from "@/lib/security/http";
import { consumeLimit } from "@/lib/security/rate-limit";
import { requireSupportApi } from "@/lib/support/staff";
import { supportAudit } from "@/lib/support/audit";
import { runMonitor } from "@/lib/monitor/runner";

export const maxDuration = 60;

// "Rodar agora": a mesma rodada do cron, disparada pelo console (no máximo 3 a cada 10 min).
async function run() {
  const context = await requireSupportApi();
  await consumeLimit("support-monitor-run", String(context.session.account.id), 3, 600, "O monitor acabou de rodar. Aguarde alguns minutos.");
  const summary = await runMonitor();
  const result = { ok: summary.ok, counts: summary.counts, repaired: summary.repaired.length, resolved: summary.resolved };
  await supportAudit(context.session.account.id, "monitor_run", { metadata: result });
  return Response.json(result);
}

export const POST = secureMutation(run);
