// Correções da revisão de 19/11/2026: conflitos nas sugestões, bloqueios do médico e travamentos de login.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './load-ts.mjs';

const read = (p) => readFileSync(p, 'utf8');

test('sugestões: desagendar não confere conflito, e o conflito é por profissional (médico ou anestesista)', () => {
  const workflow = read('app/api/workflow/route.ts');
  assert.match(workflow, /if \(row\.action !== "delete" && proposed && current\.some\(\(a\) => overlaps\(proposed, a\)\)\)/);
  assert.match(workflow, /function professionals\(a: Appointment\) \{ return \[a\.doctorId, a\.anesthetistId\]\.filter\(Boolean\)\.map\(String\); \}/);
  assert.doesNotMatch(workflow, /a\.doctorId !== b\.doctorId/, 'comparar só doctorId tratava dois "sem médico" como o mesmo profissional');
  // A mesma regra, executada: anestesistas diferentes não conflitam; o mesmo anestesista com cirurgiões diferentes, sim.
  const body = workflow.match(/function professionals[\s\S]*?\r?\n\}\r?\n/)[0];
  const { professionals, overlaps } = new Function(`${body.replace(/: (Appointment|unknown)/g, '')}; return { professionals, overlaps };`)();
  assert.ok(professionals);
  const at = (id, extra) => ({ id, date: '2026-12-01', time: '10:00', duration: 60, status: 'scheduled', ...extra });
  assert.equal(overlaps(at('1', { anesthetistId: 'an1' }), at('2', { anesthetistId: 'an2' })), false);
  assert.equal(overlaps(at('1', { doctorId: 'c1', anesthetistId: 'an1' }), at('2', { doctorId: 'c2', anesthetistId: 'an1' })), true);
  assert.equal(overlaps(at('1', { doctorId: 'c1' }), at('2', { doctorId: 'c1', time: '10:30' })), true);
  assert.equal(overlaps(at('1', { doctorId: 'c1' }), at('2', { doctorId: 'c1', time: '11:00' })), false);
});

test('bloqueios do médico: só os novos ou alterados são conferidos contra os atendimentos', () => {
  const state = read('app/api/state/route.ts');
  assert.match(state, /const changedBlocks = \(proposed\.scheduleBlocks \|\| \[\]\)\.filter\(\(b: Record<string, unknown>\) => knownBlocks\.get\(String\(b\.id\)\) !== canonical\("scheduleBlocks", b\)\);/);
  assert.match(state, /for \(const b of changedBlocks\) if \(/);
  assert.doesNotMatch(state, /for \(const b of proposed\.scheduleBlocks \|\| \[\]\)/);
});

test('login das clínicas: sem limite geral de falhas (um ataque distribuído travaria todo mundo)', () => {
  const login = read('app/api/auth/login/route.ts');
  assert.doesNotMatch(login, /login-failures-global/);
  assert.match(login, /consumeLimit\("login-ip", request\.headers\.get\("x-vercel-forwarded-for"\) \|\| "unknown", 30, 300\)/);
});

test('suporte: o link novo de acesso também tira o bloqueio por senha errada', async () => {
  const { SUPPORT_LOGIN_LIMITS } = loadTs('lib/support/staff.ts', { 'server-only': {}, 'next/headers': {}, 'next/navigation': {}, '@/app/passwords': {}, '@/lib/security/http': {}, '@/lib/supabase-admin': {} });
  assert.equal(JSON.stringify(SUPPORT_LOGIN_LIMITS.map((l) => [l.scope, l.limit, l.seconds])), JSON.stringify([['support-login-account', 5, 900], ['support-login-account-day', 10, 86400]]));
  assert.match(SUPPORT_LOGIN_LIMITS[1].message, /peça um novo link de acesso/);

  const calls = [];
  const db = {
    rpc: async () => ({ data: 12, error: null }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { email: 'suporte@rn.test' }, error: null }) }) }) }),
  };
  const api = loadTs('app/api/support/auth/setup/route.ts', {
    '@/app/passwords': { hashPassword: async () => ({ hash: 'h', salt: 's' }), hashToken: async () => 'th' },
    '@/lib/security/rate-limit': { consumeLimit: async () => {}, clearLimit: async (scope, id) => { calls.push(['clear', scope, id]); } },
    '@/lib/support/staff': { SUPPORT_LOGIN_LIMITS, SUPPORT_SETUP_TOKEN: /^[0-9a-f]{64}$/, startSupportSession: async () => { calls.push(['session']); } },
    '@/lib/support/audit': { supportAudit: async () => {} },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db, dbError: (e) => { if (e) throw e; } },
  });
  const response = await api.POST(new Request('https://example.com/api/support/auth/setup', { method: 'POST',
    headers: { origin: 'https://example.com', 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'a'.repeat(64), password: 'uma senha bem longa' }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls.filter((c) => c[0] === 'clear').map((c) => c[1]).sort(), ['support-login-account', 'support-login-account-day']);
  assert.ok(calls.filter((c) => c[0] === 'clear').every((c) => c[2] === 'suporte@rn.test'));
  assert.match(read('app/api/support/auth/login/route.ts'), /for \(const \{ scope, limit, seconds, message \} of SUPPORT_LOGIN_LIMITS\)/);
  assert.match(read('docs/runbook-incidentes.md'), /Conta do suporte bloqueada por senha errada/);
});
