"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const LABELS = {
  unlock: { button: "Desbloquear login", confirm: "Desbloquear o login de {name}?" },
  reset_link: { button: "Enviar link de nova senha", confirm: "Enviar para o e-mail de {name} um link para criar uma nova senha?" },
  end_sessions: { button: "Encerrar sessões", confirm: "Encerrar todas as sessões abertas de {name}? A pessoa precisará entrar de novo." },
} as const;

// Ações do suporte sobre uma pessoa. Cada uma pede confirmação e fica no registro de atividades.
export function MemberActions({ organizationId, userId, name, blocked }: { organizationId: string; userId: number; name: string; blocked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function act(action: keyof typeof LABELS) {
    if (!window.confirm(LABELS[action].confirm.replace("{name}", name))) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/support/organizations/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId, userId, action }) });
      const result = await response.json().catch(() => ({}));
      setMessage({ ok: response.ok, text: result.message || result.error || "Não foi possível concluir." });
      if (response.ok) router.refresh();
    } catch { setMessage({ ok: false, text: "Não foi possível conectar." }); }
    finally { setBusy(false); }
  }
  const actions = (["unlock", "reset_link", "end_sessions"] as const).filter(a => a !== "unlock" || blocked);
  return <div className="flex flex-col items-end gap-1.5">
    <div className="flex flex-wrap justify-end gap-1.5">
      {actions.map(action => <button key={action} type="button" disabled={busy} onClick={() => act(action)}
        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${action === "unlock" ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900"}`}>
        {LABELS[action].button}
      </button>)}
    </div>
    {message && <p role={message.ok ? "status" : "alert"} className={`text-xs ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p>}
  </div>;
}
