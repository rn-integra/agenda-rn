"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { field } from "./ui";

const time = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const HOURS = [{ value: 1, label: "1 hora" }, { value: 4, label: "4 horas" }, { value: 24, label: "24 horas" }];

// Botões da gerência: liberar o acesso assistido por um tempo ou encerrá-lo na hora.
export function AssistControls({ active }: { active: { expiresAt: string; grantedBy: string; reason: string | null } | null }) {
  const router = useRouter();
  const [hours, setHours] = useState(1);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(payload: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/organizations/support-access", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível concluir.");
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir.");
    } finally { setBusy(false); }
  }

  if (active) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
    <p className="text-sm font-semibold text-amber-900">Acesso do suporte liberado até {time.format(new Date(active.expiresAt))}</p>
    <p className="mt-0.5 text-xs text-amber-800">Liberado por {active.grantedBy}{active.reason ? ` · Motivo: ${active.reason}` : ""}</p>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    <button type="button" disabled={busy} onClick={() => { if (window.confirm("Encerrar agora o acesso do suporte? Quem estiver dentro sai na hora.")) void send({ action: "revoke" }); }}
      className="mt-3 h-10 rounded-xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60">{busy ? "Encerrando…" : "Encerrar agora"}</button>
  </div>;

  return <form onSubmit={event => { event.preventDefault(); void send({ action: "grant", hours, ...(reason.trim() ? { reason } : {}) }); }} className="space-y-3">
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-700">Por quanto tempo?</legend>
      <div className="grid grid-cols-3 gap-2">{HOURS.map(option => <label key={option.value}
        className={`cursor-pointer rounded-xl border px-3 py-2 text-center text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#12857f]/30 ${hours === option.value ? "border-[#12857f] bg-[#eaf3f1] font-medium text-[#0d6b66]" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
        <input type="radio" name="hours" className="sr-only" checked={hours === option.value} onChange={() => setHours(option.value)} />{option.label}
      </label>)}</div>
    </fieldset>
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">Motivo <span className="font-normal text-slate-400">(opcional)</span></span>
      <input className={field} value={reason} onChange={e => setReason(e.target.value)} maxLength={200} placeholder="Ex.: chamado #12, agenda não carrega" />
    </label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button type="submit" disabled={busy}
      className="h-10 w-full rounded-xl bg-[#12857f] px-4 text-sm font-semibold text-white hover:bg-[#0f726d] disabled:opacity-60">{busy ? "Liberando…" : "Liberar acesso do suporte"}</button>
  </form>;
}
