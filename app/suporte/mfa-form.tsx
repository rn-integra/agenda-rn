"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Setup = { secret: string; uri: string; qr: string };

async function post(url: string, body?: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Não foi possível concluir. Tente novamente.");
  return result;
}

// Confirmação em duas etapas do suporte: configura o autenticador (1ª vez) e confere o código.
export function SupportMfaForm({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<Setup | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true); setError("");
    try { setSetup(await post("/api/support/mfa/setup")); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await post("/api/support/mfa/verify", { code: String(new FormData(event.currentTarget).get("code") || "") });
      // Recarrega a página inteira de propósito: a sessão mudou no servidor.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/suporte");
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  const alert = error && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  if (!enabled && !setup) return <div className="space-y-4">
    <p className="text-sm leading-6 text-slate-600">O acesso ao suporte exige um aplicativo autenticador no celular, como Google Authenticator, Microsoft Authenticator ou 1Password.</p>
    {alert}
    <Button onClick={start} disabled={busy} className="h-11 w-full rounded-xl bg-[#12857f] text-base font-semibold hover:bg-[#0f716c]">{busy ? "Gerando…" : "Configurar autenticador"}</Button>
  </div>;

  return <form onSubmit={verify} className="space-y-4">
    {setup && <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600">
      <p>1. No aplicativo autenticador, adicione uma conta e leia o QR code:</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qr} alt="QR code para configurar o autenticador" className="mx-auto size-44 rounded-lg bg-white p-2" />
      <p>Sem câmera? Digite a chave: <code className="break-all rounded bg-white px-1.5 py-0.5 font-mono text-xs text-slate-800">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code></p>
      <p>2. Digite abaixo o código de 6 dígitos que aparece no aplicativo.</p>
    </div>}
    <div className="space-y-2">
      <Label htmlFor="code" className="text-slate-700">Código do autenticador</Label>
      <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
        placeholder="000000" className="h-12 border-slate-200 bg-slate-50/70 text-center font-mono text-lg tracking-[0.4em]" />
    </div>
    {alert}
    <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl bg-[#12857f] text-base font-semibold hover:bg-[#0f716c]">{busy ? "Conferindo…" : setup ? "Ativar e entrar" : "Entrar no suporte"}</Button>
  </form>;
}
