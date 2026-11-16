"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Building2, LayoutDashboard, LifeBuoy } from "lucide-react";

const ITEMS = [
  { href: "/suporte", label: "Visão geral", icon: LayoutDashboard },
  { href: "/suporte/monitoramento", label: "Monitoramento", icon: Activity },
  { href: "/suporte/organizacoes", label: "Organizações", icon: Building2 },
  { label: "Chamados", icon: LifeBuoy },
] as const;

// Menu do console. Itens sem endereço são as próximas fases (aparecem desativados).
export function SupportNav() {
  const pathname = usePathname();
  return <nav aria-label="Seções do suporte" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
    {ITEMS.map(item => {
      const Icon = item.icon;
      if (!("href" in item)) return <span key={item.label} aria-disabled="true" title="Em breve"
        className="flex shrink-0 cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2 text-sm text-white/40">
        <Icon className="size-4" aria-hidden="true" />{item.label}<span className="ml-auto hidden rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide lg:inline">Em breve</span>
      </span>;
      const active = item.href === "/suporte" ? pathname === item.href : pathname.startsWith(item.href);
      return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
        className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-white text-[#12374f] shadow-sm" : "text-white/80 hover:bg-white/10 hover:text-white"}`}>
        <Icon className="size-4" aria-hidden="true" />{item.label}
      </Link>;
    })}
  </nav>;
}
