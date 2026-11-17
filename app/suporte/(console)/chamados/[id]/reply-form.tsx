"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BODY_MAX, SUPPORT_STATUS_LABEL, TICKET_STATUSES, type TicketStatus } from "@/lib/support/ticket-rules";

const field = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#12374f] focus:ring-2 focus:ring-[#12374f]/15";

// Resposta do suporte. Ao responder, o status sugerido é "Aguardando cliente"; dá para só mudar o status.
export function SupportReply({ ticketId, status }: { ticketId: number; status: TicketStatus }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [next, setNext] = useState<TicketStatus>(status === "resolved" ? "resolved" : "waiting_customer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changesNothing = !message.trim() && next === status;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (changesNothing) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/support/tickets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, status: next, ...(message.trim() ? { message } : {}) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar.");
      setMessage("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar.");
    } finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="space-y-3">
    <textarea className={`${field} min-h-32 resize-y`} value={message} onChange={e => setMessage(e.target.value)} maxLength={BODY_MAX}
      aria-label="Resposta" placeholder="Escreva a resposta para a clínica." />
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex flex-wrap items-center justify-end gap-2">
      <label className="flex items-center gap-2 text-sm text-slate-600">Status
        <select value={next} onChange={e => setNext(e.target.value as TicketStatus)} className="h-10 rounded-xl border border-slate-300 bg-white px-2 text-sm">
          {TICKET_STATUSES.map(value => <option key={value} value={value}>{SUPPORT_STATUS_LABEL[value]}</option>)}
        </select>
      </label>
      <button type="submit" disabled={busy || changesNothing}
        className="h-10 rounded-xl bg-[#12374f] px-4 text-sm font-semibold text-white hover:bg-[#0d2a3d] disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? "Enviando…" : message.trim() ? "Enviar resposta" : "Mudar status"}
      </button>
    </div>
  </form>;
}
