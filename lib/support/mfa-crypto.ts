import "server-only";

// Cifra o segredo do autenticador antes de gravar no banco (AES-GCM, chave derivada por HKDF).
// A chave vem do SUPABASE_SECRET_KEY: trocar essa chave invalida os autenticadores do suporte, que
// precisam ser configurados de novo (passo a passo no runbook). O id do usuário entra como dado
// associado: o segredo de uma pessoa não funciona copiado para outra linha.
const encoder = new TextEncoder();

async function key() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY ausente.");
  const base = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: encoder.encode("rn-integra"), info: encoder.encode("support-mfa-v1") },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), char => char.charCodeAt(0));

export async function encryptMfaSecret(secret: string, userId: number) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(String(userId)) }, await key(), encoder.encode(secret));
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(data))}`;
}

export async function decryptMfaSecret(stored: string, userId: number) {
  const [version, iv, data] = stored.split(".");
  if (version !== "v1" || !iv || !data) throw new Error("Segredo em formato desconhecido.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv), additionalData: encoder.encode(String(userId)) }, await key(), fromBase64(data));
  return new TextDecoder().decode(plain);
}
