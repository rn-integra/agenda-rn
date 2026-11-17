import Link from "next/link";
import { Download, Lock } from "lucide-react";
import { requireSupportPage } from "@/lib/support/staff";
import { AUDIT_PAGE_SIZE, auditPeople, parseAuditFilters, searchSupportAudit, type AuditFilters } from "@/lib/support/audit-log";
import { SUPPORT_ACTION_LABEL } from "@/lib/support/audit-labels";
import { Card, Empty, PageHeader, dateTime } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registro — Suporte RN Integra", robots: { index: false, follow: false } };

const input = "h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#12374f] focus:ring-2 focus:ring-[#12374f]/15";

function query(filters: AuditFilters, page?: number) {
  const params = new URLSearchParams();
  if (filters.staff) params.set("pessoa", String(filters.staff));
  if (filters.action) params.set("acao", filters.action);
  if (filters.org) params.set("organizacao", filters.org);
  if (filters.q) params.set("busca", filters.q);
  if (filters.from) params.set("de", filters.from);
  if (filters.to) params.set("ate", filters.to);
  if (page && page > 1) params.set("pagina", String(page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

// Registro completo do suporte, com filtros e páginas de 25. Serve de comprovação: ninguém
// (nem o servidor, nem quem administra o banco pelo app) consegue alterar ou apagar uma linha.
export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSupportPage();
  const filters = parseAuditFilters(await searchParams);
  const [{ entries, total }, people] = await Promise.all([searchSupportAudit(filters), auditPeople()]);
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const filtered = Boolean(filters.staff || filters.action || filters.org || filters.q || filters.from || filters.to);

  return <>
    <PageHeader title="Registro de atividades" text="Tudo o que a equipe de suporte fez, do mais recente para o mais antigo.">
      <a href={`/api/support/audit/export${query(filters)}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
        <Download className="size-4" aria-hidden="true" />Exportar CSV
      </a>
    </PageHeader>

    <p className="mb-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
      <Lock className="mt-0.5 size-4 shrink-0 text-[#12857f]" aria-hidden="true" />
      O registro só aceita novas linhas. Nenhuma ação, nem do próprio sistema, altera ou apaga o que já foi gravado; o banco recusa a tentativa.
    </p>

    <Card className="mb-4">
      <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <label className="text-xs font-medium text-slate-600">Pessoa do suporte
          <select name="pessoa" defaultValue={filters.staff ?? ""} className={`${input} mt-1`}>
            <option value="">Todas</option>
            {people.map(person => <option key={person.id} value={person.id}>{person.name}{person.active ? "" : " (fora da equipe)"}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">Ação
          <select name="acao" defaultValue={filters.action ?? ""} className={`${input} mt-1`}>
            <option value="">Todas</option>
            {Object.entries(SUPPORT_ACTION_LABEL).map(([value, label]) => <option key={value} value={value}>{label[0].toUpperCase() + label.slice(1)}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">Organização
          <input name="organizacao" defaultValue={filters.org ?? ""} maxLength={80} placeholder="Nome da clínica" className={`${input} mt-1`} />
        </label>
        <label className="text-xs font-medium text-slate-600">Busca no alvo
          <input name="busca" defaultValue={filters.q ?? ""} maxLength={80} placeholder="Ex.: #12, nome da pessoa" className={`${input} mt-1`} />
        </label>
        <label className="text-xs font-medium text-slate-600">De
          <input type="date" name="de" defaultValue={filters.from ?? ""} className={`${input} mt-1`} />
        </label>
        <label className="text-xs font-medium text-slate-600">Até
          <input type="date" name="ate" defaultValue={filters.to ?? ""} className={`${input} mt-1`} />
        </label>
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-6">
          <button type="submit" className="h-10 rounded-xl bg-[#12374f] px-4 text-sm font-semibold text-white hover:bg-[#0d2a3d]">Filtrar</button>
          {filtered && <Link href="/suporte/registro" className="h-10 rounded-xl px-3 text-sm leading-10 text-slate-600 hover:bg-slate-100">Limpar filtros</Link>}
          <span className="ml-auto text-sm text-slate-500">{total} {total === 1 ? "registro" : "registros"}</span>
        </div>
      </form>
    </Card>

    <Card>
      {entries.length === 0 ? <Empty>{filtered ? "Nada encontrado com esses filtros." : "Nenhuma atividade registrada."}</Empty> :
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-100"><th className="py-2 pr-4 font-medium">Data e hora</th><th className="py-2 pr-4 font-medium">Pessoa</th><th className="py-2 pr-4 font-medium">Ação</th><th className="py-2 pr-4 font-medium">Organização</th><th className="py-2 font-medium">Alvo</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map(entry => <tr key={entry.id} className="align-top">
                <td className="whitespace-nowrap py-2.5 pr-4 text-slate-500"><time dateTime={entry.created_at}>{dateTime.format(new Date(entry.created_at))}</time></td>
                <td className="py-2.5 pr-4 font-medium text-slate-800">{entry.staffName}</td>
                <td className="py-2.5 pr-4 text-slate-700">{SUPPORT_ACTION_LABEL[entry.action] || entry.action}</td>
                <td className="py-2.5 pr-4 text-slate-600">{entry.organization_id
                  ? <Link href={`/suporte/organizacoes/${entry.organization_id}`} className="hover:text-[#12857f] hover:underline">{entry.organization}</Link> : "—"}</td>
                <td className="max-w-xs break-words py-2.5 text-slate-500">{entry.target || "—"}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      {pages > 1 && <nav aria-label="Páginas do registro" className="mt-4 flex items-center justify-between text-sm">
        {filters.page > 1 ? <Link href={`/suporte/registro${query(filters, filters.page - 1)}`} className="rounded-lg px-3 py-1.5 font-medium text-[#12374f] hover:bg-slate-100">← Mais recentes</Link> : <span />}
        <span className="text-slate-500">Página {Math.min(filters.page, pages)} de {pages}</span>
        {filters.page < pages ? <Link href={`/suporte/registro${query(filters, filters.page + 1)}`} className="rounded-lg px-3 py-1.5 font-medium text-[#12374f] hover:bg-slate-100">Mais antigos →</Link> : <span />}
      </nav>}
    </Card>
  </>;
}
