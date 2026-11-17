import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/app/authz";
import SiteHeader from "@/components/site-header";
import TicketThread from "@/components/ticket-thread";
import { canSeeTicket, loadTicket } from "@/lib/support/tickets";
import { CATEGORY_LABEL } from "@/lib/support/ticket-rules";
import { StatusBadge, helpDateTime, panel } from "../ui";
import { CustomerReply } from "./reply-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chamado — RN Integra" };

// Um chamado visto pela clínica: conversa com o suporte, resposta e "marcar como resolvido".
export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ novo?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/entrar");
  const { id } = await params;
  const { novo } = await searchParams;
  if (!/^\d{1,12}$/.test(id)) notFound();
  const data = await loadTicket(Number(id));
  if (!data || !canSeeTicket(session, data.ticket)) notFound();
  const { ticket, messages } = data;

  return <div className="rn-hub">
    <SiteHeader account={session.account} services={session.services} />
    <main className="hub-content">
      <div className="mx-auto max-w-3xl">
        <Link href="/ajuda" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" aria-hidden="true" />Ajuda e suporte</Link>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-semibold tracking-tight text-slate-900">{ticket.subject}</h1>
            <p className="mt-1 text-sm text-slate-500">#{ticket.id} · {CATEGORY_LABEL[ticket.category]} · aberto por {ticket.author} em {helpDateTime.format(new Date(ticket.created_at))}</p>
          </div>
          <StatusBadge status={ticket.status} />
        </div>
        {novo && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Chamado enviado. A resposta do suporte aparece aqui.</p>}
        <section className={panel}>
          <TicketThread messages={messages} viewer="customer" />
        </section>
        <section className={`${panel} mt-4`}>
          <CustomerReply ticketId={ticket.id} resolved={ticket.status === "resolved"} />
        </section>
      </div>
    </main>
  </div>;
}
