"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Field = { name: string; label: string; type?: string; autoComplete?: string; minLength?: number; maxLength?: number; placeholder?: string; defaultValue?: string; required?: boolean };

// Formulário genérico das páginas de conta: envia JSON e mostra a mensagem do servidor.
function AuthForm({ endpoint, fields, submit, extra, build, after, compact }: {
  endpoint: string; fields: Field[]; submit: string; extra?: React.ReactNode; compact?: boolean;
  build?: (data: FormData) => Record<string, unknown>; after?: (result: Record<string, unknown>) => void;
}) {
  const [message, setMessage] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const data = new FormData(event.currentTarget);
    const payload = build ? build(data) : Object.fromEntries(fields.map(f => [f.name, String(data.get(f.name) || "")]));
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(result.error || "Não foi possível concluir. Tente novamente."); return; }
      setMessage(result.message || "Pronto."); setDone(true); after?.(result);
    } catch { setError("Não foi possível conectar. Verifique sua internet e tente novamente."); }
    finally { setBusy(false); }
  }
  if (done) return <p role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message} <Link className="ml-1 font-medium underline" href="/entrar">Ir para o login</Link></p>;
  return <form onSubmit={onSubmit} className={compact ? "space-y-3" : "space-y-4"}>
    {fields.map(f => <div key={f.name} className={compact ? "space-y-1.5" : "space-y-2"}>
      <Label htmlFor={f.name} className="text-slate-700">{f.label}</Label>
      <Input id={f.name} name={f.name} type={f.type || "text"} autoComplete={f.autoComplete} minLength={f.minLength} maxLength={f.maxLength}
        placeholder={f.placeholder} defaultValue={f.defaultValue} required={f.required !== false} className={`border-slate-200 bg-slate-50/70 ${compact ? "h-10" : "h-12"}`} />
    </div>)}
    {extra}
    {error && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    <Button type="submit" disabled={busy} className={`w-full rounded-xl ${compact ? "h-11" : "h-12"} bg-[#12857f] text-base font-semibold hover:bg-[#0f716c]`}>{busy ? "Enviando…" : submit}</Button>
  </form>;
}

const password = (label = "Senha"): Field => ({ name: "password", label, type: "password", autoComplete: "new-password", minLength: 12, maxLength: 128, placeholder: "Mínimo de 12 caracteres" });

// Cadastro em duas etapas: primeiro o perfil de uso (define o tipo da organização), depois os dados da conta.
const SIGNUP_KINDS = [
  ["MANAGEMENT_COMPANY", "Empresa de gestão de agendas", "Assessorias e secretariados que administram a agenda de diversos médicos.", "Razão social ou nome da empresa"],
  ["CLINIC", "Clínica", "Gestão integrada das agendas do corpo clínico pela recepção.", "Nome da clínica"],
  ["SOLO_DOCTOR", "Médico autônomo", "Gestão da própria agenda, com acesso opcional para secretária.", "Nome do consultório"],
] as const;
type SignupKind = typeof SIGNUP_KINDS[number][0];

function StepLabel({ step }: { step: 1 | 2 }) {
  return <div className="flex items-center gap-3 pt-1 text-xs font-medium uppercase tracking-wide text-slate-500">
    <span>Etapa {step} de 2</span>
    <span className="flex flex-1 gap-1.5" aria-hidden="true">
      <span className="h-1 flex-1 rounded-full bg-[#12857f]" />
      <span className={`h-1 flex-1 rounded-full ${step === 2 ? "bg-[#12857f]" : "bg-slate-200"}`} />
    </span>
  </div>;
}

export function SignupForm() {
  const [kind, setKind] = useState<SignupKind>("MANAGEMENT_COMPANY"), [step, setStep] = useState<1 | 2>(1), [finished, setFinished] = useState(false);
  const chosen = SIGNUP_KINDS.find(k => k[0] === kind)!;
  if (step === 1) return <form className="space-y-4" onSubmit={event => { event.preventDefault(); setStep(2); }}>
    <fieldset className="space-y-2">
      <legend className="mb-2 text-base font-semibold text-slate-800">Selecione o perfil da sua operação</legend>
      {SIGNUP_KINDS.map(([value, title, text]) => <label key={value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm transition-colors hover:border-[#12857f]/60 has-[:checked]:border-[#12857f] has-[:checked]:bg-[#eaf3f1]">
        <input type="radio" name="organizationKind" value={value} checked={kind === value} onChange={() => setKind(value)} className="mt-1 accent-[#12857f]" />
        <span><span className="block font-semibold text-slate-800">{title}</span><span className="mt-0.5 block leading-5 text-slate-500">{text}</span></span>
      </label>)}
    </fieldset>
    <StepLabel step={1} />
    <Button type="submit" className="h-11 w-full rounded-xl bg-[#12857f] text-base font-semibold hover:bg-[#0f716c]">Continuar</Button>
  </form>;
  return <>
    {!finished && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[#12857f]/30 bg-[#eaf3f1] px-4 py-2.5 text-sm">
      <span className="text-slate-600">Perfil: <span className="font-semibold text-slate-800">{chosen[1]}</span></span>
      <button type="button" onClick={() => setStep(1)} className="font-medium text-[#12857f] underline">Alterar</button>
    </div>}
    <AuthForm endpoint="/api/auth/signup" submit="Criar conta" compact after={() => setFinished(true)}
      fields={[{ name: "organizationName", label: chosen[3], autoComplete: "organization", minLength: 2, maxLength: 120 },
        { name: "name", label: "Nome do responsável", autoComplete: "name", minLength: 2, maxLength: 120 },
        { name: "email", label: "E-mail corporativo", type: "email", autoComplete: "email", maxLength: 254 }, password()]}
      extra={<>
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-slate-600"><span className="relative mt-0.5 grid size-5 shrink-0 place-items-center"><input type="checkbox" name="acceptTerms" required className="peer size-5 cursor-pointer appearance-none rounded-[5px] border border-slate-300 bg-white transition-colors checked:border-[#12857f] checked:bg-[#12857f] focus-visible:ring-[3px] focus-visible:ring-[#12857f]/30" /><svg viewBox="0 0 16 16" aria-hidden="true" className="pointer-events-none absolute size-3.5 text-white opacity-0 peer-checked:opacity-100"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          <span>Declaro que li e aceito os <a href="/termos" target="_blank" className="underline">termos de uso</a>, a <a href="/privacidade" target="_blank" className="underline">política de privacidade</a> e o <a href="/contrato-operador" target="_blank" className="underline">contrato de tratamento de dados</a>.</span></label>
        <StepLabel step={2} />
      </>}
      build={d => ({ name: d.get("name"), email: d.get("email"), password: d.get("password"), organizationName: d.get("organizationName"), organizationKind: kind, acceptTerms: d.get("acceptTerms") === "on" })} />
  </>;
}

export function ForgotForm() {
  return <AuthForm endpoint="/api/auth/forgot" submit="Enviar link" fields={[{ name: "email", label: "E-mail da conta", type: "email", autoComplete: "email", maxLength: 254 }]} />;
}

export function ResendConfirmationForm() {
  return <AuthForm endpoint="/api/auth/resend-confirmation" submit="Enviar novo link" fields={[{ name: "email", label: "E-mail do cadastro", type: "email", autoComplete: "email", maxLength: 254 }]} />;
}

export function ResetForm({ token }: { token: string }) {
  return <AuthForm endpoint="/api/auth/reset" submit="Salvar nova senha" fields={[password("Nova senha")]}
    build={d => ({ token, password: d.get("password") })} />;
}

export function InviteAcceptForm({ token, existingUser, defaultName }: { token: string; existingUser: boolean; defaultName?: string }) {
  if (existingUser) return <AuthForm endpoint="/api/invites/accept" submit="Aceitar convite" fields={[]} build={() => ({ token })}
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    after={() => window.location.assign("/dashboard?agenda=1")} />;
  return <AuthForm endpoint="/api/invites/accept" submit="Criar acesso e aceitar"
    extra={<p className="text-xs text-slate-500">Ao criar seu acesso, você concorda com os <a href="/termos" target="_blank" className="underline">termos de uso</a> e a <a href="/privacidade" target="_blank" className="underline">política de privacidade</a>.</p>}
    fields={[{ name: "name", label: "Seu nome", autoComplete: "name", minLength: 2, maxLength: 120, defaultValue: defaultName }, password("Crie uma senha")]}
    build={d => ({ token, name: d.get("name"), password: d.get("password") })} />;
}
