import "server-only";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";

// Registro do que o suporte fez (public.support_audit: só acrescenta; nem o servidor altera ou apaga).
// Nunca gravar dados de paciente, senhas, códigos ou segredos em target/metadata.
export async function supportAudit(staffUserId: number, action: string, details: { organizationId?: string | null; target?: string | null; metadata?: Record<string, unknown> } = {}) {
  const { error } = await getSupabaseAdmin().from("support_audit").insert({
    staff_user_id: staffUserId, action, organization_id: details.organizationId ?? null,
    target: details.target ?? null, metadata: details.metadata ?? {},
  });
  dbError(error, "Write support audit");
}
