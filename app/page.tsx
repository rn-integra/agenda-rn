import { redirect } from "next/navigation";
import { getSession } from "./authz";
import { doctorHome } from "@/lib/doctor-services";
import { LandingPage } from "@/components/landing-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "RN Integra — gestão de agendas médicas", description: "A agenda de todos os seus médicos em um só lugar: consultas, cirurgias e anestesistas, com cada pessoa da equipe vendo só o que precisa." };

// Página inicial pública. Quem já está logado vai direto para o app (o seletor de organização também volta para cá).
export default async function Home() {
  const session = await getSession();
  if (session) redirect(doctorHome(session));
  return <LandingPage />;
}
