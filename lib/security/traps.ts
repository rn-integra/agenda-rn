import "server-only";
import { reportIncident } from "@/lib/monitor/report";
import { hashIp, recordSecurityEvent } from "./events";
import { HttpError } from "./http";
import { clearLimit, consumeLimit, limitStatus } from "./rate-limit";

// Contadores por IP (identidade = resumo do IP, o mesmo gravado em security_events.ip_hash,
// para o console do suporte conseguir desbloquear a partir do evento).
export const TRAP_LIMITS = {
  paths: { scope: "trap-ip", block: 3, seconds: 86400 },     // 3 caminhos-isca em 24 h bloqueiam (um erro de digitação não)
  canary: { scope: "trap-canary", block: 1, seconds: 86400 }, // a chave falsa bloqueia na primeira vez
} as const;
// Depois de tantos registros do mesmo IP no dia, para de gravar (um scanner pede centenas de caminhos).
const LOG_CAP = 30;

export type TrapKind = "trap" | "canary";

// Alguém caiu numa armadilha: registra (evento + monitor) e conta para o bloqueio do IP.
// Nunca lança exceção: a resposta ao robô é sempre um 404 comum.
export async function springTrap(request: Request, kind: TrapKind, path: string) {
  const ipHash = hashIp(request);
  const limit = kind === "canary" ? TRAP_LIMITS.canary : TRAP_LIMITS.paths;
  try {
    await consumeLimit(limit.scope, ipHash, LOG_CAP, limit.seconds);
  } catch (error) {
    // 429: este IP já foi registrado o bastante hoje (continua bloqueado). Outro erro: segue registrando.
    if (error instanceof HttpError && error.status === 429) return;
  }
  const method = request.method, agent = (request.headers.get("user-agent") || "").slice(0, 160);
  const target = path.slice(0, 200);
  await Promise.all([
    recordSecurityEvent(kind === "canary" ? "canary_key_used" : "trap_triggered", request, { target, details: { method, agent } }),
    reportIncident(kind === "canary" ? {
      source: "server", severity: "critical", key: "trap:canary", route: `${method} ${target}`,
      title: "Armadilha: a chave falsa foi usada",
      diagnosis: "Alguém (provavelmente um robô ou IA) leu a chave-isca publicada no robots.txt e tentou usá-la. O IP foi bloqueado por 24 h nas telas de entrada.",
      action: "Ver Monitoramento → Armadilhas. Se o IP for de uma clínica (engano), desbloquear por lá; se insistir, bloquear no firewall da Vercel.",
    } : {
      source: "server", severity: "warning", key: "trap:paths", route: `${method} ${target}`,
      title: "Armadilha: acesso a caminho-isca",
      diagnosis: "Um robô procurou arquivos ou painéis que não existem (.env, wp-admin, backups). Com 3 tentativas em 24 h o IP fica bloqueado nas telas de entrada.",
      action: "Nenhuma ação imediata. Ver Monitoramento → Armadilhas; desbloquear só se for um IP de clínica.",
    }),
  ]);
}

// Situação de um IP (pelo resumo): bloqueado por caminhos-isca, pela chave falsa, ou livre.
export async function trapStatus(ipHash: string) {
  const [paths, canary] = await Promise.all([
    limitStatus(TRAP_LIMITS.paths.scope, ipHash, TRAP_LIMITS.paths.block),
    limitStatus(TRAP_LIMITS.canary.scope, ipHash, TRAP_LIMITS.canary.block),
  ]);
  const blocked = paths.blocked || canary.blocked;
  const until = [paths.blocked && paths.until, canary.blocked && canary.until].filter((v): v is string => Boolean(v)).sort().pop() ?? null;
  return { blocked, until, hits: paths.hits + canary.hits };
}

// Telas de entrada (login, cadastro, senha, convite, console do suporte) recusam IP preso numa armadilha.
// Se a consulta falhar, deixa passar: a armadilha nunca pode derrubar o login.
export async function rejectTrapped(request: Request) {
  let blocked = false;
  try { blocked = (await trapStatus(hashIp(request))).blocked; }
  catch (error) { console.error("[traps] status", error instanceof Error ? error.message : error); }
  if (blocked) throw new HttpError(403, "Acesso bloqueado temporariamente por segurança. Se for um engano, fale com o suporte da RN Integra.");
}

export async function clearTrap(ipHash: string) {
  await Promise.all([clearLimit(TRAP_LIMITS.paths.scope, ipHash), clearLimit(TRAP_LIMITS.canary.scope, ipHash)]);
}
