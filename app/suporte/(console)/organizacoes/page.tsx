import Link from "next/link";
import { Search } from "lucide-react";
import { requireSupportPage } from "@/lib/support/staff";
import { KIND_LABEL, listOrganizations } from "@/lib/support/organizations";
import { Empty, PageHeader, ago, dateTime } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organizações — Suporte RN Integra", robots: { index: false, follow: false } };

// Lista das organizações clientes, com busca por nome da organização, do titular ou e-mail.
export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireSupportPage();
  const q = String((await searchParams).q || "").slice(0, 100);
  const rows = await listOrganizations(q);

  return <>
    <PageHeader title="Organizações" text="Clínicas, empresas e médicos que usam o RN Integra. Sem dados de pacientes." />
    <form role="search" className="mb-4 flex max-w-xl items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-[0_1px_2px_rgba(15,23,42,.04)] focus-within:border-[#12857f]">
      <Search className="size-4 text-slate-400" aria-hidden="true" />
      <input name="q" defaultValue={q} placeholder="Buscar por organização, titular ou e-mail" aria-label="Buscar organizações"
        className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
      {q && <Link href="/suporte/organizacoes" className="text-sm text-slate-500 hover:text-slate-800">Limpar</Link>}
    </form>
    {rows.length === 0 ? <Empty>{q ? "Nenhuma organização encontrada." : "Nenhuma organização cadastrada."}</Empty> :
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-5 py-3 font-medium">Organização</th><th className="px-5 py-3 font-medium">Titular</th><th className="px-5 py-3 font-medium">Equipe</th><th className="px-5 py-3 font-medium">Último acesso</th><th className="px-5 py-3 font-medium">Criada em</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(row => <tr key={row.id} className="hover:bg-slate-50/70">
              <td className="px-5 py-3">
                <Link href={`/suporte/organizacoes/${row.id}`} className="font-medium text-slate-900 hover:text-[#12857f]">{row.name}</Link>
                <span className="block text-xs text-slate-500">{KIND_LABEL[row.kind] || row.kind}{!row.active && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-red-700">Inativa</span>}</span>
              </td>
              <td className="px-5 py-3"><span className="block text-slate-800">{row.owner?.name || "—"}</span><span className="text-xs text-slate-500">{row.owner?.email}</span></td>
              <td className="px-5 py-3 text-slate-700">{row.members} {row.members === 1 ? "pessoa" : "pessoas"}</td>
              <td className="px-5 py-3 text-slate-700">{row.lastLogin ? ago(row.lastLogin) : "—"}</td>
              <td className="px-5 py-3 text-slate-500">{dateTime.format(new Date(row.created_at)).split(" ")[0].replace(",", "")}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    <p className="mt-3 text-xs text-slate-400">{rows.length} organização(ões){q ? ` para “${q}”` : ""}.</p>
  </>;
}
