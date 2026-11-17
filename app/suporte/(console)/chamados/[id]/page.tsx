import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSupportPage } from "@/lib/support/staff";
import { loadTicket } from "@/lib/support/tickets";
import { CATEGORY_LABEL, SUPPORT_STATUS_LABEL } from "@/lib/support/ticket-rules";
import { ROLE_LABEL } from "@/lib/support/organizations";
import TicketThread from "@/components/ticket-thread";
import { StatusBadge } from "@/app/ajuda/ui";
import { Card, PageHeader, dateTime } from "../../ui";
import { SupportReply } from "./reply-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chamado — Suporte RN Integra", robots: { index: false, follow: false } };

// Um chamado no console: conversa, contexto técnico enviado pelo app e a resposta do suporte.
export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSupportPage();
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) notFound();
  const data = await loadTicket(Number(id));
  if (!data) notFound();
  const { ticket, messages } = data;
  const context = ticket.context || {};
  const facts: [string, React.ReactNode][] = [
    ["Organização", <Link key="org" href={`/suporte/organizacoes/${ticket.organization_id}`} className="font-medium text-[#12857f] hover:underline">{ticket.organization}</Link>],
    ["Aberto por", `${ticket.author}${context.role ? ` (${ROLE_LABEL[context.role] || context.role})` : ""}`],
    ["Responsável no suporte", ticket.assignee ? `${ticket.assignee}${ticket.assigned_at ? ` · desde ${dateTime.format(new Date(ticket.assigned_at))}` : ""}` : "Sem responsável (fica com quem responder primeiro)"],
    ["Tela de origem", context.page || "—"],
    ["Navegador", context.browser || "—"],
    ["Versão do sistema", context.version || "—"],
    ["Aberto em", dateTime.format(new Date(ticket.created_at))],
  ];

  return <>
    <Link href="/suporte/chamados" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" aria-hidden="true" />Chamados</Link>
    <PageHeader title={ticket.subject} text={`#${ticket.id} · ${CATEGORY_LABEL[ticket.category]}`}>
      <StatusBadge status={ticket.status} label={SUPPORT_STATUS_LABEL[ticket.status]} />
    </PageHeader>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card><TicketThread messages={messages} viewer="support" /></Card>
        <Card title="Responder" text="A clínica vê a resposta na página de Ajuda do app."><SupportReply ticketId={ticket.id} status={ticket.status} /></Card>
      </div>
      <Card title="Contexto" text="Enviado automaticamente pelo app, sem dados de pacientes." className="self-start">
        <dl className="space-y-3 text-sm">{facts.map(([label, value]) => <div key={label}>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="mt-0.5 break-words text-slate-800">{value}</dd>
        </div>)}</dl>
      </Card>
    </div>
  </>;
}
