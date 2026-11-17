// Códigos de 6 dígitos do app autenticador (TOTP, RFC 6238: HMAC-SHA1, intervalos de 30 s).
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_PERIOD = 30;

export function base32Encode(bytes: Uint8Array) {
  let bits = 0, value = 0, out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string) {
  const clean = text.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0, value = 0; const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Segredo inválido.");
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Uint8Array.from(out);
}

export function newTotpSecret() {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

export function currentStep(now = Date.now()) {
  return Math.floor(now / 1000 / TOTP_PERIOD);
}

export async function totpCode(secret: string, step: number) {
  const counter = new Uint8Array(8);
  let rest = step;
  for (let index = 7; index >= 0; index--) { counter[index] = rest & 255; rest = Math.floor(rest / 256); }
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const offset = mac[mac.length - 1] & 15;
  const binary = ((mac[offset] & 127) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
}

// Aceita o intervalo atual e um de cada lado (relógio do celular adiantado/atrasado), sem repetir
// um intervalo já usado. Devolve o intervalo aceito ou null.
export async function matchTotp(secret: string, code: string, lastStep: number | null, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const step = currentStep(now);
  let matched: number | null = null;
  for (const candidate of [step - 1, step, step + 1]) {
    const expected = await totpCode(secret, candidate);
    let difference = 0;
    for (let index = 0; index < 6; index++) difference |= expected.charCodeAt(index) ^ code.charCodeAt(index);
    if (difference === 0 && (lastStep === null || candidate > lastStep)) matched = candidate;
  }
  return matched;
}

export function otpauthUri(secret: string, email: string) {
  const label = encodeURIComponent(`RN Integra Suporte:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent("RN Integra")}&algorithm=SHA1&digits=6&period=${TOTP_PERIOD}`;
}
