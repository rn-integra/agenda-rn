"use client";
import { useState } from "react";
import { Eye } from "lucide-react";

const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

// Faixa fixa no topo enquanto o suporte RN Integra usa o acesso assistido: deixa claro que é
// somente leitura, até quando vale, e permite sair.
export default function AssistBanner({ staffName, managerName, expiresAt }: { staffName: string; managerName: string; expiresAt: string }) {
  const [busy, setBusy] = useState(false);
  async function leave() {
    setBusy(true);
    const response = await fetch("/api/support/assist/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    // Navegação completa: a próxima página já precisa ser lida com a sessão do próprio suporte.
    window.location.replace(typeof data.redirect === "string" ? data.redirect : "/suporte");
  }
  return <div role="status" className="no-print sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-400 px-4 py-2 text-center text-sm font-medium text-amber-950">
    <Eye className="size-4 shrink-0" aria-hidden="true" />
    <span>Acesso assistido: {staffName} (suporte RN Integra) vendo como {managerName}. Somente leitura, até {time.format(new Date(expiresAt))}.</span>
    <button type="button" onClick={leave} disabled={busy}
      className="rounded-lg bg-amber-950 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-900 disabled:opacity-60">{busy ? "Saindo…" : "Sair do acesso assistido"}</button>
  </div>;
}
