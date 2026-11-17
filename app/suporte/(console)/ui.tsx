// Peças visuais do console do suporte (servidor).
import type { Severity } from "@/lib/support/monitor";

export const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "nunca";
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `há ${hours} h`;
  return `há ${Math.round(hours / 24)} dias`;
}

export function PageHeader({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div><h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>{text && <p className="mt-1 text-sm text-slate-500">{text}</p>}</div>
    {children}
  </div>;
}

export function Card({ title, text, children, className = "" }: { title?: string; text?: string; children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)] ${className}`}>
    {title && <header className="mb-4"><h2 className="text-base font-semibold text-slate-900">{title}</h2>{text && <p className="mt-0.5 text-sm text-slate-500">{text}</p>}</header>}
    {children}
  </section>;
}

const TONES = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-slate-200 bg-slate-50 text-slate-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-orange-200 bg-orange-50 text-orange-800",
  critical: "border-red-200 bg-red-50 text-red-800",
} as const;
export type Tone = keyof typeof TONES;
export const DOT: Record<Tone, string> = { ok: "bg-emerald-500", info: "bg-slate-400", warning: "bg-amber-500", error: "bg-orange-500", critical: "bg-red-500" };

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone }) {
  return <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
    <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">{tone && <span className={`size-2 rounded-full ${DOT[tone]}`} aria-hidden="true" />}{label}</p>
    <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
    {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
  </div>;
}

export function Banner({ tone, title, children }: { tone: Tone; title: string; children?: React.ReactNode }) {
  return <div role="status" className={`flex items-start gap-3 rounded-2xl border px-5 py-4 ${TONES[tone]}`}>
    <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${DOT[tone]}`} aria-hidden="true" />
    <div><p className="font-semibold">{title}</p>{children && <p className="mt-0.5 text-sm opacity-90">{children}</p>}</div>
  </div>;
}

const SEVERITY_LABEL: Record<Severity, string> = { critical: "Crítico", error: "Erro", warning: "Atenção", info: "Informação" };
export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${TONES[severity]}`}>
    <span className={`size-1.5 rounded-full ${DOT[severity]}`} aria-hidden="true" />{SEVERITY_LABEL[severity]}
  </span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">{children}</p>;
}
