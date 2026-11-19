// Armadilhas para robôs e IAs exploradoras: caminhos-isca, chave falsa, bloqueio por IP e painel do suporte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './load-ts.mjs';

const read = (p) => readFileSync(p, 'utf8');
const paths = loadTs('lib/security/trap-paths.ts');
const http = loadTs('lib/security/http.ts');

test('caminhos-isca: pega os de scanner e nunca uma rota real do app', () => {
  for (const p of ['/.env', '/.env.local', '/.git/config', '/wp-admin/', '/wp-login.php', '/phpmyadmin/index.php', '/admin',
    '/painel-interno', '/backup.sql', '/api/internal/users', '/api/v1/users', '/config.php', '/qualquer/coisa.php', '/WP-ADMIN'])
    assert.equal(paths.isTrapPath(p), true, p);
  for (const p of ['/', '/entrar', '/dashboard', '/suporte', '/suporte/monitoramento', '/api/auth/login', '/api/state', '/api/health',
    '/robots.txt', '/favicon.svg', '/.well-known/security.txt', '/administracao-de-agenda', '/hub', '/organizacao', '/ajuda'])
    assert.equal(paths.isTrapPath(p), false, p);
});

test('chave falsa: detectada em cabeçalhos de autenticação e no endereço', () => {
  const key = paths.CANARY_KEY;
  assert.match(key, /^rnk_live_[0-9a-f]{40}$/);
  assert.equal(paths.carriesCanary(new Headers({ authorization: `Bearer ${key}` }), ''), true);
  assert.equal(paths.carriesCanary(new Headers({ 'x-api-key': key }), ''), true);
  assert.equal(paths.carriesCanary(new Headers(), `?key=${key}`), true);
  assert.equal(paths.carriesCanary(new Headers({ authorization: 'Bearer outra' }), '?a=1'), false);
});

test('proxy: isca e chave falsa vão para a rota-isca antes de tudo', () => {
  const proxy = read('proxy.ts');
  assert.match(proxy, /carriesCanary\(request\.headers, request\.nextUrl\.search\) \? 'canary' : isTrapPath\(request\.nextUrl\.pathname\) \? 'trap' : null/);
  assert.match(proxy, /NextResponse\.rewrite\(new URL\(TRAP_ROUTE, request\.url\)/);
  assert.ok(proxy.indexOf('const caught') < proxy.indexOf('const nonce'), 'a armadilha vem antes do resto do proxy');
  assert.match(read('app/api/security/trap/route.ts'), /status: 404/);
});

function trapsWith({ consume, status = {} } = {}) {
  const calls = [];
  const traps = loadTs('lib/security/traps.ts', {
    './http': http,
    './events': { hashIp: () => 'a'.repeat(32), recordSecurityEvent: async (kind, _r, e) => { calls.push(['event', kind, e.target]); } },
    '@/lib/monitor/report': { reportIncident: async (i) => { calls.push(['incident', i.key, i.severity]); return null; } },
    './rate-limit': {
      consumeLimit: async (scope, id, limit, seconds) => { calls.push(['consume', scope, id, limit, seconds]); if (consume) await consume(scope); },
      limitStatus: async (scope, _id, limit) => { if (status.error) throw new Error('db'); const hits = status[scope] || 0; return { hits, blocked: hits >= limit, until: hits ? '2026-11-20T10:00:00Z' : null }; },
      clearLimit: async (scope, id) => { calls.push(['clear', scope, id]); },
    },
  });
  return { traps, calls };
}
const req = (headers = {}) => new Request('https://example.com/api/security/trap', { headers: { 'user-agent': 'GPTBot', ...headers } });

test('armadilha: registra evento, incidente e conta para o bloqueio do IP', async () => {
  const { traps, calls } = trapsWith();
  await traps.springTrap(req(), 'trap', '/.env');
  assert.deepEqual(calls.find((c) => c[0] === 'consume'), ['consume', 'trap-ip', 'a'.repeat(32), 30, 86400]);
  assert.deepEqual(calls.find((c) => c[0] === 'event'), ['event', 'trap_triggered', '/.env']);
  assert.deepEqual(calls.find((c) => c[0] === 'incident'), ['incident', 'trap:paths', 'warning']);

  const canary = trapsWith();
  await canary.traps.springTrap(req(), 'canary', '/api/state');
  assert.equal(canary.calls.find((c) => c[0] === 'consume')[1], 'trap-canary');
  assert.deepEqual(canary.calls.find((c) => c[0] === 'incident'), ['incident', 'trap:canary', 'critical']);
  assert.equal(canary.calls.find((c) => c[0] === 'event')[1], 'canary_key_used');
});

test('armadilha: depois do teto diário, o mesmo IP para de gerar registros', async () => {
  const { traps, calls } = trapsWith({ consume: async () => { throw new http.HttpError(429, 'x'); } });
  await traps.springTrap(req(), 'trap', '/wp-admin');
  assert.equal(calls.filter((c) => c[0] !== 'consume').length, 0);
  // Falha do banco no contador não esconde a armadilha.
  const broken = trapsWith({ consume: async () => { throw new http.HttpError(503, 'x'); } });
  await broken.traps.springTrap(req(), 'trap', '/wp-admin');
  assert.ok(broken.calls.some((c) => c[0] === 'event'));
});

test('bloqueio: 3 caminhos-isca ou 1 uso da chave; falha na consulta deixa passar', async () => {
  const free = trapsWith({ status: { 'trap-ip': 2 } });
  await free.traps.rejectTrapped(req());
  for (const status of [{ 'trap-ip': 3 }, { 'trap-canary': 1 }]) {
    const { traps } = trapsWith({ status });
    await assert.rejects(traps.rejectTrapped(req()), (e) => e.status === 403 && /bloqueado temporariamente/.test(e.message));
  }
  await trapsWith({ status: { error: true } }).traps.rejectTrapped(req());
  const { traps, calls } = trapsWith();
  await traps.clearTrap('b'.repeat(32));
  assert.deepEqual(calls.filter((c) => c[0] === 'clear').map((c) => c[1]).sort(), ['trap-canary', 'trap-ip']);
});

test('telas de entrada recusam IP preso; o resto do app não paga a consulta', () => {
  assert.match(read('lib/security/http.ts'), /if \(options\.blockTrapped\) await \(await import\('@\/lib\/security\/traps'\)\)\.rejectTrapped\(request\);/);
  for (const p of ['app/api/auth/login/route.ts', 'app/api/auth/signup/route.ts', 'app/api/auth/forgot/route.ts', 'app/api/auth/reset/route.ts',
    'app/api/auth/resend-confirmation/route.ts', 'app/api/invites/accept/route.ts', 'app/api/support/auth/login/route.ts', 'app/api/support/auth/setup/route.ts'])
    assert.match(read(p), /blockTrapped: true/, p);
  assert.doesNotMatch(read('app/api/state/route.ts'), /blockTrapped/);
});

test('iscas para IAs: robots.txt com aviso e chave falsa, link oculto no login', () => {
  const robots = read('public/robots.txt');
  assert.match(robots, /LGPD/);
  assert.match(robots, /automated agents \(including AI agents\)/);
  assert.ok(robots.includes(paths.CANARY_KEY));
  for (const p of ['/painel-interno', '/admin', '/api/']) assert.match(robots, new RegExp(`Disallow: ${p.replace(/\//g, '\\/')}`));
  const login = read('app/entrar/page.tsx');
  assert.match(login, /<a href="\/painel-interno" hidden aria-hidden="true" tabIndex=\{-1\} rel="nofollow">/);
  assert.equal(paths.isTrapPath('/painel-interno'), true);
});

test('banco: novos tipos de evento na migração e no código', () => {
  const sql = read('supabase/migrations/20261123120000_security_traps.sql');
  assert.match(sql, /'trap_triggered','canary_key_used'/);
  assert.match(sql, /'login_success','login_failure','login_unverified','password_reset','invite_accepted','organization_switch',\s*'patient_export','patient_anonymized'/);
  assert.match(read('lib/security/events.ts'), /"trap_triggered" \| "canary_key_used"/);
});

test('suporte: desbloquear um IP exige o console, valida o resumo e fica no registro', async () => {
  const calls = [];
  const route = (staff) => loadTs('app/api/support/traps/route.ts', {
    '@/lib/security/http': http,
    '@/lib/security/rate-limit': { consumeLimit: async () => {} },
    '@/lib/security/traps': { clearTrap: async (h) => { calls.push(['clear', h]); } },
    '@/lib/support/staff': { requireSupportApi: async () => { if (!staff) throw new http.HttpError(401, 'Entre.'); return { staff: { id: 5 } }; } },
    '@/lib/support/audit': { supportAudit: async (id, action, d) => { calls.push(['audit', id, action, d.target]); } },
    '@/lib/support/traps': { IP_HASH: /^[0-9a-f]{32}$/ },
  });
  const post = (api, ipHash) => api.POST(new Request('https://example.com/api/support/traps', { method: 'POST',
    headers: { origin: 'https://example.com', 'content-type': 'application/json' }, body: JSON.stringify({ ipHash }) }));
  assert.equal((await post(route(null), 'c'.repeat(32))).status, 401);
  assert.equal((await post(route(true), 'not-a-hash')).status, 400);
  assert.equal((await post(route(true), 'c'.repeat(32))).status, 200);
  assert.deepEqual(calls, [['clear', 'c'.repeat(32)], ['audit', 5, 'trap_unlock', 'IP cccccccc…']]);
});

test('painel: armadilhas no Monitoramento e aviso quando nenhum canal de alerta está configurado', () => {
  const page = read('app/suporte/(console)/monitoramento/page.tsx');
  assert.match(page, /Armadilhas \(últimas 24 h\)/);
  assert.match(page, /channels\.length === 0 && /);
  assert.match(page, /ALERT_WEBHOOK_URL/);
  const env = { ...process.env };
  try {
    delete process.env.ALERT_WEBHOOK_URL; delete process.env.ALERT_EMAIL;
    const alert = loadTs('lib/monitor/alert.ts', { '@/lib/email': { emailConfigured: () => true, sendMail: async () => {} } });
    assert.equal(alert.alertChannels().length, 0);
    process.env.ALERT_WEBHOOK_URL = 'https://discord.example/hook';
    assert.equal(JSON.stringify(alert.alertChannels()), '["webhook"]');
    process.env.ALERT_WEBHOOK_URL = 'http://inseguro';
    assert.equal(alert.alertChannels().length, 0);
  } finally { process.env = env; }
});
