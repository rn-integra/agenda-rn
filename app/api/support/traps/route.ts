import { z } from "zod";
import { HttpError, readJson, secureMutation } from "@/lib/security/http";
import { consumeLimit } from "@/lib/security/rate-limit";
import { clearTrap } from "@/lib/security/traps";
import { requireSupportApi } from "@/lib/support/staff";
import { supportAudit } from "@/lib/support/audit";
import { IP_HASH } from "@/lib/support/traps";

const body = z.object({ ipHash: z.string().regex(IP_HASH) }).strict();

// Desbloqueia um IP preso nas armadilhas (ex.: uma clínica que caiu por engano). Fica no registro.
async function unlock(request: Request) {
  const context = await requireSupportApi();
  await consumeLimit("support-trap-unlock", String(context.staff.id), 30, 3600);
  const parsed = body.safeParse(await readJson(request, 1024));
  if (!parsed.success) throw new HttpError(400, "IP inválido.");
  await clearTrap(parsed.data.ipHash);
  await supportAudit(context.staff.id, "trap_unlock", { target: `IP ${parsed.data.ipHash.slice(0, 8)}…` });
  return Response.json({ ok: true, message: "IP desbloqueado. As telas de entrada voltam a funcionar para ele." });
}

export const POST = secureMutation(unlock);
