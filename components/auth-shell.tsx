import Link from "next/link";
import { LoginScene } from "@/app/login-scene";

// Moldura das páginas públicas de conta (cadastro, senha, convite), no visual do login.
export default function AuthShell({ title, subtitle, compact, children }: { title: string; subtitle?: string; compact?: boolean; children: React.ReactNode }) {
  return <main className={`relative grid min-h-screen place-items-center overflow-hidden bg-[#eaf3f1] px-5 text-[#1f2a37] ${compact ? "py-6" : "py-10"}`}>
    <LoginScene />
    <section className={`relative w-full max-w-md rounded-[2rem] border border-white/80 bg-white/90 shadow-[0_30px_90px_rgba(18,55,79,.14)] backdrop-blur-md ${compact ? "p-6 sm:p-8" : "p-7 sm:p-9"}`}>
      <Link href="/" className={`flex items-center gap-4 ${compact ? "mb-5" : "mb-8"}`} aria-label="RN Integra — página inicial">
        <div className={`grid shrink-0 ${compact ? "size-12" : "size-14"} place-items-center overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm`}>
          <img src="/agenda-rn-icon.jpg" alt="" className="h-full w-full object-contain" />
        </div>
        <div><strong className="block text-xl font-semibold tracking-tight text-[#12374f]">RN Integra</strong><span className="text-sm text-slate-500">Gestão de atendimentos</span></div>
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      {subtitle && <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>}
      <div className={compact ? "mt-4" : "mt-6"}>{children}</div>
    </section>
  </main>;
}
