// Peças visuais da área de ajuda (lado da clínica).
import { STATUS_LABEL, type TicketStatus } from "@/lib/support/ticket-rules";

export const helpDateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

const STATUS_TONE: Record<TicketStatus, string> = {
  open: "bg-slate-100 text-slate-700",
  in_progress: "bg-sky-50 text-sky-800",
  waiting_customer: "bg-amber-50 text-amber-800",
  resolved: "bg-emerald-50 text-emerald-700",
};

export function StatusBadge({ status, label }: { status: TicketStatus; label?: string }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[status]}`}>{label ?? STATUS_LABEL[status]}</span>;
}

export const panel = "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)]";
export const field = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#12857f] focus:ring-2 focus:ring-[#12857f]/20";
