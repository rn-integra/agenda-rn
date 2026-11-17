import { HttpError } from "@/lib/security/http";
import { consumeLimit } from "@/lib/security/rate-limit";
import { requireSupportApi } from "@/lib/support/staff";
import { supportAudit } from "@/lib/support/audit";
import { AUDIT_EXPORT_LIMIT, auditCsv, parseAuditFilters, searchSupportAudit } from "@/lib/support/audit-log";

export const dynamic = "force-dynamic";

// Exporta o registro do suporte (com os mesmos filtros da tela) em CSV, para guardar como comprovação.
// A própria exportação também entra no registro.
export async function GET(request: Request) {
  try {
    const context = await requireSupportApi();
    const staffId = context.session.account.id;
    await consumeLimit("support-audit-export", String(staffId), 20, 3600);
    const filters = parseAuditFilters(Object.fromEntries(new URL(request.url).searchParams));
    const { entries, total } = await searchSupportAudit(filters, { limit: AUDIT_EXPORT_LIMIT, offset: 0 });
    await supportAudit(staffId, "audit_export", { metadata: { rows: entries.length, total, filters: { ...filters, page: undefined } } });
    const day = new Date().toISOString().slice(0, 10);
    return new Response(auditCsv(entries), { headers: {
      "content-type": "text/csv; charset=utf-8", "Cache-Control": "private, no-store",
      "content-disposition": `attachment; filename="registro-suporte-${day}.csv"`,
    } });
  } catch (error) {
    return Response.json({ error: error instanceof HttpError ? error.message : "Não foi possível exportar." },
      { status: error instanceof HttpError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
