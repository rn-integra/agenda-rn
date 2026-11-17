import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, LifeBuoy, ShieldCheck } from "lucide-react";
import { getSession } from "@/app/authz";
import SiteHeader from "@/components/site-header";
import { listTicketsForSession } from "@/lib/support/tickets";
import { CATEGORY_LABEL } from "@/lib/support/ticket-rules";
import { NewTicketForm } from "./new-ticket-form";
import { AssistControls } from "./assist-controls";
import { grantActive, organizationSupportLog } from "@/lib/support/assist";
import { supportActionLabel } from "@/lib/support/audit-labels";
import { StatusBadge, helpDateTime, panel } from "./ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ajuda — RN Integra" };

// Ajuda e suporte: abrir um chamado para a equipe da RN Integra e acompanhar as respostas.
// A gerência vê os chamados de toda a organização; as demais pessoas, só os que abriram.
export default async function HelpPage({ searchParams }: { searchParams: Promise<{ de?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/entrar");
  const { de } = await searchParams;
  const manager = session.account.role === "general_manager";
  const [tickets, log] = await Promise.all([listTicketsForSession(session), manager ? organizationSupportLog(session.organization.id) : null]);
  const current = log?.grants.find(g => grantActive(g)) ?? null;
  const answered = tickets.filter(t => t.status === "waiting_customer").length;

  return <div className="rn-hub">
    <SiteHeader account={session.account} services={session.services} />
    <main className="hub-content">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#eaf3f1] text-[#12857f]"><LifeBuoy className="size-6" aria-hidden="true" /></span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Ajuda e suporte</h1>
            <p className="mt-1 text-sm text-slate-500">Fale com a equipe da RN Integra. As respostas chegam aqui, e você acompanha cada chamado nesta página.</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <section className={panel}>
            <h2 className="text-base font-semibold text-slate-900">Novo chamado</h2>
            <p className="mb-4 mt-0.5 text-sm text-slate-500">Descreva o que aconteceu ou o que você precisa.</p>
            <NewTicketForm from={typeof de === "string" ? de : null} />
          </section>

          <section className={panel}>
            <header className="mb-4">
              <h2 className="text-base font-semibold text-slate-900">{manager ? "Chamados da organização" : "Seus chamados"}</h2>
              <p className="mt-0.5 text-sm text-slate-500">{answered
                ? `${answered} ${answered === 1 ? "chamado respondido" : "chamados respondidos"} pelo suporte.`
                : manager ? "Todos os chamados abertos pela equipe desta organização." : "Os chamados que você abriu nesta organização."}</p>
            </header>
            {tickets.length === 0
              ? <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Nenhum chamado ainda.</p>
              : <ul className="divide-y divide-slate-100">{tickets.map(ticket => <li key={ticket.id}>
                <Link href={`/ajuda/${ticket.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-slate-50">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-slate-900">{ticket.subject}</span>
                      {ticket.status === "waiting_customer" && <span className="size-2 shrink-0 rounded-full bg-amber-500" title="Nova resposta" />}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      #{ticket.id} · {CATEGORY_LABEL[ticket.category]}{manager ? ` · ${ticket.author}` : ""} · {helpDateTime.format(new Date(ticket.last_message_at))}
                    </span>
                  </span>
                  <StatusBadge status={ticket.status} />
                  <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
                </Link>
              </li>)}</ul>}
          </section>
        </div>

        {log && <section className={`${panel} mt-6`}>
          <header className="mb-4 flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700"><ShieldCheck className="size-5" aria-hidden="true" /></span>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Acesso assistido</h2>
              <p className="mt-0.5 text-sm text-slate-500">Quando precisar, libere a equipe da RN Integra para ver o sistema como você vê, somente leitura e pelo tempo que escolher. Você pode encerrar a qualquer momento, e tudo o que o suporte fizer fica registrado abaixo.</p>
            </div>
          </header>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <AssistControls active={current ? { expiresAt: current.expires_at, grantedBy: current.grantedByName, reason: current.reason } : null} />
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Registro do suporte nesta organização</h3>
              {log.actions.length === 0 && log.grants.length === 0
                ? <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">O suporte ainda não fez nada nesta organização.</p>
                : <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto pr-1 text-sm">{[
                  ...log.actions.map(a => ({ key: `a${a.id}`, at: a.created_at, text: <><span className="font-medium text-slate-800">{a.staffName}</span> <span className="text-slate-500">(suporte)</span> {supportActionLabel(a.action)}</> })),
                  ...log.grants.map(g => ({ key: `g${g.id}`, at: g.created_at, text: <><span className="font-medium text-slate-800">{g.grantedByName}</span> liberou o acesso até {helpDateTime.format(new Date(g.expires_at))}{g.revoked_at ? ` (encerrado por ${g.revokedByName} em ${helpDateTime.format(new Date(g.revoked_at))})` : ""}</> })),
                ].sort((a, b) => b.at.localeCompare(a.at)).map(item => <li key={item.key} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="text-slate-600">{item.text}</span>
                  <time className="shrink-0 text-xs text-slate-400" dateTime={item.at}>{helpDateTime.format(new Date(item.at))}</time>
                </li>)}</ul>}
            </div>
          </div>
        </section>}
      </div>
    </main>
  </div>;
}
