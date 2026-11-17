// Suporte RN Integra, fase 5: acesso assistido com liberação da gerência, somente leitura.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { BEFORE_SUPPORT } from './before-support.mjs';
import { loadTs } from './load-ts.mjs';

const read = (p) => readFileSync(p, 'utf8');
const ORG = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000b2';
const ACCOUNT = '00000000-0000-4000-8000-00000000acc1';

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema extensions; create schema vault;`);
  await db.exec(read('backups/schema/rn-integra-schema.sql').replace(/^create extension .*$/gm, ''));
  await db.exec(BEFORE_SUPPORT);
  await db.exec(read('supabase/migrations/20261119120000_support_staff.sql'));
  for (const file of ['20261120120000_support_tickets', '20261121120000_support_assisted_access', '20261121130000_support_ticket_assignee',
    '20261121140000_support_audit_append_only', '20261122120000_support_accounts']) await db.exec(read(`supabase/migrations/${file}.sql`));
  await db.exec(read('supabase/migrations/20261121120000_support_assisted_access.sql')); // reaplicar não quebra
  await db.exec(read('supabase/migrations/20261122120000_support_accounts.sql'));
  await db.exec(`
    insert into public.users(id,email,name,role,active,created_at,updated_at) values
      (7,'gerente@clinica.test','Gerente','general_manager',true,now(),now()),
      (8,'secretaria@clinica.test','Secretária','secretary',true,now(),now());
    insert into public.accounts(id,name,owner_user_id,plan,status,max_organizations,created_at,updated_at)
      values ('${ACCOUNT}','Conta',7,'trial','active',3,now(),now());
    insert into public.organizations(id,slug,name,kind,active,created_at,updated_at,account_id) values
      ('${ORG}','clinica','Clínica','CLINIC',true,now(),now(),'${ACCOUNT}'),
      ('${OTHER}','outra','Outra','CLINIC',true,now(),now(),'${ACCOUNT}');
    insert into public.organization_memberships(organization_id,user_id,role,active,created_at,updated_at) values
      ('${ORG}',7,'general_manager',true,now(),now()), ('${OTHER}',7,'general_manager',true,now(),now()),
      ('${ORG}',8,'secretary',true,now(),now());
    insert into public.support_staff(id,email,name) values (12,'suporte@rn.test','Pessoa do Suporte');`);
  return db;
}

const context = async (db, hash) => (await db.query(`select public.assisted_session_context($1) c`, [hash])).rows[0].c;

test('banco: sessão assistida só vale com liberação ativa, na mesma organização e com o suporte ativo', async () => {
  const db = await database();
  const grant = (await db.query(`insert into public.support_access_grants(organization_id,granted_by,expires_at)
    values ('${ORG}',7,now()+interval '1 hour') returning id`)).rows[0].id;
  await db.query(`insert into public.sessions(token_hash,user_id,organization_id,expires_at,created_at,support_grant_id,support_staff_id)
    values ('assist',7,'${ORG}',now()+interval '1 hour',now(),$1,12), ('normal',7,'${ORG}',now()+interval '1 hour',now(),null,null)`, [grant]);

  const ok = await context(db, 'assist');
  assert.equal(ok.account.id, 7, 'vê como a gerência que liberou');
  assert.equal(ok.organization.id, ORG);
  assert.equal(ok.assist.staffName, 'Pessoa do Suporte');
  assert.equal(ok.assist.staffId, 12);
  assert.equal(await context(db, 'normal'), null, 'sessão comum não vira assistida');

  await db.exec(`update public.support_staff set active=false where id=12`);
  assert.equal(await context(db, 'assist'), null, 'suporte fora da equipe');
  await db.exec(`update public.support_staff set active=true where id=12`);

  await db.exec(`update public.organization_memberships set active=false where user_id=7 and organization_id='${ORG}'`);
  assert.equal(await context(db, 'assist'), null, 'quem liberou deixou a organização: não cai em outra organização dele');
  await db.exec(`update public.organization_memberships set active=true where user_id=7 and organization_id='${ORG}'`);

  await db.exec(`update public.support_access_grants set revoked_at=now() where id=${grant}`);
  assert.equal(await context(db, 'assist'), null, 'liberação encerrada');

  await assert.rejects(() => db.query(`insert into public.support_access_grants(organization_id,granted_by,created_at,expires_at)
    values ('${ORG}',7,now(),now()+interval '2 days')`), 'no máximo 24 h');
  await assert.rejects(() => db.query(`insert into public.sessions(token_hash,user_id,organization_id,expires_at,created_at,support_grant_id)
    values ('meia',7,'${ORG}',now()+interval '1 hour',now(),${grant})`), 'liberação sem pessoa do suporte');

  const rls = await db.query(`select relrowsecurity r from pg_class where oid='public.support_access_grants'::regclass`);
  assert.equal(rls.rows[0].r, true);
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query(`select has_table_privilege('${role}','public.support_access_grants','SELECT') ok`)).rows[0].ok, false);
    assert.equal((await db.query(`select has_function_privilege('${role}','public.assisted_session_context(text)','EXECUTE') ok`)).rows[0].ok, false);
  }
  await db.close();
});

test('sessão: token assistido tem formato próprio e nunca passa pelo cookie comum', () => {
  const authz = read('app/authz.ts');
  assert.match(authz, /export const ASSIST_TOKEN = \/\^\[0-9a-f-\]\{110\}\$\/;/);
  assert.match(authz, /if \(!token \|\| !\/\^\[0-9a-f-\]\{73\}\$\/\.test\(token\)\) return null;/, 'cookie comum só aceita 73 caracteres');
  assert.match(authz, /rpc\("assisted_session_context"/);
  const start = read('app/api/support/assist/start/route.ts');
  assert.match(start, /\[randomUUID\(\), randomUUID\(\), randomUUID\(\)\]\.join\("-"\)/);
  assert.match(start, /set\(ASSIST_COOKIE, token, \{ httpOnly: true, secure: true, sameSite: "strict"/);
  assert.match(start, /await requireSupportApi\(\);/);
  assert.match(start, /if \(!grant\) throw new HttpError\(409/);
  assert.match(start, /supportAudit\(staffId, "assist_start"/);
  const { sessionFromContext } = loadTs('app/authz.ts', { 'next/headers': {}, '@/lib/supabase-admin': {} });
  const base = { account: { id: 7, role: 'general_manager', name: 'G' }, organization: { id: ORG } };
  assert.equal(sessionFromContext(base).account.assist, undefined);
  assert.equal(sessionFromContext({ ...base, assist: { staffId: 12, staffName: 'S', grantId: 3, expiresAt: '2026-11-21T12:00:00Z' } }).account.assist.grantId, 3);
});

function mutation({ cookie, assisted, allowAssisted = false }) {
  const cache = new Map();
  const calls = [];
  const http = loadTs('lib/security/http.ts', {
    '@/app/authz': { assistedSession: async () => { calls.push('checked'); return assisted ? { account: { id: 7 } } : null; } },
    '@/lib/monitor/report': { reportError: async () => {} },
  }, cache);
  const handler = http.secureMutation(async () => { calls.push('handler'); return Response.json({ ok: true }); }, { allowAssisted });
  const response = handler(new Request('https://example.com/api/x', { method: 'POST',
    headers: { origin: 'https://example.com', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: '{}' }));
  return { calls, response };
}

test('somente leitura: com acesso assistido valendo, nenhuma gravação passa', async () => {
  const blocked = mutation({ cookie: 'agenda_rn_session=a; agenda_rn_assist=b', assisted: true });
  assert.equal((await blocked.response).status, 403);
  assert.deepEqual(blocked.calls, ['checked']);

  const stale = mutation({ cookie: 'agenda_rn_assist=b', assisted: false });
  assert.equal((await stale.response).status, 200, 'cookie vencido ou liberação encerrada não trava o suporte');

  const plain = mutation({ cookie: 'agenda_rn_session=a', assisted: true });
  assert.equal((await plain.response).status, 200);
  assert.deepEqual(plain.calls, ['handler'], 'sem o cookie assistido nem consulta o banco');

  const leave = mutation({ cookie: 'agenda_rn_assist=b', assisted: true, allowAssisted: true });
  assert.equal((await leave.response).status, 200, 'só a saída do acesso assistido passa');
  assert.match(read('app/api/support/assist/end/route.ts'), /secureMutation\(end, \{ allowAssisted: true \}\)/);
  assert.match(read('app/api/patients/[id]/export/route.ts'), /if \(session\.account\.assist\) throw new HttpError\(403/);
});

function grantApi({ role = 'general_manager', current = null } = {}) {
  const calls = [];
  const cache = new Map();
  loadTs('lib/security/http.ts', {}, cache);
  const api = loadTs('app/api/organizations/support-access/route.ts', {
    '@/app/authz': { getSession: async () => ({ account: { id: 7, role }, organization: { id: ORG } }) },
    '@/lib/security/rate-limit': { consumeLimit: async () => {} },
    '@/lib/support/assist': {
      ASSIST_HOURS: [1, 4, 24], activeGrant: async () => current,
      revokeGrant: async (id, by) => { calls.push(['revoke', id, by]); return true; },
    },
    '@/lib/supabase-admin': { dbError() {}, getSupabaseAdmin: () => ({ from: (name) => ({
      insert(row) { calls.push(['insert', name, { ...row }]); return { select: () => ({ single: async () => ({ data: { id: 9, expires_at: row.expires_at }, error: null }) }) }; },
    }) }) },
  }, cache);
  const post = (body) => api.POST(new Request('https://example.com/api/organizations/support-access', { method: 'POST',
    headers: { origin: 'https://example.com', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { calls, post };
}

test('gerência libera por 1, 4 ou 24 h, troca a liberação e encerra na hora', async () => {
  const grant = grantApi();
  assert.equal((await grant.post({ action: 'grant', hours: 4, reason: 'chamado #3' })).status, 200);
  const row = grant.calls.find((c) => c[0] === 'insert')[2];
  assert.equal(row.organization_id, ORG, 'organização da sessão');
  assert.equal(row.granted_by, 7);
  assert.equal(Date.parse(row.expires_at) - Date.parse(row.created_at), 4 * 3600_000);

  assert.equal((await grantApi().post({ action: 'grant', hours: 48 })).status, 400);
  assert.equal((await grantApi({ role: 'secretary' }).post({ action: 'grant', hours: 1 })).status, 403);

  const replace = grantApi({ current: { id: 5 } });
  assert.equal((await replace.post({ action: 'grant', hours: 1 })).status, 200);
  assert.deepEqual(replace.calls[0], ['revoke', 5, 7], 'nova liberação encerra a anterior');

  const revoke = grantApi({ current: { id: 5 } });
  assert.equal((await revoke.post({ action: 'revoke' })).status, 200);
  assert.deepEqual(revoke.calls, [['revoke', 5, 7]]);
  assert.match(read('lib/support/assist.ts'), /\.from\("sessions"\)\.delete\(\)\.eq\("support_grant_id", grantId\)/, 'encerrar derruba quem está dentro');
});

test('telas: faixa de aviso, controles da gerência, registro visível e botão no console', () => {
  assert.match(read('components/site-header.tsx'), /\{account\.assist&&<AssistBanner /);
  const help = read('app/ajuda/page.tsx');
  assert.match(help, /manager \? organizationSupportLog\(session\.organization\.id\) : null/);
  assert.match(help, /Registro do suporte nesta organização/);
  const console = read('app/suporte/(console)/organizacoes/[id]/page.tsx');
  assert.match(console, /activeGrant\(id\)/);
  assert.match(console, /<AssistButton organizationId=\{org\.id\} \/>/);
  const { supportActionLabel } = loadTs('lib/support/audit-labels.ts');
  assert.match(supportActionLabel('assist_start'), /somente leitura/);
  const { grantActive } = loadTs('lib/support/assist.ts', { '@/lib/supabase-admin': {} });
  const now = Date.parse('2026-11-21T12:00:00Z');
  assert.equal(grantActive({ expires_at: '2026-11-21T13:00:00Z', revoked_at: null }, now), true);
  assert.equal(grantActive({ expires_at: '2026-11-21T11:00:00Z', revoked_at: null }, now), false);
  assert.equal(grantActive({ expires_at: '2026-11-21T13:00:00Z', revoked_at: '2026-11-21T11:30:00Z' }, now), false);
});
