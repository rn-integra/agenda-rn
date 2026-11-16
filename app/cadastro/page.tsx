import Link from "next/link";
import AuthShell from "@/components/auth-shell";
import { SignupForm } from "@/components/auth-forms";
import { publicSignupEnabled } from "@/lib/legal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Criar conta — RN Integra" };

export default function SignupPage() {
  if (!publicSignupEnabled()) return <AuthShell title="Cadastro em breve" subtitle="O cadastro pelo site estará disponível em breve. Para contratar agora, fale com a equipe RN Integra."><Link href="/" className="text-sm underline">Voltar para a página inicial</Link></AuthShell>;
  return <AuthShell title="Criar conta">
    <SignupForm />
    <p className="mt-5 text-center text-sm text-slate-600">Já tem conta? <Link href="/entrar" className="font-medium underline">Entrar</Link></p>
  </AuthShell>;
}
