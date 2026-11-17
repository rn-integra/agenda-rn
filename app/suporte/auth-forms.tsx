"use client";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Não foi possível concluir. Tente novamente.");
  return result as { next?: string };
}

const field = "h-12 border-slate-200 bg-slate-50/70";
const submit = "h-11 w-full rounded-xl bg-[#12857f] text-base font-semibold hover:bg-[#0f716c]";
const Alert = ({ text }: { text: string }) => text ? <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{text}</p> : null;

function go(next = "/suporte/verificar") {
  // Recarrega a página inteira de propósito: a sessão mudou no servidor.
  window.location.assign(next);
}

// Login do console do suporte (conta própria, separada das contas das clínicas).
export function SupportLoginForm() {
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try { go((await post("/api/support/auth/login", { email: data.get("email"), password: data.get("password") })).next); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <form onSubmit={onSubmit} className="space-y-4">
    <div className="space-y-2"><Label htmlFor="email" className="text-slate-700">E-mail</Label>
      <Input id="email" name="email" type="email" autoComplete="username" maxLength={254} required autoFocus className={field} /></div>
    <div className="space-y-2"><Label htmlFor="password" className="text-slate-700">Senha</Label>
      <PasswordInput id="password" name="password" autoComplete="current-password" minLength={12} maxLength={128} required className={field} /></div>
    <Alert text={error} />
    <Button type="submit" disabled={busy} className={submit}>{busy ? "Entrando…" : "Entrar"}</Button>
  </form>;
}

function onHashChange(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

// Primeiro acesso: o token vem depois do # no link (o navegador não envia essa parte ao servidor,
// então ela não fica em logs).
export function SupportSetupForm() {
  const hash = useSyncExternalStore(onHashChange, () => window.location.hash.slice(1), () => null);
  const token = hash === null ? null : /^[0-9a-f]{64}$/.test(hash) ? hash : "";
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const data = new FormData(event.currentTarget);
    if (data.get("password") !== data.get("confirm")) { setError("As duas senhas não são iguais."); return; }
    setBusy(true);
    try { go((await post("/api/support/auth/setup", { token, password: data.get("password") })).next); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }
  if (token === null) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (!token) return <p role="alert" className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">Link inválido ou incompleto. Peça um novo link à equipe da plataforma.</p>;
  return <form onSubmit={onSubmit} className="space-y-4">
    <div className="space-y-2"><Label htmlFor="password" className="text-slate-700">Crie uma senha</Label>
      <PasswordInput id="password" name="password" autoComplete="new-password" minLength={12} maxLength={128} required autoFocus placeholder="Mínimo de 12 caracteres" className={field} /></div>
    <div className="space-y-2"><Label htmlFor="confirm" className="text-slate-700">Repita a senha</Label>
      <PasswordInput id="confirm" name="confirm" autoComplete="new-password" minLength={12} maxLength={128} required className={field} /></div>
    <Alert text={error} />
    <Button type="submit" disabled={busy} className={submit}>{busy ? "Salvando…" : "Salvar senha e continuar"}</Button>
  </form>;
}
