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
  const context = { session: { account: { id: 7, email: 's@rn.test' } }, tokenHash: 'th', mfaEnabled: enabled, mfaVerified: false, secretEnc: 'enc', lastStep };
  const table = (name) => ({
    update(values) { calls.push(['update', name, values]); return this; },
    eq() { return this; }, or(filter) { calls.push(['or', name, filter]); return this; },
    select: async () => ({ data: stepUpdated ? [{ user_id: 7 }] : [], error: null }),
    then(resolve) { resolve({ error: null }); },
  });
  const cache = new Map();
  const { HttpError } = loadTs('lib/security/http.ts', {}, cache);
  const api = loadTs('app/api/support/mfa/verify/route.ts', {
    '@/lib/support/staff': { requireSupportApi: async () => { if (!staff) throw new HttpError(404, 'Não encontrado.'); return context; } },
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
  assert.equal((await verifyApi({ staff: false, code }).post()).status, 404);

  const wrong = verifyApi({ code: code === '000000' ? '111111' : '000000' });
  assert.equal((await wrong.post()).status, 400);
  assert.ok(wrong.calls.some((c) => c[0] === 'consume' && c[1] === 'support-mfa-verify'));
  assert.ok(!wrong.calls.some((c) => c[0] === 'refund' || c[0] === 'audit'));

  const first = verifyApi({ code, enabled: false });
  assert.equal((await first.post()).status, 200);
  const stepUpdate = first.calls.find((c) => c[0] === 'update' && c[1] === 'platform_staff');
  assert.ok(stepUpdate[2].mfa_enabled_at, 'primeiro código ativa o 2FA');
  assert.match(first.calls.find((c) => c[0] === 'or')[2], /^mfa_last_step\.is\.null,mfa_last_step\.lt\.\d+$/);
  assert.ok(first.calls.find((c) => c[0] === 'update' && c[1] === 'sessions')[2].mfa_verified_at);
  assert.deepEqual(first.calls.filter((c) => c[0] === 'audit').map((c) => c[1]), ['mfa_enabled']);

  const again = verifyApi({ code, enabled: true });
  assert.equal((await again.post()).status, 200);
  assert.equal(again.calls.find((c) => c[0] === 'update' && c[1] === 'platform_staff')[2].mfa_enabled_at, undefined);
  assert.deepEqual(again.calls.filter((c) => c[0] === 'audit').map((c) => c[1]), ['mfa_verified']);

  const raced = verifyApi({ code, stepUpdated: false });
  assert.equal((await raced.post()).status, 400, 'mesmo código usado ao mesmo tempo em outra aba');
  assert.ok(!raced.calls.some((c) => c[0] === 'update' && c[1] === 'sessions'));
});

test('páginas e rotas do console exigem a equipe e o código confirmado', () => {
  const staff = read('lib/support/staff.ts');
  assert.match(staff, /\.from\("platform_staff"\)[\s\S]*\.eq\("active", true\)/);
  assert.match(staff, /if \(!context\) notFound\(\);/);
  assert.match(staff, /if \(options\.mfa !== false && !context\.mfaVerified\) redirect\("\/suporte\/verificar"\);/);
  assert.match(read('app/suporte/(console)/page.tsx'), /await requireSupportPage\(\);/);
  assert.match(read('app/suporte/verificar/page.tsx'), /requireSupportPage\(\{ mfa: false \}\)/);
  const setup = read('app/api/support/mfa/setup/route.ts');
  assert.match(setup, /if \(context\.mfaEnabled\) throw new HttpError\(409/);
  assert.match(setup, /\.is\("mfa_enabled_at", null\)/);
  assert.match(setup, /export const POST = secureMutation\(setup\)/);
});

test('console: moldura, visão geral e monitoramento também conferem a equipe', () => {
  for (const page of ['layout.tsx', 'page.tsx', 'monitoramento/page.tsx']) assert.match(read(`app/suporte/(console)/${page}`), /await requireSupportPage\(\);/, page);
  for (const route of ['run', 'incidents']) {
    const source = read(`app/api/support/monitor/${route}/route.ts`);
    assert.match(source, /await requireSupportApi\(\);/, route);
    assert.match(source, /supportAudit\(context\.session\.account\.id,/, route);
  }
  assert.match(read('app/api/support/monitor/run/route.ts'), /consumeLimit\("support-monitor-run", String\(context\.session\.account\.id\), 3, 600/);
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
