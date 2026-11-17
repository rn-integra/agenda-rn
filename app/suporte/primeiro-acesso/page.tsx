import AuthShell from "@/components/auth-shell";
import { SupportSetupForm } from "../auth-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suporte — primeiro acesso — RN Integra", robots: { index: false, follow: false }, referrer: "no-referrer" };

// Link de primeiro acesso (ou de nova senha) do suporte, gerado pela equipe da plataforma.
// Depois da senha, a pessoa configura o autenticador em /suporte/verificar.
export default function SupportSetupPage() {
  return <AuthShell title="Acesso ao suporte" subtitle="Crie sua senha do console. Em seguida, você configura o aplicativo autenticador." compact>
    <SupportSetupForm />
  </AuthShell>;
}
