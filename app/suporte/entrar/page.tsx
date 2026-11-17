import { redirect } from "next/navigation";
import AuthShell from "@/components/auth-shell";
import { supportContext } from "@/lib/support/staff";
import { SupportLoginForm } from "../auth-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suporte — entrar — RN Integra", robots: { index: false, follow: false } };

// Login do console do suporte. Contas de clínica não entram aqui, e contas do suporte não entram no app.
export default async function SupportLoginPage() {
  const context = await supportContext();
  if (context) redirect(context.mfaVerified ? "/suporte" : "/suporte/verificar");
  return <AuthShell title="Console de suporte" subtitle="Acesso exclusivo da equipe RN Integra, com conta própria do suporte." compact>
    <SupportLoginForm />
    <p className="mt-5 text-xs leading-5 text-slate-500">Esqueceu a senha ou trocou de celular? Peça um novo link de acesso à equipe da plataforma.</p>
  </AuthShell>;
}
