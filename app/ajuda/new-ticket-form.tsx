"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BODY_MAX, CATEGORY_LABEL, SUBJECT_MAX, TICKET_CATEGORIES, looksLikeCpf, type TicketCategory } from "@/lib/support/ticket-rules";
import { field } from "./ui";

export function NewTicketForm({ from }: { from: string | null }) {
  const router = useRouter();
  const [category, setCategory] = useState<TicketCategory>("duvida");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cpfWarning = looksLikeCpf(`${subject} ${message}`);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (cpfWarning) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/help/tickets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, category, message, from }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar. Tente de novo.");
      router.push(`/ajuda/${data.id}?novo=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar.");
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="space-y-4">
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-700">Sobre o que é?</legend>
      <div className="grid grid-cols-2 gap-2">
        {TICKET_CATEGORIES.map(value => <label key={value}
          className={`cursor-pointer rounded-xl border px-3 py-2 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#12857f]/30 ${category === value ? "border-[#12857f] bg-[#eaf3f1] font-medium text-[#0d6b66]" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
          <input type="radio" name="category" value={value} checked={category === value} onChange={() => setCategory(value)} className="sr-only" />
          {CATEGORY_LABEL[value]}
        </label>)}
      </div>
    </fieldset>
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">Assunto</span>
      <input className={field} value={subject} onChange={e => setSubject(e.target.value)} required minLength={3} maxLength={SUBJECT_MAX}
        placeholder="Ex.: Não consigo bloquear um horário" />
    </label>
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">Descrição</span>
      <textarea className={`${field} min-h-36 resize-y`} value={message} onChange={e => setMessage(e.target.value)} required minLength={10} maxLength={BODY_MAX}
        placeholder="O que você estava fazendo, o que esperava e o que aconteceu." />
    </label>
    <p className={`rounded-xl px-3 py-2 text-xs ${cpfWarning ? "border border-red-200 bg-red-50 text-red-700" : "bg-slate-50 text-slate-500"}`}>
      {cpfWarning
        ? "Parece haver um CPF no texto. Remova-o antes de enviar."
        : "Não inclua nome, CPF ou outros dados de pacientes. Enviamos junto apenas a tela de onde você veio, a versão do sistema e o navegador."}
    </p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button type="submit" disabled={busy || cpfWarning}
      className="h-11 w-full rounded-xl bg-[#12857f] px-4 text-sm font-semibold text-white hover:bg-[#0f726d] disabled:cursor-not-allowed disabled:opacity-60">
      {busy ? "Enviando…" : "Enviar chamado"}
    </button>
  </form>;
}
