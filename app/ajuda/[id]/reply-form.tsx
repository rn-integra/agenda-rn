"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BODY_MAX, looksLikeCpf } from "@/lib/support/ticket-rules";
import { field } from "../ui";

// Resposta de quem está na clínica. Responder um chamado resolvido o reabre.
export function CustomerReply({ ticketId, resolved }: { ticketId: number; resolved: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cpfWarning = looksLikeCpf(message);

  async function send(resolve: boolean) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/help/reply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, ...(message.trim() ? { message } : {}), ...(resolve ? { resolve: true } : {}) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar.");
      setMessage("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar.");
    } finally { setBusy(false); }
  }

  return <form onSubmit={event => { event.preventDefault(); if (message.trim()) void send(false); }} className="space-y-3">
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{resolved ? "Precisa de mais alguma coisa? Escreva para reabrir o chamado." : "Responder"}</span>
      <textarea className={`${field} min-h-28 resize-y`} value={message} onChange={e => setMessage(e.target.value)} maxLength={BODY_MAX}
        placeholder="Escreva sua mensagem. Não inclua dados de pacientes." />
    </label>
    {cpfWarning && <p className="text-xs text-red-700">Parece haver um CPF no texto. Remova-o antes de enviar.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      {!resolved && <button type="button" disabled={busy || cpfWarning} onClick={() => { if (window.confirm("Marcar este chamado como resolvido?")) void send(true); }}
        className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">Marcar como resolvido</button>}
      <button type="submit" disabled={busy || cpfWarning || !message.trim()}
        className="h-10 rounded-xl bg-[#12857f] px-4 text-sm font-semibold text-white hover:bg-[#0f726d] disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Enviando…" : resolved ? "Reabrir e enviar" : "Enviar"}</button>
    </div>
  </form>;
}
