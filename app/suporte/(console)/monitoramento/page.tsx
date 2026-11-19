import { requireSupportPage } from "@/lib/support/staff";
import { HEARTBEAT_LIMITS, heartbeatLate, loadMonitor, playbookFor, type IncidentRow } from "@/lib/support/monitor";
import { Banner, Card, Empty, PageHeader, SeverityBadge, Stat, ago, dateTime } from "../ui";
import { IncidentActions, RunMonitorButton } from "./actions";
import { TrapUnlockButton } from "./trap-actions";
import { alertChannels } from "@/lib/monitor/alert";
import { loadTraps } from "@/lib/support/traps";

export const dynamic = "force-dynamic";
export const metadata = { title: "Monitoramento — Suporte RN Integra", robots: { index: false, follow: false } };

const SOURCE: Record<string, string> = { server: "Servidor", client: "Navegador", check: "Verificação" };
const ENV: Record<string, string> = { production: "produção", preview: "preview", development: "desenvolvimento" };

function Explanation({ incident }: { incident: IncidentRow }) {
  const playbook = playbookFor(incident.playbook);
  if (playbook) return <dl className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
    <dt className="font-medium text-slate-500">Diagnóstico</dt><dd className="text-slate-700">{playbook.diagnosis}</dd>
    <dt className="font-medium text-slate-500">O que fazer</dt><dd className="text-slate-700">{playbook.action}</dd>
  </dl>;
  if (!incident.detail) return null;
  return <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-sans text-sm text-slate-700">{incident.detail}</pre>;
}

// Aba de monitoramento: o que o assistente do monitor encontrou, corrigiu e o que ainda precisa de alguém.
export default async function MonitorPage() {
  await requireSupportPage();
  const [data, traps] = await Promise.all([loadMonitor(), loadTraps()]);
  const channels = alertChannels();
  const now = data.now;
  const max = Math.max(1, ...data.daily.map(d => d.count));
  const repairedCount = data.repaired.length;

  return <>
    <PageHeader title="Monitoramento" text={`Verificações automáticas a cada 15 minutos · ambiente de ${ENV[data.env] || data.env}`}>
      <RunMonitorButton />
    </PageHeader>

    <Banner tone={data.status.tone} title={data.status.label}>{data.status.text}</Banner>
    {channels.length === 0 && <div className="mt-3"><Banner tone="warning" title="Os avisos não saem deste painel">
      Nenhum canal de aviso configurado: incidentes e armadilhas só aparecem aqui, para quem abrir o console. Para receber no
      celular, configure na Vercel (produção) ALERT_WEBHOOK_URL (Discord ou Slack) ou ALERT_EMAIL.
    </Banner></div>}

    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Object.entries(HEARTBEAT_LIMITS).map(([name, limit]) => {
        const beat = data.heartbeats.find(h => h.name === name);
        const late = heartbeatLate(beat, name, now);
        return <Stat key={name} label={limit.label} tone={late ? "warning" : beat?.ok === false ? "error" : "ok"}
          value={ago(beat?.last_run_at, now)} hint={late ? "Atrasado" : beat ? dateTime.format(new Date(beat.last_run_at)) : "Ainda não rodou"} />;
      })}
      <Stat label="Incidentes abertos" value={data.open.length} hint={`${data.open.filter(i => i.snoozed_until && Date.parse(i.snoozed_until) > now).length} silenciado(s)`} />
      <Stat label="Corrigidos sozinhos" value={repairedCount} hint="Nos últimos 14 dias" />
    </div>

    <Card title="Incidentes por dia" text="Problemas novos nos últimos 14 dias." className="mt-6">
      <div className="flex h-32 items-end gap-1.5" role="img" aria-label={`Incidentes por dia: ${data.daily.map(d => d.count).join(", ")}`}>
        {data.daily.map(day => <div key={day.day} className="group relative flex h-full flex-1 flex-col justify-end">
          <div className={`rounded-t-md ${day.count ? "bg-[#12857f]" : "bg-slate-100"}`} style={{ height: `${Math.max(4, (day.count / max) * 100)}%` }} />
          <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-xs text-white group-hover:block">{day.count}</span>
        </div>)}
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-400"><span>{day(data.daily[0]?.day)}</span><span>hoje</span></div>
    </Card>

    <section className="mt-6">
      <h2 className="mb-3 text-base font-semibold text-slate-900">Incidentes abertos</h2>
      {data.open.length === 0 ? <Empty>Nenhum incidente aberto. 🎉</Empty> :
        <ul className="space-y-3">
          {data.open.map(incident => {
            const snoozed = Boolean(incident.snoozed_until && Date.parse(incident.snoozed_until) > now);
            return <li key={incident.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={incident.severity} />
                <span className="text-xs text-slate-500">{SOURCE[incident.source] || incident.source}{incident.route ? ` · ${incident.route}` : ""}</span>
                {snoozed && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Aviso silenciado até {dateTime.format(new Date(incident.snoozed_until!))}</span>}
              </div>
              <h3 className="mt-2 font-semibold text-slate-900">{incident.title}</h3>
              <p className="mt-1 text-xs text-slate-500">{incident.occurrences}× · primeira vez {ago(incident.first_seen, now)} · última {ago(incident.last_seen, now)}</p>
              <Explanation incident={incident} />
              <div className="mt-4"><IncidentActions id={incident.id} snoozed={snoozed} /></div>
            </li>;
          })}
        </ul>}
    </section>

    <Card title="Armadilhas (últimas 24 h)" text="Robôs e IAs que procuraram caminhos-isca ou usaram a chave falsa. 3 caminhos-isca ou 1 uso da chave bloqueiam o IP por 24 h nas telas de entrada." className="mt-6">
      {traps.length === 0 ? <Empty>Ninguém caiu nas armadilhas nas últimas 24 h.</Empty> :
        <ul className="divide-y divide-slate-100">{traps.map(t => <li key={t.ipHash} className="flex items-start justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-slate-700">IP {t.ipHash.slice(0, 8)}…</span>
              {t.canary && <SeverityBadge severity="critical" />}
              {t.blocked ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Bloqueado{t.until ? ` até ${dateTime.format(new Date(t.until))}` : ""}</span>
                : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Não bloqueado</span>}
            </span>
            <span className="mt-0.5 block truncate text-slate-600">{t.hits}× · último: <span className="font-mono text-xs">{t.lastPath || "—"}</span> · {ago(t.lastAt, now)}</span>
            {t.lastAgent && <span className="block truncate text-xs text-slate-400">{t.lastAgent}</span>}
          </span>
          {t.blocked && <TrapUnlockButton ipHash={t.ipHash} />}
        </li>)}</ul>}
    </Card>

    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <Card title="Corrigido automaticamente" text="O monitor resolveu sozinho e conferiu que funcionou.">
        {data.repaired.length === 0 ? <Empty>Nada nos últimos 14 dias.</Empty> :
          <ul className="divide-y divide-slate-100">{data.repaired.map(r => <li key={r.id} className="py-2.5 text-sm first:pt-0 last:pb-0">
            <p className="font-medium text-slate-800">{r.title}</p>
            {r.detail && <p className="text-slate-500">{r.detail}</p>}
            <p className="text-xs text-slate-400">{dateTime.format(new Date(r.first_seen))}</p>
          </li>)}</ul>}
      </Card>
      <Card title="Resolvidos recentemente" text="Encerrados pelo monitor ou pela equipe.">
        {data.resolved.length === 0 ? <Empty>Nada nos últimos 14 dias.</Empty> :
          <ul className="divide-y divide-slate-100">{data.resolved.map(r => <li key={r.id} className="flex items-start justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
            <span className="min-w-0"><span className="block truncate font-medium text-slate-800">{r.title}</span><span className="text-xs text-slate-400">{r.occurrences}× · resolvido {ago(r.resolved_at, now)}</span></span>
            <SeverityBadge severity={r.severity} />
          </li>)}</ul>}
      </Card>
    </div>
  </>;
}

function day(iso?: string) {
  if (!iso) return "";
  const [, month, date] = iso.split("-");
  return `${date}/${month}`;
}
