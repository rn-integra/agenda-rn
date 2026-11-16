import Link from "next/link";
import { requireSupportPage } from "@/lib/support/staff";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";
import { SupportLogout } from "./logout-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suporte — RN Integra", robots: { index: false, follow: false } };

const ACTIONS: Record<string, string> = {
  mfa_enabled: "Ativou a verificação em duas etapas",
  mfa_verified: "Entrou no console",
};
// Próximas fases do console (ainda não disponíveis).
const SECTIONS = ["Monitoramento", "Organizações", "Chamados"];

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

// Console do suporte RN Integra: só a equipe da plataforma, com código do autenticador confirmado.
export default async function SupportHome() {
  const { session } = await requireSupportPage();
  const db = getSupabaseAdmin();
  const [staff, audit] = await Promise.all([
    db.from("platform_staff").select("user_id,mfa_enabled_at,created_at").eq("active", true).order("created_at"),
    db.from("support_audit").select("id,staff_user_id,action,organization_id,target,created_at").order("created_at", { ascending: false }).limit(30),
  ]);
  dbError(staff.error, "Read platform staff"); dbError(audit.error, "Read support audit");
  const ids = [...new Set([...(staff.data || []).map((s: { user_id: number }) => s.user_id), ...(audit.data || []).map((a: { staff_user_id: number }) => a.staff_user_id)])];
  const users = ids.length ? await db.from("users").select("id,name,email").in("id", ids) : { data: [], error: null };
  dbError(users.error, "Read support users");
  const people = new Map<number, { name: string; email: string }>((users.data || []).map((u: { id: number; name: string; email: string }) => [Number(u.id), u]));

  return <main className="min-h-screen bg-[#f4f7f8] text-[#1f2a37]">
    <header className="bg-[#12374f] text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/agenda-rn-icon.jpg" alt="" className="size-9 rounded-xl bg-white object-contain" />
          <div><strong className="block leading-tight">Suporte RN Integra</strong><span className="text-xs text-white/70">{session.account.name}</span></div>
        </div>
        <nav className="flex items-center gap-1"><Link href="/" className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white">Voltar ao app</Link><SupportLogout /></nav>
      </div>
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-5">
        <span className="border-b-2 border-[#5fd3c7] px-3 py-2 text-sm font-semibold">Início</span>
        {SECTIONS.map(name => <span key={name} className="cursor-not-allowed px-3 py-2 text-sm text-white/45" title="Em breve">{name}</span>)}
      </div>
    </header>

    <div className="mx-auto grid max-w-6xl gap-5 px-5 py-6 lg:grid-cols-[1fr_2fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">Equipe de suporte</h2>
        <p className="mt-1 text-sm text-slate-500">Contas com acesso a este console.</p>
        <ul className="mt-4 divide-y divide-slate-100">
          {(staff.data || []).map((member: { user_id: number; mfa_enabled_at: string | null }) => {
            const person = people.get(Number(member.user_id));
            return <li key={member.user_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span><span className="block font-medium text-slate-800">{person?.name || `Usuário ${member.user_id}`}</span><span className="text-slate-500">{person?.email}</span></span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${member.mfa_enabled_at ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{member.mfa_enabled_at ? "2FA ativo" : "2FA pendente"}</span>
            </li>;
          })}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">Registro de atividades</h2>
        <p className="mt-1 text-sm text-slate-500">Tudo o que a equipe de suporte faz fica registrado aqui e não pode ser alterado.</p>
        {(audit.data || []).length === 0 ? <p className="mt-6 text-sm text-slate-500">Nenhuma atividade registrada.</p> :
          <ul className="mt-4 divide-y divide-slate-100">
            {(audit.data || []).map((entry: { id: number; staff_user_id: number; action: string; target: string | null; created_at: string }) =>
              <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5 text-sm">
                <span><span className="font-medium text-slate-800">{people.get(Number(entry.staff_user_id))?.name || `Usuário ${entry.staff_user_id}`}</span>
                  <span className="text-slate-600"> · {ACTIONS[entry.action] || entry.action}{entry.target ? ` · ${entry.target}` : ""}</span></span>
                <time className="text-xs text-slate-500" dateTime={entry.created_at}>{dateTime.format(new Date(entry.created_at))}</time>
              </li>)}
          </ul>}
      </section>
    </div>
  </main>;
}
