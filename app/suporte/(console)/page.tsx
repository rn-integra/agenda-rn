import Link from "next/link";
import { requireSupportPage } from "@/lib/support/staff";
import { loadMonitor } from "@/lib/support/monitor";
import { ticketCounts } from "@/lib/support/tickets";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";
import { Card, Empty, PageHeader, Stat, dateTime } from "./ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suporte — RN Integra", robots: { index: false, follow: false } };

const ACTIONS: Record<string, string> = {
  mfa_enabled: "ativou a verificação em duas etapas",
  mfa_verified: "entrou no console",
  monitor_run: "rodou o monitor",
  incident_resolve: "marcou um incidente como resolvido",
  incident_snooze: "silenciou o aviso de um incidente",
  incident_unsnooze: "reativou o aviso de um incidente",
  organization_view: "abriu a ficha de uma organização",
  user_unlock: "desbloqueou o login de uma pessoa",
  user_end_sessions: "encerrou as sessões de uma pessoa",
  user_reset_link: "enviou um link de nova senha",
  ticket_reply: "respondeu um chamado",
  ticket_status: "mudou o status de um chamado",
};

// Visão geral do console: estado do sistema, equipe e o que o suporte fez por último.
export default async function SupportHome() {
  await requireSupportPage();
  const db = getSupabaseAdmin();
  const [monitor, staff, audit, tickets] = await Promise.all([
    loadMonitor(),
    db.from("platform_staff").select("user_id,mfa_enabled_at,created_at").eq("active", true).order("created_at"),
    db.from("support_audit").select("id,staff_user_id,action,target,created_at").order("created_at", { ascending: false }).limit(15),
    ticketCounts(),
  ]);
  dbError(staff.error, "Read platform staff"); dbError(audit.error, "Read support audit");
  const members = (staff.data || []) as { user_id: number; mfa_enabled_at: string | null }[];
  const entries = (audit.data || []) as { id: number; staff_user_id: number; action: string; target: string | null; created_at: string }[];
  const ids = [...new Set([...members.map(s => s.user_id), ...entries.map(a => a.staff_user_id)])];
  const users = ids.length ? await db.from("users").select("id,name,email").in("id", ids) : { data: [], error: null };
  dbError(users.error, "Read support users");
  const people = new Map<number, { name: string; email: string }>((users.data || []).map((u: { id: number; name: string; email: string }) => [Number(u.id), u]));
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
            const person = people.get(Number(member.user_id));
            const name = person?.name || `Usuário ${member.user_id}`;
            return <li key={member.user_id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#eaf3f1] text-sm font-semibold text-[#12857f]">{name.split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase()}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{name}</span><span className="block truncate text-xs text-slate-500">{person?.email}</span></span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${member.mfa_enabled_at ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{member.mfa_enabled_at ? "2FA ativo" : "2FA pendente"}</span>
            </li>;
          })}
        </ul>
      </Card>

      <Card title="Registro de atividades" text="Tudo o que a equipe faz fica registrado e não pode ser alterado nem apagado.">
        {entries.length === 0 ? <Empty>Nenhuma atividade registrada.</Empty> :
          <ol className="relative space-y-4 border-l border-slate-200 pl-5">
            {entries.map(entry => <li key={entry.id} className="relative">
              <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-white bg-[#12857f]" aria-hidden="true" />
              <p className="text-sm text-slate-700"><span className="font-medium text-slate-900">{people.get(Number(entry.staff_user_id))?.name || `Usuário ${entry.staff_user_id}`}</span> {ACTIONS[entry.action] || entry.action}</p>
              {entry.target && <p className="mt-0.5 truncate text-xs text-slate-500">{entry.target}</p>}
              <time className="mt-0.5 block text-xs text-slate-400" dateTime={entry.created_at}>{dateTime.format(new Date(entry.created_at))}</time>
            </li>)}
          </ol>}
      </Card>
    </div>
  </>;
}
