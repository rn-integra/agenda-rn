// Suporte RN Integra: contas próprias da equipe, separadas das contas das clínicas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { BEFORE_SUPPORT } from './before-support.mjs';
import { loadTs } from './load-ts.mjs';

const read = (p) => readFileSync(p, 'utf8');
const ACCOUNTS = 'supabase/migrations/20261122120000_support_accounts.sql';
const BEFORE = ['20261119120000_support_staff', '20261119130000_monitor_snooze', '20261120120000_support_tickets', '20261121120000_support_assisted_access',
  '20261121130000_support_ticket_assignee', '20261121140000_support_audit_append_only'];

async function database(seed = '') {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema extensions; create schema vault;`);
  await db.exec(read('backups/schema/rn-integra-schema.sql').replace(/^create extension .*$/gm, ''));
  await db.exec(BEFORE_SUPPORT);
  for (const file of BEFORE) await db.exec(read(`supabase/migrations/${file}.sql`));
  await db.exec(`insert into public.users(id,email,name,role,active,created_at,updated_at) values
    (12,'Suporte@RN.test','Pessoa do Suporte','general_manager',true,now(),now()),
    (13,'antigo@rn.test','Ex-suporte','general_manager',true,now(),now());
    insert into public.platform_staff(user_id,mfa_secret_enc,mfa_enabled_at) values (12,'cifrado',now());
    insert into public.support_audit(staff_user_id,action) values (12,'monitor_run'),(13,'monitor_run');${seed}`);
  await db.exec(read(ACCOUNTS));
  await db.exec(read(ACCOUNTS)); // reaplicar não quebra
  return db;
}
const hashOf = async (db, token) => (await db.query(`select encode(sha256(convert_to($1,'UTF8')),'base64') h`, [token])).rows[0].h;

test('banco: a equipe antiga vira conta do suporte com o mesmo id, sem senha e sem platform_staff', async () => {
  const db = await database();
  const staff = (await db.query(`select id,email,name,active,mfa_secret_enc,password_hash from public.support_staff order by id`)).rows;
  assert.deepEqual(staff.map((s) => ({ ...s })), [
    { id: 12, email: 'suporte@rn.test', name: 'Pessoa do Suporte', active: true, mfa_secret_enc: 'cifrado', password_hash: null },
    { id: 13, email: 'antigo@rn.test', name: 'Ex-suporte', active: false, mfa_secret_enc: null, password_hash: null },
  ], 'mesmo id mantém o autenticador e o registro; quem só aparece no registro fica inativo');
  assert.equal((await db.query(`select to_regclass('public.platform_staff') r`)).rows[0].r, null);
  assert.deepEqual((await db.query(`select staff_id from public.support_audit order by id`)).rows.map((r) => r.staff_id), [12, 13]);
  await assert.rejects(() => db.query(`update public.support_audit set action='x'`), /não pode ser alterado/, 'a trava continua');
  await assert.rejects(() => db.query(`insert into public.support_audit(staff_id,action) values (999,'x')`), 'só contas do suporte no registro');
  await db.close();
});

test('banco: convite gera link de uso único; o link grava a senha e derruba sessões', async () => {
  const db = await database();
  const token = (await db.query(`select public.support_staff_invite('Nova@RN.test', 'Nova Pessoa') t`)).rows[0].t;
  assert.match(token, /^[0-9a-f]{64}$/);
  const id = (await db.query(`select id from public.support_staff where email='nova@rn.test'`)).rows[0].id;
  assert.ok(id > 100, 'contas novas não reaproveitam ids antigos');
  assert.equal((await db.query(`select count(*)::int n from public.support_setup_tokens where token_hash=$1`, [token])).rows[0].n, 0, 'o token puro não fica no banco');
  await db.query(`insert into public.support_sessions(token_hash,staff_id,expires_at) values ('velha',$1,now()+interval '1 hour')`, [id]);
  const hash = await hashOf(db, token);
  assert.equal((await db.query(`select public.support_staff_setup($1,'h','s') id`, [hash])).rows[0].id, id);
  assert.equal((await db.query(`select public.support_staff_setup($1,'h2','s2') id`, [hash])).rows[0].id, null, 'segunda vez não vale');
  assert.equal((await db.query(`select password_hash from public.support_staff where id=$1`, [id])).rows[0].password_hash, 'h');
  assert.equal((await db.query(`select count(*)::int n from public.support_sessions where staff_id=$1`, [id])).rows[0].n, 0);

  // Novo link para quem já tem conta: o anterior deixa de valer; o autenticador só zera se pedido.
  const first = (await db.query(`select public.support_staff_invite('suporte@rn.test') t`)).rows[0].t;
  const second = (await db.query(`select public.support_staff_invite('suporte@rn.test') t`)).rows[0].t;
  assert.equal((await db.query(`select public.support_staff_setup($1,'h','s') id`, [await hashOf(db, first)])).rows[0].id, null);
  assert.equal((await db.query(`select mfa_secret_enc from public.support_staff where id=12`)).rows[0].mfa_secret_enc, 'cifrado');
  await db.query(`select public.support_staff_invite('suporte@rn.test', null, true)`);
  assert.equal((await db.query(`select mfa_secret_enc from public.support_staff where id=12`)).rows[0].mfa_secret_enc, null);
  assert.equal((await db.query(`select public.support_staff_setup($1,'h','s') id`, [await hashOf(db, second)])).rows[0].id, null);

  const expired = (await db.query(`select public.support_staff_invite('vencido@rn.test') t`)).rows[0].t;
  await db.query(`update public.support_setup_tokens set expires_at=now()-interval '1 minute'`);
  assert.equal((await db.query(`select public.support_staff_setup($1,'h','s') id`, [await hashOf(db, expired)])).rows[0].id, null, 'link vencido');
  await assert.rejects(() => db.query(`select public.support_staff_invite('sem-arroba')`), /E-mail inválido/);
  await db.close();
});

test('banco: tabelas do suporte fechadas para o navegador; convite só por SQL da plataforma', async () => {
  const db = await database();
  for (const table of ['support_staff', 'support_sessions', 'support_setup_tokens']) {
    assert.equal((await db.query(`select relrowsecurity r from pg_class where oid='public.${table}'::regclass`)).rows[0].r, true, table);
    for (const role of ['anon', 'authenticated']) for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
      assert.equal((await db.query(`select has_table_privilege('${role}','public.${table}','${p}') ok`)).rows[0].ok, false, `${role} ${p} ${table}`);
  }
  const can = async (role, table, p) => (await db.query(`select has_table_privilege('${role}','public.${table}','${p}') ok`)).rows[0].ok;
  assert.equal(await can('service_role', 'support_staff', 'INSERT'), false, 'o servidor não cria contas do suporte');
  assert.equal(await can('service_role', 'support_staff', 'DELETE'), false);
  const fn = async (role, sig) => (await db.query(`select has_function_privilege('${role}','${sig}','EXECUTE') ok`)).rows[0].ok;
  for (const role of ['anon', 'authenticated', 'service_role']) assert.equal(await fn(role, 'public.support_staff_invite(text,text,boolean)'), false, role);
  assert.equal(await fn('service_role', 'public.support_staff_setup(text,text,text)'), true);
  assert.equal(await fn('anon', 'public.support_staff_setup(text,text,text)'), false);
  for (const name of ['support_staff_invite', 'support_staff_setup', 'assisted_session_context']) {
    const config = (await db.query(`select proconfig from pg_proc where proname=$1`, [name])).rows[0].proconfig;
    assert.ok(config.some((c) => c.startsWith('search_path=')), name);
  }
  await db.close();
});

test('banco: mensagens do suporte passam para a conta do suporte', async () => {
  const ORG = '00000000-0000-4000-8000-0000000000a1', ACCOUNT = '00000000-0000-4000-8000-00000000acc1';
  const db = await database(`
    insert into public.users(id,email,name,role,active,created_at,updated_at) values (7,'g@c.test','Gerente','general_manager',true,now(),now());
    insert into public.accounts(id,name,owner_user_id,plan,status,max_organizations,created_at,updated_at) values ('${ACCOUNT}','Conta',7,'trial','active',3,now(),now());
    insert into public.organizations(id,slug,name,kind,active,created_at,updated_at,account_id) values ('${ORG}','c','Clínica','CLINIC',true,now(),now(),'${ACCOUNT}');
    insert into public.support_tickets(organization_id,created_by,subject,category,assigned_staff_id) values ('${ORG}',7,'Ajuda','duvida',12);
    insert into public.support_ticket_messages(ticket_id,author_user_id,from_support,body) values (1,7,false,'Oi'),(1,12,true,'Olá');`);
  const rows = (await db.query(`select author_user_id a, author_staff_id s from public.support_ticket_messages order by id`)).rows;
  assert.deepEqual(rows.map((r) => ({ ...r })), [{ a: 7, s: null }, { a: null, s: 12 }]);
  await assert.rejects(() => db.query(`insert into public.support_ticket_messages(ticket_id,author_user_id,from_support,body) values (1,7,true,'x')`), 'suporte precisa da conta do suporte');
  await db.close();
});

function loginApi({ staff = { id: 12, active: true, password_hash: 'h', password_salt: 's' }, valid = true } = {}) {
  const calls = [];
  const api = loadTs('app/api/support/auth/login/route.ts', {
    '@/app/passwords': { hashPassword: async () => { calls.push(['hash']); }, verifyPassword: async () => valid },
    '@/lib/security/rate-limit': { consumeLimit: async (scope) => { calls.push(['consume', scope]); }, refundLimit: async (scope) => { calls.push(['refund', scope]); } },
    '@/lib/support/staff': { startSupportSession: async (id) => { calls.push(['session', id]); } },
    '@/lib/supabase-admin': { dbError() {}, getSupabaseAdmin: () => ({ from: (table) => ({
      select() { return this; }, eq(column, value) { calls.push(['lookup', table, value]); return this; }, maybeSingle: async () => ({ data: staff, error: null }) }) }) },
  });
  const post = (body) => api.POST(new Request('https://example.com/api/support/auth/login', { method: 'POST',
    headers: { origin: 'https://example.com', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { calls, post };
}

test('login do suporte: só contas do suporte, com limite de tentativas, e depois pede o código', async () => {
  const ok = loginApi();
  const response = await ok.post({ email: ' Suporte@RN.test ', password: 'senha-bem-longa' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).next, '/suporte/verificar');
  assert.deepEqual(ok.calls.find((c) => c[0] === 'lookup'), ['lookup', 'support_staff', 'suporte@rn.test'], 'procura só em support_staff');
  assert.deepEqual(ok.calls.find((c) => c[0] === 'session'), ['session', 12]);
  assert.equal(ok.calls.filter((c) => c[0] === 'refund').length, 2, 'senha certa não conta como erro');

  const wrong = loginApi({ valid: false });
  assert.equal((await wrong.post({ email: 's@rn.test', password: 'senha-bem-longa' })).status, 401);
  assert.ok(!wrong.calls.some((c) => c[0] === 'session' || c[0] === 'refund'));
  assert.deepEqual(wrong.calls.filter((c) => c[0] === 'consume').map((c) => c[1]), ['support-login-account', 'support-login-account-day']);

  for (const staff of [null, { id: 13, active: false, password_hash: 'h', password_salt: 's' }, { id: 14, active: true, password_hash: null, password_salt: null }]) {
    const refused = loginApi({ staff });
    assert.equal((await refused.post({ email: 's@rn.test', password: 'senha-bem-longa' })).status, 401);
    assert.ok(refused.calls.some((c) => c[0] === 'hash'), 'mesmo tempo de resposta');
    assert.ok(!refused.calls.some((c) => c[0] === 'session'));
  }
});

test('conta do suporte: cookie e token próprios, sem organização, Hub ou agenda', () => {
  const staff = read('lib/support/staff.ts');
  assert.match(staff, /export const SUPPORT_COOKIE = "rn_support_session";/);
  assert.match(staff, /export const SUPPORT_TOKEN = \/\^\[0-9a-f-\]\{147\}\$\/;/);
  assert.ok(!staff.includes('getSession'), 'não usa a sessão das clínicas');
  assert.match(staff, /sameSite: "strict"/);
  const { SUPPORT_TOKEN, newSupportToken } = loadTs('lib/support/staff.ts', { 'next/headers': {}, 'next/navigation': {}, '@/app/passwords': {}, '@/lib/security/http': {}, '@/lib/supabase-admin': {} });
  const token = newSupportToken();
  assert.ok(SUPPORT_TOKEN.test(token));
  assert.ok(!/^[0-9a-f-]{73}$/.test(token) && !/^[0-9a-f-]{110}$/.test(token), 'não serve como sessão da clínica nem assistida');
  const layout = read('app/suporte/(console)/layout.tsx');
  assert.ok(!layout.includes('Voltar ao app') && !layout.includes('href="/"'), 'console sem caminho para o app');
  assert.match(read('app/suporte/(console)/logout-button.tsx'), /\/api\/support\/auth\/logout[\s\S]*\/suporte\/entrar/);
  const forms = read('app/suporte/auth-forms.tsx');
  assert.match(forms, /window\.location\.hash/, 'token do primeiro acesso no # (não vai ao servidor)');
  const setup = read('app/api/support/auth/setup/route.ts');
  assert.match(setup, /rpc\("support_staff_setup"/);
  assert.match(setup, /supportAudit\(staffId, "password_set"\)/);
  for (const route of ['login', 'setup', 'logout']) assert.match(read(`app/api/support/auth/${route}/route.ts`), /secureMutation\(\w+, \{ allowAssisted: true \}\)/, route);
  const login = read('app/api/support/auth/login/route.ts');
  assert.ok(!login.includes('from("users")'), 'conta de clínica não entra no console');
});
