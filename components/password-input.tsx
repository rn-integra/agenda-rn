"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

// Campo de senha com botão para mostrar/ocultar o que foi digitado (substitui o "repetir senha").
export function PasswordInput({ className = "", ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  return <div className="relative">
    <Input {...props} type={visible ? "text" : "password"} className={`pr-11 ${className}`} />
    <button type="button" onClick={() => setVisible(v => !v)} aria-label={visible ? "Ocultar senha" : "Mostrar senha"} aria-pressed={visible}
      className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-slate-400 transition-colors hover:text-slate-700 focus-visible:text-slate-700 focus-visible:outline-none">
      {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
    </button>
  </div>;
}
