// Iscas para robôs e IAs que exploram o sistema. Módulo puro: o proxy usa sem acessar o banco.
// Nenhum caminho daqui existe no app; quem pede um deles está procurando brecha.

// Chave falsa publicada no robots.txt como isca. Não dá acesso a nada: qualquer uso dela
// (cabeçalho ou endereço) dispara o alerta e bloqueia o IP. Não é segredo, pode ficar no repositório.
export const CANARY_KEY = "rnk_live_d812918a4854f23d65be901d87a724a19b387d14";

// Caminhos-isca (o caminho exato ou qualquer coisa abaixo dele).
export const TRAP_PATHS = [
  "/.env", "/.git", "/.aws", "/.ssh", "/.svn", "/.htaccess", "/.ds_store", "/.vscode",
  "/wp-admin", "/wp-login.php", "/wp-content", "/wp-includes", "/xmlrpc.php",
  "/phpmyadmin", "/pma", "/adminer", "/admin", "/administrator", "/painel-interno",
  "/backup", "/backups", "/backup.sql", "/dump.sql", "/db.sql", "/database.sql", "/config.json", "/config.php",
  "/server-status", "/actuator", "/graphql", "/cgi-bin", "/vendor/phpunit", "/debug",
  "/api/admin", "/api/internal", "/api/v1", "/api/debug", "/api/keys", "/api/export-all",
] as const;

// Extensões que o app nunca serve (scanners de PHP, ASP, arquivos de configuração e backups).
const TRAP_EXTENSION = /\.(?:php\d?|aspx?|jsp|cgi|env|sql|bak|old|swp|ini|ya?ml)$/i;

export function isTrapPath(pathname: string): boolean {
  const path = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  if (path.startsWith("/.well-known/")) return false;
  if (path.startsWith("/.env")) return true; // .env.local, .env.production…
  return TRAP_PATHS.some((trap) => path === trap || path.startsWith(trap + "/")) || TRAP_EXTENSION.test(path);
}

// A chave falsa aparece em algum cabeçalho de autenticação ou no endereço?
export function carriesCanary(headers: Headers, search: string): boolean {
  for (const name of ["authorization", "x-api-key", "apikey", "x-auth-token"]) if (headers.get(name)?.includes(CANARY_KEY)) return true;
  return search.includes(CANARY_KEY);
}

// Cabeçalho que o proxy usa para dizer à rota-isca o que foi pego ("trap:/caminho" ou "canary:/caminho").
export const TRAP_HEADER = "x-rn-trap";
export const TRAP_ROUTE = "/api/security/trap";
