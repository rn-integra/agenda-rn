import { HttpError, readJson, secureMutation } from "@/lib/security/http";
import { requireSupportApi } from "@/lib/support/staff";
import { supportAudit } from "@/lib/support/audit";
import { environment } from "@/lib/monitor/report";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";

const SNOOZE_HOURS = [1, 4, 24, 72];

// Ações sobre um incidente aberto: marcar como resolvido, silenciar o aviso por um tempo ou reativar.
async function act(request: Request) {
  const context = await requireSupportApi();
  const body = await readJson(request, 1024);
  const id = Number(body.id), action = String(body.action || "");
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "Incidente inválido.");
  let values: Record<string, string | null>, metadata: Record<string, unknown> = {};
  if (action === "resolve") values = { resolved_at: new Date().toISOString() };
  else if (action === "unsnooze") values = { snoozed_until: null };
  else if (action === "snooze") {
    const hours = Number(body.hours);
    if (!SNOOZE_HOURS.includes(hours)) throw new HttpError(400, "Escolha 1, 4, 24 ou 72 horas.");
    values = { snoozed_until: new Date(Date.now() + hours * 3600_000).toISOString() };
    metadata = { hours };
  } else throw new HttpError(400, "Ação inválida.");
  const result = await getSupabaseAdmin().from("monitor_incidents").update(values)
    .eq("id", id).eq("environment", environment()).is("resolved_at", null).select("id,title,organization_id");
  dbError(result.error, "Update incident");
  const incident = result.data?.[0];
  if (!incident) throw new HttpError(404, "Incidente não encontrado ou já resolvido.");
  await supportAudit(context.session.account.id, `incident_${action}`, {
    organizationId: incident.organization_id, target: `#${incident.id} ${String(incident.title).slice(0, 150)}`, metadata });
  return Response.json({ ok: true });
}

export const POST = secureMutation(act);
