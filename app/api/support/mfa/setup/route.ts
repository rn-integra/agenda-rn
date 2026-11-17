import QRCode from "qrcode";
import { secureMutation } from "@/lib/security/http";
import { HttpError } from "@/lib/security/http";
import { consumeLimit } from "@/lib/security/rate-limit";
import { requireSupportApi } from "@/lib/support/staff";
import { encryptMfaSecret } from "@/lib/support/mfa-crypto";
import { newTotpSecret, otpauthUri } from "@/lib/support/totp";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";

// Primeira configuração do autenticador. Só enquanto o 2FA não está ativo: depois disso, trocar
// de celular é feito pelo runbook (outra pessoa da equipe zera o 2FA por SQL).
async function setup() {
  const context = await requireSupportApi({ mfa: false });
  if (context.mfaEnabled) throw new HttpError(409, "O autenticador já está configurado.");
  await consumeLimit("support-mfa-setup", String(context.staff.id), 10, 3600);
  const secret = newTotpSecret();
  const result = await getSupabaseAdmin().from("support_staff")
    .update({ mfa_secret_enc: await encryptMfaSecret(secret, context.staff.id), mfa_last_step: null })
    .eq("id", context.staff.id).is("mfa_enabled_at", null);
  dbError(result.error, "Save MFA secret");
  const uri = otpauthUri(secret, context.staff.email);
  const svg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return Response.json({ secret, uri, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` });
}

export const POST = secureMutation(setup, { allowAssisted: true });
