import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSupportPage } from "@/lib/support/staff";
import { supportAudit } from "@/lib/support/audit";
import { KIND_LABEL, ROLE_LABEL, loadOrganization } from "@/lib/support/organizations";
import { Card, Empty, PageHeader, Stat, ago, dateTime } from "../../ui";
import { MemberActions } from "./member-actions";
import { AssistButton } from "./assist-button";
import { activeGrant } from "@/lib/support/assist";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organização — Suporte RN Integra", robots: { index: false, follow: false } };

const EVENT_LABEL: Record<string, string> = {
  login_success: "Entrou", login_failure: "Errou a senha", login_unverified: "Tentou entrar sem confirmar o e-mail",
  password_reset: "Redefiniu a senha", invite_accepted: "Aceitou um convite", organization_switch: "Trocou de organização",
  patient_export: "Exportou os dados de um paciente (LGPD)", patient_anonymized: "Anonimizou um paciente (LGPD)",
};

// Ficha de uma organização para o suporte: cadastro, equipe, convites e acessos recentes.
// Abrir a ficha fica no registro de atividades (o suporte só olha uma clínica com motivo).
export default async function OrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const { staff } = await requireSupportPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [data, grant] = await Promise.all([loadOrganization(id), activeGrant(id)]);
  if (!data) notFound();
  await supportAudit(staff.id, "organization_view", { organizationId: id, target: data.org.name.slice(0, 150) });
  const { org, account, team, invites, events } = data;
  const lastLogin = team.map(m => m.lastLogin).filter(Boolean).sort().at(-1) ?? null;
  const blocked = team.filter(m => m.blockedUntil).length;

  return <>
    <Link href="/suporte/organizacoes" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" aria-hidden="true" />Organizações</Link>
    <PageHeader title={org.name} text={`${KIND_LABEL[org.kind] || org.kind} · criada em ${dateTime.format(new Date(org.created_at))}`}>
      <span className={`rounded-full px-3 py-1 text-sm font-medium ${org.active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{org.active ? "Ativa" : "Inativa"}</span>
    </PageHeader>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Equipe" value={team.filter(m => m.membershipActive).length} hint={`${invites.length} convite(s) pendente(s)`} />
      <Stat label="Último acesso" value={lastLogin ? ago(lastLogin) : "—"} hint={lastLogin ? dateTime.format(new Date(lastLogin)) : "Ninguém entrou ainda"} />
      <Stat label="Logins bloqueados" value={blocked} tone={blocked ? "warning" : "ok"} hint={blocked ? "Veja a equipe abaixo" : "Nenhum"} />
      <Stat label="Conta" value={account?.plan || "—"} hint={account ? `Titular: ${data.ownerName || "—"} · ${account.status}` : undefined} />
    </div>

    <Card title="Acesso assistido" text="Ver o sistema como a gerência vê, somente leitura. Só com liberação da gerência, que acompanha tudo pelo registro." className="mt-6">
      {grant
        ? <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-700">Liberado por <span className="font-medium">{team.find(m => m.userId === Number(grant.granted_by))?.name || "a gerência"}</span> até <span className="font-medium">{dateTime.format(new Date(grant.expires_at))}</span>{grant.reason ? <span className="text-slate-500"> · {grant.reason}</span> : null}</p>
          <AssistButton organizationId={org.id} />
        </div>
        : <Empty>Sem liberação ativa. A gerência libera em Ajuda e suporte → Acesso assistido.</Empty>}
    </Card>

    <Card title="Equipe" text="Pessoas com acesso a esta organização." className="mt-6">
      <ul className="divide-y divide-slate-100">
        {team.map(member => <li key={member.userId} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="font-medium text-slate-900">{member.name}
              {member.userId === data.ownerId && <span className="ml-2 rounded-full bg-[#eaf3f1] px-2 py-0.5 text-xs font-medium text-[#12857f]">Titular</span>}
            </p>
            <p className="text-sm text-slate-500">{member.email}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{ROLE_LABEL[member.role] || member.role}</span>
              {!member.membershipActive && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">Vínculo inativo</span>}
              {!member.userActive && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">Conta desativada</span>}
              {!member.emailVerified && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">E-mail não confirmado</span>}
              {member.blockedUntil
                ? <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">Login bloqueado até {dateTime.format(new Date(member.blockedUntil))}</span>
                : member.failures > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{member.failures} senha(s) errada(s) recente(s)</span>}
              <span className="rounded-full px-2 py-0.5 text-slate-500">Último acesso: {member.lastLogin ? ago(member.lastLogin) : "nunca"}</span>
            </div>
          </div>
          <MemberActions organizationId={org.id} userId={member.userId} name={member.name} blocked={Boolean(member.blockedUntil)} />
        </li>)}
      </ul>
    </Card>

    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <Card title="Convites pendentes" text="Enviados pela gerência e ainda não aceitos.">
        {invites.length === 0 ? <Empty>Nenhum convite pendente.</Empty> :
          <ul className="divide-y divide-slate-100">{invites.map(invite => <li key={invite.id} className="py-2.5 text-sm first:pt-0 last:pb-0">
            <p className="font-medium text-slate-800">{invite.email}</p>
            <p className="text-xs text-slate-500">{ROLE_LABEL[invite.role] || invite.role} · enviado {ago(invite.created_at)} · vence {dateTime.format(new Date(invite.expires_at))}</p>
          </li>)}</ul>}
      </Card>
      <Card title="Acessos e eventos de segurança" text="Entradas, senhas erradas, redefinições e pedidos LGPD (sem dados do paciente).">
        {events.length === 0 ? <Empty>Nenhum acesso registrado.</Empty> :
          <ul className="divide-y divide-slate-100">{events.map(event => <li key={event.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
            <span><span className="font-medium text-slate-800">{event.actor || "Alguém"}</span> <span className="text-slate-600">{(EVENT_LABEL[event.kind] || event.kind).toLowerCase()}</span></span>
            <time className="shrink-0 text-xs text-slate-400" dateTime={event.created_at}>{dateTime.format(new Date(event.created_at))}</time>
          </li>)}</ul>}
      </Card>
    </div>
  </>;
}
