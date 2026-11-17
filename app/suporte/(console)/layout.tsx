import Link from "next/link";
import { requireSupportPage } from "@/lib/support/staff";
import { SupportNav } from "./nav";
import { SupportLogout } from "./logout-button";

export const dynamic = "force-dynamic";

// Moldura do console do suporte: menu lateral (no celular, faixa no topo) e área de conteúdo.
// Cada página também chama requireSupportPage: a moldura sozinha não protege nada.
export default async function SupportLayout({ children }: { children: React.ReactNode }) {
  const { staff } = await requireSupportPage();
  const initials = staff.name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();
  return <div className="min-h-screen bg-[#f3f6f8] text-[#1f2a37] lg:flex">
    <aside className="bg-[#12374f] text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col">
      <div className="flex items-center justify-between gap-3 px-5 py-4 lg:py-6">
        <Link href="/suporte" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/agenda-rn-icon.jpg" alt="" className="size-9 rounded-xl bg-white object-contain" />
          <span><strong className="block leading-tight">RN Integra</strong><span className="text-xs text-white/60">Console de suporte</span></span>
        </Link>
        <div className="lg:hidden"><SupportLogout /></div>
      </div>
      <div className="px-3 pb-3 lg:flex-1 lg:pb-0"><SupportNav /></div>
      <div className="hidden border-t border-white/10 p-4 lg:block">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15 text-sm font-semibold">{initials || "?"}</span>
          <span className="min-w-0"><span className="block truncate text-sm font-medium">{staff.name}</span><span className="block truncate text-xs text-white/60">{staff.email}</span></span>
        </div>
        <div className="mt-3 flex items-center justify-end">
          <SupportLogout />
        </div>
      </div>
    </aside>
    <main className="min-w-0 flex-1 px-5 py-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-6xl">{children}</div></main>
  </div>;
}
