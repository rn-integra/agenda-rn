"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Building2, LayoutDashboard, LifeBuoy, ScrollText } from "lucide-react";

const ITEMS = [
  { href: "/suporte", label: "Visão geral", icon: LayoutDashboard },
  { href: "/suporte/monitoramento", label: "Monitoramento", icon: Activity },
  { href: "/suporte/organizacoes", label: "Organizações", icon: Building2 },
  { href: "/suporte/chamados", label: "Chamados", icon: LifeBuoy },
  { href: "/suporte/registro", label: "Registro", icon: ScrollText },
] as const;

// Menu do console.
export function SupportNav() {
  const pathname = usePathname();
  return <nav aria-label="Seções do suporte" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
    {ITEMS.map(item => {
      const Icon = item.icon;
      const active = item.href === "/suporte" ? pathname === item.href : pathname.startsWith(item.href);
      return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
        className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-white text-[#12374f] shadow-sm" : "text-white/80 hover:bg-white/10 hover:text-white"}`}>
        <Icon className="size-4" aria-hidden="true" />{item.label}
      </Link>;
    })}
  </nav>;
}
