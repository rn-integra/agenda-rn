"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Desbloquear um IP preso nas armadilhas. Pede confirmação e fica no registro de atividades.
export function TrapUnlockButton({ ipHash }: { ipHash: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function unlock() {
    if (!window.confirm("Desbloquear este IP? Faça isso só se for uma clínica que caiu por engano.")) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/support/traps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ipHash }) });
      const result = await response.json().catch(() => ({}));
      setMessage({ ok: response.ok, text: result.message || result.error || "Não foi possível concluir." });
      if (response.ok) router.refresh();
    } catch { setMessage({ ok: false, text: "Não foi possível conectar." }); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-col items-end gap-1">
    <button type="button" disabled={busy} onClick={unlock}
      className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50">Desbloquear</button>
    {message && <p role={message.ok ? "status" : "alert"} className={`text-xs ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p>}
  </div>;
}
