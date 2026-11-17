"use client";
import { useState } from "react";

export function SupportLogout() {
  const [busy, setBusy] = useState(false);
  return <button type="button" disabled={busy} className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white"
    onClick={async () => {
      setBusy(true);
      const response = await fetch("/api/support/auth/logout", { method: "POST" }).catch(() => null);
      // Recarrega a página inteira de propósito: a sessão mudou no servidor.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (response?.ok) window.location.assign("/suporte/entrar"); else setBusy(false);
    }}>{busy ? "Saindo…" : "Sair"}</button>;
}
