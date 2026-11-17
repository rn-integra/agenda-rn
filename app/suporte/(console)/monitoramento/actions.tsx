"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Check, RefreshCw } from "lucide-react";

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Não foi possível concluir. Tente novamente.");
  return result;
}

const button = "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";

// "Rodar agora": dispara a mesma rodada do cron e recarrega o quadro.
export function RunMonitorButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  return <div className="flex items-center gap-3">
    {message && <span role="status" className="text-sm text-slate-500">{message}</span>}
    <button type="button" disabled={busy} className={`${button} border-[#12857f] bg-[#12857f] text-white hover:bg-[#0f716c]`}
      onClick={async () => {
        setBusy(true); setMessage("");
        try {
          const result = await post("/api/support/monitor/run", {});
          const found = Object.values(result.counts as Record<string, number>).reduce((a, b) => a + b, 0);
          setMessage(found ? `${found} ponto(s) encontrado(s)` : "Nenhum problema encontrado");
          router.refresh();
        } catch (error) { setMessage((error as Error).message); }
        finally { setBusy(false); }
      }}>
      <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />{busy ? "Verificando…" : "Rodar agora"}
    </button>
  </div>;
}

// Ações de um incidente aberto: resolver, silenciar o aviso ou reativá-lo.
export function IncidentActions({ id, snoozed }: { id: number; snoozed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function act(body: Record<string, unknown>) {
    setBusy(true); setError("");
    try { await post("/api/support/monitor/incidents", { id, ...body }); router.refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" disabled={busy} onClick={() => act({ action: "resolve" })} className={`${button} border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:text-emerald-700`}>
      <Check className="size-4" aria-hidden="true" />Marcar como resolvido
    </button>
    {snoozed
      ? <button type="button" disabled={busy} onClick={() => act({ action: "unsnooze" })} className={`${button} border-slate-200 bg-white text-slate-700 hover:text-slate-900`}>
        <Bell className="size-4" aria-hidden="true" />Reativar aviso
      </button>
      : <label className={`${button} border-slate-200 bg-white text-slate-700`}>
        <BellOff className="size-4" aria-hidden="true" /><span className="sr-only">Silenciar aviso por</span>
        <select disabled={busy} defaultValue="" aria-label="Silenciar aviso por" className="cursor-pointer bg-transparent outline-none"
          onChange={event => { const hours = Number(event.target.value); event.target.value = ""; if (hours) act({ action: "snooze", hours }); }}>
          <option value="" disabled>Silenciar aviso…</option>
          <option value="1">por 1 hora</option><option value="4">por 4 horas</option><option value="24">por 1 dia</option><option value="72">por 3 dias</option>
        </select>
      </label>}
    {error && <span role="alert" className="text-sm text-red-700">{error}</span>}
  </div>;
}
