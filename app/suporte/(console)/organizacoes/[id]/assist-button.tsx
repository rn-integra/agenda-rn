"use client";
import { useState } from "react";

// Entrada do suporte com acesso assistido (só aparece com liberação ativa da gerência).
export function AssistButton({ organizationId }: { organizationId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function enter() {
    if (!window.confirm("Entrar na conta da clínica como a gerência vê, somente leitura? A entrada fica registrada e visível para a clínica.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/support/assist/start", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível entrar.");
      // Navegação completa: o app precisa ser lido já com a sessão assistida.
      window.location.replace(data.redirect || "/hub");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
      setBusy(false);
    }
  }
  return <div>
    <button type="button" onClick={enter} disabled={busy}
      className="h-10 rounded-xl bg-[#12374f] px-4 text-sm font-semibold text-white hover:bg-[#0d2a3d] disabled:opacity-60">{busy ? "Entrando…" : "Entrar (somente leitura)"}</button>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </div>;
}
