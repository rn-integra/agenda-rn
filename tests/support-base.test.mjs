// Suporte RN Integra, fase 1: equipe da plataforma, 2FA (TOTP) e registro de auditoria.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { loadTs } from './load-ts.mjs';

const MIGRATION = 'supabase/migrations/20261119120000_support_staff.sql';
const read = (p) => readFileSync(p, 'utf8');
const totp = loadTs('lib/support/totp.ts');
// Segredo do apêndice B da RFC 6238 ("12345678901234567890" em base32).
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('TOTP segue os vetores da RFC 6238 (6 dígitos)', async () => {
  assert.equal(totp.base32Encode(new TextEncoder().encode('12345678901234567890')), RFC_SECRET);
  assert.equal(await totp.totpCode(RFC_SECRET, totp.currentStep(59_000)), '287082');
  assert.equal(await totp.totpCode(RFC_SECRET, totp.currentStep(1111111109_000)), '081804');
  assert.equal(await totp.totpCode(RFC_SECRET, totp.currentStep(2000000000_000)), '279037');
  assert.equal(totp.base32Decode(totp.newTotpSecret()).length, 20);
});

test('TOTP aceita um intervalo de folga e nunca o mesmo código duas vezes', async () => {
  const now = 1111111109_000, step = totp.currentStep(now);
  const code = await totp.totpCode(RFC_SECRET, step);
  assert.equal(await totp.matchTotp(RFC_SECRET, code, null, now), step);
  assert.equal(await totp.matchTotp(RFC_SECRET, code, null, now + 30_000), step, 'relógio 30 s adiantado');
  assert.equal(await totp.matchTotp(RFC_SECRET, code, null, now + 90_000), null, 'código velho');
  assert.equal(await totp.matchTotp(RFC_SECRET, code, step, now), null, 'reuso do mesmo intervalo');
  assert.equal(await totp.matchTotp(RFC_SECRET, '12345a', null, now), null);
  assert.match(totp.otpauthUri(RFC_SECRET, 'suporte@rn.test'), /^otpauth:\/\/totp\/RN%20Integra%20Suporte%3Asuporte%40rn\.test\?secret=GEZD.*&issuer=RN%20Integra/);
});

test('segredo do autenticador é cifrado e preso ao usuário', async () => {
  const env = { ...process.env };
  try {
    process.env.SUPABASE_SECRET_KEY = 'chave-de-teste';
    const { encryptMfaSecret, decryptMfaSecret } = loadTs('lib/support/mfa-crypto.ts');
    const stored = await encryptMfaSecret(RFC_SECRET, 7);
    assert.match(stored, /^v1\./);
    assert.ok(!stored.includes(RFC_SECRET));
    assert.equal(await decryptMfaSecret(stored, 7), RFC_SECRET);
    await assert.rejects(() => decryptMfaSecret(stored, 8), 'copiado para outro usuário não abre');
    process.env.SUPABASE_SECRET_KEY = 'outra-chave';
    await assert.rejects(() => decryptMfaSecret(stored, 7), 'chave trocada não abre');
  } finally { process.env = env; }
});

test('confirmação do código vale 12 h na sessão', () => {
  const { mfaStillValid } = loadTs('lib/support/staff.ts', { 'next/navigation': {}, '@/app/authz': {}, '@/lib/supabase-admin': {} });
  const now = Date.parse('2026-11-19T12:00:00Z');
  assert.equal(mfaStillValid(null, now), false);
  assert.equal(mfaStillValid('2026-11-19T01:00:00Z', now), true);
  assert.equal(mfaStillValid('2026-11-18T23:59:00Z', now), false);
  assert.equal(mfaStillValid('2026-11-19T12:30:00Z', now), false, 'data no futuro não vale');
});

test('banco: tabelas do suporte fechadas para o navegador e auditoria só acrescenta', async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema extensions; create schema vault;`);
  await db.exec(read('backups/schema/rn-integra-schema.sql').replace(/^create extension .*$/gm, ''));
  await db.exec(read(MIGRATION));
  await db.exec(read(MIGRATION)); // reaplicar não quebra
  for (const table of ['platform_staff', 'support_audit']) {
    const rls = await db.query(`select relrowsecurity r from pg_class where oid = 'public.${table}'::regclass`);
    assert.equal(rls.rows[0].r, true, table + ' com RLS');
    for (const role of ['anon', 'authenticated']) for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const r = await db.query(`select has_table_privilege('${role}','public.${table}','${p}') ok`);
      assert.equal(r.rows[0].ok, false, `${role} ${p} ${table}`);
    }
  }
  const audit = async (p) => (await db.query(`select has_table_privilege('service_role','public.support_audit','${p}') ok`)).rows[0].ok;
  assert.deepEqual([await audit('SELECT'), await audit('INSERT'), await audit('UPDATE'), await audit('DELETE')], [true, true, false, false]);
  const column = await db.query(`select 1 from information_schema.columns where table_name='sessions' and column_name='mfa_verified_at'`);
  assert.equal(column.rows.length, 1);
  await assert.rejects(() => db.query(`insert into public.platform_staff(user_id, role) values (1, 'admin')`), 'só o papel support existe');
  await db.close();
});

function verifyApi({ staff = true, code, lastStep = null, enabled = true, stepUpdated = true }) {
  const calls = [];
  const context = { staff: { id: 7, email: 's@rn.test', name: 'S' }, tokenHash: 'th', mfaEnabled: enabled, mfaVerified: false, secretEnc: 'enc', lastStep };
  const table = (name) => ({
    update(values) { calls.push(['update', name, values]); return this; },
    eq() { return this; }, or(filter) { calls.push(['or', name, filter]); return this; },
    select: async () => ({ data: stepUpdated ? [{ id: 7 }] : [], error: null }),
    then(resolve) { resolve({ error: null }); },
  });
  const cache = new Map();
  const { HttpError } = loadTs('lib/security/http.ts', {}, cache);
  const api = loadTs('app/api/support/mfa/verify/route.ts', {
    '@/lib/support/staff': { requireSupportApi: async () => { if (!staff) throw new HttpError(401, 'Entre no console do suporte.'); return context; } },
    '@/lib/support/mfa-crypto': { decryptMfaSecret: async () => RFC_SECRET },
    '@/lib/support/audit': { supportAudit: async (id, action) => { calls.push(['audit', action]); } },
    '@/lib/security/rate-limit': { consumeLimit: async (scope) => { calls.push(['consume', scope]); }, refundLimit: async (scope) => { calls.push(['refund', scope]); } },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => ({ from: table }), dbError() {} },
  }, cache);
  const post = () => api.POST(new Request('https://example.com/api/support/mfa/verify', { method: 'POST',
    headers: { origin: 'https://example.com', 'content-type': 'application/json' }, body: JSON.stringify({ code }) }));
  return { calls, post };
}

test('API: só a equipe chega ao 2FA; código certo libera a sessão e fica registrado', async () => {
  const code = await totp.totpCode(RFC_SECRET, totp.currentStep());
  assert.equal((await verifyApi({ staff: false, code }).post()).status, 401);

  const wrong = verifyApi({ code: code === '000000' ? '111111' : '000000' });
  assert.equal((await wrong.post()).status, 400);
  assert.ok(wrong.calls.some((c) => c[0] === 'consume' && c[1] === 'support-mfa-verify'));
  assert.ok(!wrong.calls.some((c) => c[0] === 'refund' || c[0] === 'audit'));

  const first = verifyApi({ code, enabled: false });
  assert.equal((await first.post()).status, 200);
  const stepUpdate = first.calls.find((c) => c[0] === 'update' && c[1] === 'support_staff');
  assert.ok(stepUpdate[2].mfa_enabled_at, 'primeiro código ativa o 2FA');
  assert.match(first.calls.find((c) => c[0] === 'or')[2], /^mfa_last_step\.is\.null,mfa_last_step\.lt\.\d+$/);
  assert.ok(first.calls.find((c) => c[0] === 'update' && c[1] === 'support_sessions')[2].mfa_verified_at);
  assert.deepEqual(first.calls.filter((c) => c[0] === 'audit').map((c) => c[1]), ['mfa_enabled']);

  const again = verifyApi({ code, enabled: true });
  assert.equal((await again.post()).status, 200);
  assert.equal(again.calls.find((c) => c[0] === 'update' && c[1] === 'support_staff')[2].mfa_enabled_at, undefined);
  assert.deepEqual(again.calls.filter((c) => c[0] === 'audit').map((c) => c[1]), ['mfa_verified']);

  const raced = verifyApi({ code, stepUpdated: false });
  assert.equal((await raced.post()).status, 400, 'mesmo código usado ao mesmo tempo em outra aba');
  assert.ok(!raced.calls.some((c) => c[0] === 'update' && c[1] === 'support_sessions'));
});

test('páginas e rotas do console exigem a equipe e o código confirmado', () => {
  const staff = read('lib/support/staff.ts');
  assert.match(staff, /\.from\("support_sessions"\)[\s\S]*support_staff!inner\(/);
  assert.match(staff, /if \(!result\.data \|\| !staff\?\.active\) return null;/);
  assert.match(staff, /if \(!context\) redirect\("\/suporte\/entrar"\);/);
  assert.match(staff, /if \(options\.mfa !== false && !context\.mfaVerified\) redirect\("\/suporte\/verificar"\);/);
  assert.match(read('app/suporte/(console)/page.tsx'), /await requireSupportPage\(\);/);
  assert.match(read('app/suporte/verificar/page.tsx'), /requireSupportPage\(\{ mfa: false \}\)/);
  const setup = read('app/api/support/mfa/setup/route.ts');
  assert.match(setup, /if \(context\.mfaEnabled\) throw new HttpError\(409/);
  assert.match(setup, /\.is\("mfa_enabled_at", null\)/);
  assert.match(setup, /export const POST = secureMutation\(setup, \{ allowAssisted: true \}\)/);
});

test('console: moldura, visão geral e monitoramento também conferem a equipe', () => {
  for (const page of ['layout.tsx', 'page.tsx', 'monitoramento/page.tsx']) assert.match(read(`app/suporte/(console)/${page}`), /await requireSupportPage\(\);/, page);
  for (const route of ['run', 'incidents']) {
    const source = read(`app/api/support/monitor/${route}/route.ts`);
    assert.match(source, /await requireSupportApi\(\);/, route);
    assert.match(source, /supportAudit\(context\.staff\.id,/, route);
  }
  assert.match(read('app/api/support/monitor/run/route.ts'), /consumeLimit\("support-monitor-run", String\(context\.staff\.id\), 3, 600/);
  assert.match(read('app/api/support/monitor/incidents/route.ts'), /\.eq\("environment", environment\(\)\)\.is\("resolved_at", null\)/);
});

test('monitoramento: semáforo, rotinas atrasadas e gráfico de 14 dias', () => {
  const m = loadTs('lib/support/monitor.ts', { '@/lib/supabase-admin': {}, '@/lib/monitor/report': { environment: () => 'preview' } });
  const now = Date.parse('2026-11-19T15:00:00Z');
  const fresh = [{ name: 'monitor', last_run_at: '2026-11-19T14:50:00Z', ok: true }];
  assert.equal(m.overallStatus([], fresh, now).tone, 'ok');
  assert.equal(m.overallStatus([{ severity: 'warning' }], fresh, now).tone, 'warning');
  assert.equal(m.overallStatus([{ severity: 'error' }], fresh, now).tone, 'error');
  assert.equal(m.overallStatus([{ severity: 'warning' }, { severity: 'critical' }], fresh, now).tone, 'critical');
  assert.equal(m.overallStatus([], [{ name: 'monitor', last_run_at: '2026-11-19T13:00:00Z', ok: true }], now).label, 'Monitor sem rodar');
  assert.equal(m.heartbeatLate(undefined, 'maintenance', now), true);
  assert.equal(m.heartbeatLate({ name: 'maintenance', last_run_at: '2026-11-18T18:00:00Z', ok: true }, 'maintenance', now), false);
  const daily = m.dailyCounts([{ first_seen: '2026-11-19T12:00:00Z' }, { first_seen: '2026-11-19T02:00:00Z' }, { first_seen: '2026-10-01T00:00:00Z' }], now);
  assert.equal(daily.length, 14);
  assert.equal(daily.at(-1).day, '2026-11-19');
  assert.equal(daily.at(-1).count, 1, '02:00 UTC ainda é dia 18 em São Paulo');
  assert.equal(daily.at(-2).count, 1);
  assert.equal(m.playbookFor('db-network').auto, 'transient');
});

test('banco: aviso silenciado não repete, mas avisa se piorar', async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema extensions; create schema vault;`);
  await db.exec(read('backups/schema/rn-integra-schema.sql').replace(/^create extension .*$/gm, ''));
  await db.exec(read('supabase/migrations/20261119130000_monitor_snooze.sql'));
  const record = async (severity) => (await db.query(`select public.record_monitor_incident('check:teste:x','production','check',$1,'Teste',null,null,null) r`, [severity])).rows[0].r;
  assert.equal((await record('warning')).alert, true);
  await db.query(`update public.monitor_incidents set alerted_at = now() - interval '2 days', snoozed_until = now() + interval '1 day'`);
  assert.equal((await record('warning')).alert, false, 'silenciado: não avisa de novo');
  assert.equal((await record('critical')).alert, true, 'piorou: avisa mesmo silenciado');
  await db.query(`update public.monitor_incidents set alerted_at = now() - interval '2 days', snoozed_until = now() - interval '1 minute'`);
  assert.equal((await record('critical')).alert, true, 'fim do silêncio: volta a avisar');
  const r = await db.query(`select has_function_privilege('anon','public.record_monitor_incident(text,text,text,text,text,text,text,uuid,text,text,integer)','EXECUTE') a`);
  assert.equal(r.rows[0].a, false);
  await db.close();
});

function userActionApi({ member = { id: 9, name: 'Ana', email: 'Ana@Clinica.test', active: true }, staffId = 7, email = true } = {}) {
  const calls = [];
  const cache = new Map();
  const env = { ...process.env };
  if (email) { process.env.RESEND_API_KEY = 'x'; process.env.EMAIL_FROM = 'y'; } else { delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM; }
  const api = loadTs('app/api/support/organizations/users/route.ts', {
    '@/lib/support/staff': { requireSupportApi: async () => ({ staff: { id: staffId } }) },
    '@/lib/support/audit': { supportAudit: async (id, action, details) => { calls.push(['audit', action, details.organizationId]); } },
    '@/lib/support/organizations': { membershipInOrganization: async () => member },
    '@/lib/security/rate-limit': {
      LOGIN_FAILURE_LIMITS: [{ scope: 'login-account' }, { scope: 'login-account-day' }],
      clearLimit: async (scope, id) => { calls.push(['clear', scope, id]); }, consumeLimit: async (scope) => { calls.push(['consume', scope]); },
    },
    '@/lib/email': { appOrigin: () => 'https://x.test', emailConfigured: () => email, newEmailToken: () => ({ token: 't', hash: 'h' }),
      emails: { reset: (to) => ({ to }) }, sendMail: async (mail) => { calls.push(['mail', mail.to]); } },
    '@/lib/supabase-admin': { dbError() {}, getSupabaseAdmin: () => ({
      from: () => ({ delete() { calls.push(['delete']); return this; }, eq() { return this; }, select: async () => ({ data: [{ id: 1 }, { id: 2 }], error: null }) }),
      rpc: async (fn) => { calls.push(['rpc', fn]); return { data: { email: 'ana@clinica.test' }, error: null }; } }) },
  }, cache);
  process.env = env;
  const post = (body) => api.POST(new Request('https://example.com/api/support/organizations/users', { method: 'POST',
    headers: { origin: 'https://example.com', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { calls, post };
}

const ORG = '00000000-0000-4000-8000-0000000000a1';

test('organizações: desbloquear zera os limites de login pelo e-mail e fica registrado', async () => {
  const unlock = userActionApi();
  assert.equal((await unlock.post({ organizationId: ORG, userId: 9, action: 'unlock' })).status, 200);
  assert.deepEqual(unlock.calls.filter((c) => c[0] === 'clear').map((c) => c.slice(1)), [['login-account', 'ana@clinica.test'], ['login-account-day', 'ana@clinica.test']]);
  assert.deepEqual(unlock.calls.filter((c) => c[0] === 'audit'), [['audit', 'user_unlock', ORG]]);

  assert.equal((await userActionApi({ member: null }).post({ organizationId: ORG, userId: 9, action: 'unlock' })).status, 404, 'pessoa de outra organização');
  assert.equal((await userActionApi().post({ organizationId: ORG, userId: 9, action: 'set_password' })).status, 400, 'não existe ação de definir senha');
});

test('organizações: encerrar sessões e link de nova senha', async () => {
  const end = userActionApi();
  const response = await end.post({ organizationId: ORG, userId: 9, action: 'end_sessions' });
  assert.equal(response.status, 200);
  assert.match((await response.json()).message, /^2 sessão/);
  // Conta do suporte não é usuário da clínica: o mesmo número não quer dizer a mesma pessoa.
  assert.equal((await userActionApi({ staffId: 9 }).post({ organizationId: ORG, userId: 9, action: 'end_sessions' })).status, 200);

  const reset = userActionApi();
  assert.equal((await reset.post({ organizationId: ORG, userId: 9, action: 'reset_link' })).status, 200);
  assert.ok(reset.calls.some((c) => c[0] === 'rpc' && c[1] === 'request_password_reset'));
  assert.deepEqual(reset.calls.filter((c) => c[0] === 'mail').map((c) => c[1]), ['Ana@Clinica.test'], 'o link vai para o e-mail da pessoa, nunca para o suporte');
  const noEmail = userActionApi({ email: false });
  assert.equal((await noEmail.post({ organizationId: ORG, userId: 9, action: 'reset_link' })).status, 409, 'sem e-mail configurado não gera link');
  assert.ok(!noEmail.calls.some((c) => c[0] === 'rpc'), 'nem gera link nem vira incidente');
});

test('organizações: páginas exigem a equipe, a ficha fica registrada e nada de pacientes', () => {
  const list = read('app/suporte/(console)/organizacoes/page.tsx'), detail = read('app/suporte/(console)/organizacoes/[id]/page.tsx');
  assert.match(list, /await requireSupportPage\(\);/);
  assert.match(detail, /await requireSupportPage\(\);/);
  assert.match(detail, /supportAudit\(staff\.id, "organization_view"/);
  const data = read('lib/support/organizations.ts');
  for (const table of ['patients', 'appointments', 'app_state', 'financial']) assert.ok(!data.includes(`from("${table}`), table);
  const { matchesSearch } = loadTs('lib/support/organizations.ts', { '@/lib/supabase-admin': {}, '@/lib/security/rate-limit': {} });
  assert.equal(matchesSearch('Clínica São José', 'sao jose'), true);
  assert.equal(matchesSearch('Clínica São José', 'outra'), false);
});

test('registro: visão geral mostra só as 5 últimas e o resto fica na página com filtros', () => {
  const home = read('app/suporte/(console)/page.tsx');
  assert.match(home, /const RECENT_ACTIVITY = 5;/);
  assert.match(home, /\.limit\(RECENT_ACTIVITY\)/);
  assert.match(home, /href="\/suporte\/registro"/);
  assert.match(read('app/suporte/(console)/registro/page.tsx'), /await requireSupportPage\(\);/);
  assert.match(read('app/api/support/audit/export/route.ts'), /await requireSupportApi\(\);[\s\S]*supportAudit\(staffId, "audit_export"/);
  const help = read('app/ajuda/page.tsx');
  assert.match(help, /const CLINIC_LOG_SIZE = 8;/);
  assert.ok(!help.includes('overflow-y-auto'), 'sem rolagem sem fim no registro da clínica');
});

test('registro: filtros da URL são validados e o CSV não vira fórmula', () => {
  const log = loadTs('lib/support/audit-log.ts', { '@/lib/supabase-admin': {} });
  const f = log.parseAuditFilters({ pessoa: '12', acao: 'user_unlock', organizacao: '  Clínica  ', busca: '#12', de: '2026-11-01', ate: '2026-11-30', pagina: '3' });
  assert.deepEqual({ ...f }, { staff: 12, action: 'user_unlock', org: 'Clínica', q: '#12', from: '2026-11-01', to: '2026-11-30', page: 3 });
  const bad = log.parseAuditFilters({ pessoa: 'x', acao: 'drop table', de: '01/11/2026', pagina: '-4' });
  assert.deepEqual({ ...bad }, { staff: null, action: null, org: null, q: null, from: null, to: null, page: 1 });
  assert.equal(log.dayStart('2026-11-17'), '2026-11-17T03:00:00.000Z', 'dia de São Paulo');
  assert.equal(log.dayEnd('2026-11-17'), '2026-11-18T03:00:00.000Z');
  assert.equal(log.likePattern('50%_a'), '%50' + String.fromCharCode(92) + '%' + String.fromCharCode(92) + '_a%', '% e _ viram letras');
  const csv = log.auditCsv([{ id: 1, created_at: '2026-11-17T12:00:00Z', staff_id: 12, staffName: '=HYPERLINK("x")', action: 'user_unlock',
    organization_id: 'o', organization: 'Clínica "A"', target: 'Ana', metadata: {} }]);
  assert.ok(csv.startsWith('﻿"Data e hora (UTC)";'));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`), 'texto com = vira texto, não fórmula');
  assert.ok(csv.includes('"Clínica ""A"""'));
  assert.ok(csv.includes('"desbloqueou o login de uma pessoa"'));
});

test('banco: registro do suporte recusa alterar, apagar e truncar, para qualquer papel', async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema extensions; create schema vault;`);
  await db.exec(read('backups/schema/rn-integra-schema.sql').replace(/^create extension .*$/gm, ''));
  await db.exec(read(MIGRATION));
  await db.exec(read('supabase/migrations/20261121140000_support_audit_append_only.sql'));
  await db.exec(read('supabase/migrations/20261121140000_support_audit_append_only.sql')); // reaplicar não quebra
  await db.exec(`insert into public.users(id,email,name,role,active,created_at,updated_at) values (12,'s@rn.test','S','general_manager',true,now(),now());
    insert into public.support_audit(staff_user_id, action, target) values (12, 'organization_view', 'Clínica')`);
  await assert.rejects(() => db.query(`update public.support_audit set target = 'outra'`), /não pode ser alterado/);
  await assert.rejects(() => db.query(`delete from public.support_audit`), /não pode ser alterado/);
  await assert.rejects(() => db.query(`truncate public.support_audit`), /não pode ser alterado/);
  assert.equal((await db.query(`select target from public.support_audit`)).rows[0].target, 'Clínica');
  await db.query(`insert into public.support_audit(staff_user_id, action) values (12, 'monitor_run')`);
  assert.equal((await db.query(`select count(*)::int n from public.support_audit`)).rows[0].n, 2, 'acrescentar continua funcionando');
  await db.close();
});
