import { redirect } from "next/navigation";
import AuthShell from "@/components/auth-shell";
import { requireSupportPage } from "@/lib/support/staff";
import { SupportMfaForm } from "../mfa-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suporte — verificação — RN Integra", robots: { index: false, follow: false } };

export default async function SupportVerifyPage() {
  const context = await requireSupportPage({ mfa: false });
  if (context.mfaVerified) redirect("/suporte");
  return <AuthShell title={context.mfaEnabled ? "Verificação em duas etapas" : "Proteja o acesso ao suporte"}
    subtitle={context.mfaEnabled ? "Digite o código do seu aplicativo autenticador para continuar." : undefined} compact>
    <SupportMfaForm enabled={context.mfaEnabled} />
  </AuthShell>;
}
