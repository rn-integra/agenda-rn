// Regras dos chamados de suporte que valem no servidor e na tela (sem acesso ao banco).

export const TICKET_CATEGORIES = ["duvida", "problema", "acesso", "sugestao"] as const;
export type TicketCategory = typeof TICKET_CATEGORIES[number];
export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  duvida: "Dúvida de uso", problema: "Algo não funciona", acesso: "Acesso e login", sugestao: "Sugestão",
};

export const TICKET_STATUSES = ["open", "in_progress", "waiting_customer", "resolved"] as const;
export type TicketStatus = typeof TICKET_STATUSES[number];
// Rótulos de quem está na clínica.
export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Aguardando o suporte", in_progress: "Em análise pelo suporte", waiting_customer: "Respondido", resolved: "Resolvido",
};
// Rótulos do console do suporte.
export const SUPPORT_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Novo", in_progress: "Em andamento", waiting_customer: "Aguardando cliente", resolved: "Resolvido",
};

export const SUBJECT_MAX = 120;
export const BODY_MAX = 4000;

// CPF escrito com ou sem pontuação. O chamado não deve levar dados de paciente: a tela avisa e o
// servidor recusa o envio quando encontra um número com cara de CPF.
const CPF_PATTERN = /(?<!\d)\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}(?!\d)/;
export function looksLikeCpf(text: string) {
  return CPF_PATTERN.test(text);
}

// Tela de onde a pessoa pediu ajuda, sem a parte depois de "?" e sem identificadores
// (números e códigos viram ":id"), para não carregar nada que aponte para um paciente.
export function sanitizePath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  const path = value.split(/[?#]/)[0].slice(0, 200);
  const parts = path.split("/").map(part => {
    if (!part) return part;
    if (/^\d+$/.test(part) || /^[0-9a-f-]{16,}$/i.test(part) || /\d/.test(part) && part.length > 12) return ":id";
    return /^[a-z0-9._-]+$/i.test(part) ? part : ":id";
  });
  const clean = parts.join("/") || "/";
  return clean === "/ajuda" || clean.startsWith("/ajuda/") ? null : clean;
}

// Navegador resumido (não guardamos o user-agent inteiro).
export function browserSummary(userAgent: string | null | undefined) {
  const ua = userAgent || "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Outro";
  const system = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "outro sistema";
  const mobile = /Mobi|Android|iPhone|iPad/.test(ua);
  return `${browser} · ${system}${mobile ? " (celular)" : ""}`;
}

// Próximo status quando chega uma mensagem: resposta da clínica reabre; a do suporte usa o status escolhido.
export function statusAfterCustomerMessage(current: TicketStatus): TicketStatus {
  return current === "in_progress" ? "in_progress" : "open";
}
