import Link from "next/link";
import { requireSupportPage } from "@/lib/support/staff";
import { loadMonitor } from "@/lib/support/monitor";
import { ticketCounts } from "@/lib/support/tickets";
import { SUPPORT_ACTION_LABEL } from "@/lib/support/audit-labels";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";
import { Card, Empty, PageHeader, Stat, dateTime } from "./ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suporte — RN Integra", robots: { index: false, follow: false } };

const ACTIONS = SUPPORT_ACTION_LABEL;
// Só as últimas atividades: o histórico completo, com filtros, fica em /suporte/registro.
const RECENT_ACTIVITY = 5;

// Visão geral do console: estado do sistema, equipe e o que o suporte fez por último.
export default async function SupportHome() {
  await requireSupportPage();
  const db = getSupabaseAdmin();
  const [monitor, staff, audit, tickets] = await Promise.all([
    loadMonitor(),
    db.from("support_staff").select("id,name,email,active,mfa_enabled_at,created_at").order("created_at"),
    db.from("support_audit").select("id,staff_id,action,target,created_at").order("created_at", { ascending: false }).limit(RECENT_ACTIVITY),
    ticketCounts(),
  ]);
  dbError(staff.error, "Read support staff"); dbError(audit.error, "Read support audit");
  // Contas do suporte (tabela pequena): as ativas formam a equipe; as inativas ainda dão nome ao registro.
  const accounts = (staff.data || []) as { id: number; name: string; email: string; active: boolean; mfa_enabled_at: string | null }[];
  const members = accounts.filter(a => a.active);
  const entries = (audit.data || []) as { id: number; staff_id: number; action: string; target: string | null; created_at: string }[];
  const people = new Map(accounts.map(a => [Number(a.id), a]));
  const withMfa = members.filter(m => m.mfa_enabled_at).length;
  const tone = monitor.status.tone === "ok" ? "ok" : monitor.status.tone;

  return <>
    <PageHeader title="Visão geral" text="Situação do sistema e atividade da equipe de suporte." />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Link href="/suporte/monitoramento" className="rounded-2xl transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12857f]">
        <Stat label="Sistema" tone={tone} value={monitor.status.label} hint="Ver monitoramento →" />
      </Link>
      <Stat label="Incidentes abertos" value={monitor.open.length} hint={monitor.open.length ? `${monitor.open.filter(i => i.severity === "critical" || i.severity === "error").length} crítico(s) ou erro(s)` : "Nenhum no momento"} />
      <Stat label="Equipe de suporte" value={members.length} hint={withMfa === members.length ? "Todos com 2FA ativo" : `${members.length - withMfa} sem 2FA ativo`} />
      <Link href="/suporte/chamados" className="rounded-2xl transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12857f]">
        <Stat label="Chamados para responder" tone={tickets.active ? "warning" : "ok"} value={tickets.active} hint={`${tickets.waiting} aguardando cliente · ver fila →`} />
      </Link>
    </div>

    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <Card title="Equipe de suporte" text="Contas com acesso a este console.">
        <ul className="divide-y divide-slate-100">
          {members.map(member => {
            const name = member.name;
            return <li key={member.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#eaf3f1] text-sm font-semibold text-[#12857f]">{name.split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase()}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{name}</span><span className="block truncate text-xs text-slate-500">{member.email}</span></span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${member.mfa_enabled_at ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{member.mfa_enabled_at ? "2FA ativo" : "2FA pendente"}</span>
            </li>;
          })}
        </ul>
      </Card>

      <Card title="Registro de atividades" text="Últimas ações da equipe. O registro não pode ser alterado nem apagado.">
        {entries.length === 0 ? <Empty>Nenhuma atividade registrada.</Empty> :
          <ol className="relative space-y-4 border-l border-slate-200 pl-5">
            {entries.map(entry => <li key={entry.id} className="relative">
              <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-white bg-[#12857f]" aria-hidden="true" />
              <p className="text-sm text-slate-700"><span className="font-medium text-slate-900">{people.get(Number(entry.staff_id))?.name || `Suporte ${entry.staff_id}`}</span> {ACTIONS[entry.action] || entry.action}</p>
              {entry.target && <p className="mt-0.5 truncate text-xs text-slate-500">{entry.target}</p>}
              <time className="mt-0.5 block text-xs text-slate-400" dateTime={entry.created_at}>{dateTime.format(new Date(entry.created_at))}</time>
            </li>)}
          </ol>}
        <Link href="/suporte/registro" className="mt-4 inline-flex text-sm font-medium text-[#12857f] hover:underline">Ver registro completo →</Link>
      </Card>
    </div>
  </>;
}
