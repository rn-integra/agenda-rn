import { springTrap, type TrapKind } from "@/lib/security/traps";
import { TRAP_HEADER, TRAP_ROUTE } from "@/lib/security/trap-paths";

export const dynamic = "force-dynamic";

// Rota-isca: o proxy reescreve para cá os caminhos-isca e as requisições com a chave falsa.
// Responde um 404 comum, igual ao de qualquer página que não existe, sem dar pista de que foi pego.
async function trap(request: Request) {
  const [kind, ...rest] = (request.headers.get(TRAP_HEADER) || "").split(":");
  const path = rest.join(":") || TRAP_ROUTE;
  const caught: TrapKind = kind === "canary" ? "canary" : "trap";
  await springTrap(request, caught, path);
  return new Response("Not Found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

export const GET = trap, POST = trap, PUT = trap, PATCH = trap, DELETE = trap, HEAD = trap, OPTIONS = trap;
