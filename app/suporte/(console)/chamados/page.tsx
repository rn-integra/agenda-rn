import Link from "next/link";
import { requireSupportPage } from "@/lib/support/staff";
import { QUEUE_FILTERS, listTicketQueue, ticketCounts, type QueueFilter } from "@/lib/support/tickets";
import { CATEGORY_LABEL, SUPPORT_STATUS_LABEL } from "@/lib/support/ticket-rules";
import { StatusBadge } from "@/app/ajuda/ui";
import { Card, Empty, PageHeader, ago } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chamados — Suporte RN Integra", robots: { index: false, follow: false } };

const TABS: { id: QueueFilter; label: string }[] = [
  { id: "ativos", label: "Para responder" }, { id: "aguardando", label: "Aguardando cliente" },
  { id: "resolvidos", label: "Resolvidos" }, { id: "todos", label: "Todos" },
];

// Fila de chamados das clínicas. "Para responder" são os novos e os em andamento.
export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  await requireSupportPage();
  const { filtro } = await searchParams;
  const filter: QueueFilter = filtro && filtro in QUEUE_FILTERS ? filtro as QueueFilter : "ativos";
  const [tickets, counts] = await Promise.all([listTicketQueue(filter), ticketCounts()]);
  const badge: Partial<Record<QueueFilter, number>> = { ativos: counts.active, aguardando: counts.waiting };

  return <>
    <PageHeader title="Chamados" text="Pedidos de ajuda enviados pelas clínicas pelo botão Ajuda do app." />
    <nav aria-label="Filtrar chamados" className="mb-4 flex flex-wrap gap-2">
      {TABS.map(tab => <Link key={tab.id} href={tab.id === "ativos" ? "/suporte/chamados" : `/suporte/chamados?filtro=${tab.id}`}
        aria-current={filter === tab.id ? "page" : undefined}
        className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium ${filter === tab.id ? "border-[#12374f] bg-[#12374f] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
        {tab.label}{badge[tab.id] ? <span className={`rounded-full px-1.5 text-xs ${filter === tab.id ? "bg-white/20" : "bg-slate-100"}`}>{badge[tab.id]}</span> : null}
      </Link>)}
    </nav>
    <Card>
      {tickets.length === 0 ? <Empty>Nenhum chamado aqui.</Empty> :
        <ul className="divide-y divide-slate-100">{tickets.map(ticket => <li key={ticket.id}>
          <Link href={`/suporte/chamados/${ticket.id}`} className="-mx-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-2 py-3 hover:bg-slate-50">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                {ticket.last_message_from === "customer" && ticket.status !== "resolved" && <span className="size-2 shrink-0 rounded-full bg-[#12857f]" title="Última mensagem é da clínica" />}
                <span className="truncate font-medium text-slate-900">{ticket.subject}</span>
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">#{ticket.id} · {ticket.organization} · {ticket.author} · {CATEGORY_LABEL[ticket.category]}</span>
            </span>
            <span className="text-xs text-slate-500">{ticket.last_message_from === "customer" ? "Clínica" : "Suporte"} {ago(ticket.last_message_at)}</span>
            <StatusBadge status={ticket.status} label={SUPPORT_STATUS_LABEL[ticket.status]} />
          </Link>
        </li>)}</ul>}
    </Card>
  </>;
}
