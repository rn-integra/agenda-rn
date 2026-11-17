"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LifeBuoy } from "lucide-react";

// Botão "Ajuda" do cabeçalho: abre /ajuda levando só o caminho da tela atual (sem a parte depois de "?"),
// para o suporte saber de onde veio o pedido. O servidor ainda limpa identificadores do caminho.
export default function HelpLink({ className, children, onNavigate }: { className?: string; children?: React.ReactNode; onNavigate?: () => void }) {
  const router = useRouter();
  return <Link className={className} href="/ajuda" aria-label={children ? undefined : "Ajuda"} title="Ajuda e suporte"
    onClick={event => {
      onNavigate?.();
      const path = window.location.pathname;
      if (path.startsWith("/ajuda")) return;
      event.preventDefault();
      router.push(`/ajuda?de=${encodeURIComponent(path)}`);
    }}>
    {children ?? <LifeBuoy size={21} aria-hidden="true" />}
  </Link>;
}
