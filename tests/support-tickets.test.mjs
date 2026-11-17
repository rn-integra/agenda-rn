// Suporte RN Integra, fase 4: chamados (botão Ajuda no app, fila e respostas no console).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { loadTs } from './load-ts.mjs';

const MIGRATION = 'supabase/migrations/20261120120000_support_tickets.sql';
const ORG = '00000000-0000-4000-8000-0000000000a1';
const OTHER_ORG = '00000000-0000-4000-8000-0000000000b2';
const read = (p) => readFileSync(p, 'utf8');
const rules = loadTs('lib/support/ticket-rules.ts');

test('regras: CPF é barrado e a tela de origem vai sem identificadores', () => {
  for (const text of ['paciente 123.456.789-09', 'cpf 12345678909', 'cpf 123 456 789 09']) assert.equal(rules.looksLikeCpf(text), true, text);
  for (const text of ['agenda das 14h às 18h', 'telefone 3222-1234', 'chamado #1234567890123']) assert.equal(rules.looksLikeCpf(text), false, text);
  assert.equal(rules.sanitizePath('/dashboard'), '/dashboard');
  assert.equal(rules.sanitizePath('/billing/entidades/3f2b8c1e-1111-4222-8333-444455556666/indicadores'), '/billing/entidades/:id/indicadores');
  assert.equal(rules.sanitizePath('/patients/12345?nome=Maria'), '/patients/:id');
  assert.equal(rules.sanitizePath('/organizacao#equipe'), '/organizacao');
  for (const value of ['https://evil.test/x', '//evil.test', '/ajuda', '/ajuda/3', 12, null]) assert.equal(rules.sanitizePath(value), null, String(value));
  assert.equal(rules.browserSummary('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36'), 'Chrome · Android (celular)');
  assert.equal(rules.browserSummary('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0'), 'Edge · Windows');
  assert.equal(rules.statusAfterCustomerMessage('resolved'), 'open', 'resposta da clínica reabre');
  assert.equal(rules.statusAfterCustomerMessage('waiting_customer'), 'open');
  assert.equal(rules.statusAfterCustomerMessage('in_progress'), 'in_progress');
});

test('banco: chamados fechados para o navegador e mensagens só acrescentam', async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema extensions; create schema vault;`);
  await db.exec(read('backups/schema/rn-integra-schema.sql').replace(/^create extension .*$/gm, ''));
  await db.exec(read(MIGRATION));
  await db.exec(read(MIGRATION)); // reaplicar não quebra
  for (const table of ['support_tickets', 'support_ticket_messages']) {
    const rls = await db.query(`select relrowsecurity r from pg_class where oid = 'public.${table}'::regclass`);
    assert.equal(rls.rows[0].r, true, table + ' com RLS');
    for (const role of ['anon', 'authenticated']) for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const r = await db.query(`select has_table_privilege('${role}','public.${table}','${p}') ok`);
      assert.equal(r.rows[0].ok, false, `${role} ${p} ${table}`);
    }
  }
  const can = async (table, p) => (await db.query(`select has_table_privilege('service_role','public.${table}','${p}') ok`)).rows[0].ok;
  assert.deepEqual(await Promise.all(['SELECT', 'INSERT', 'UPDATE', 'DELETE'].map((p) => can('support_tickets', p))), [true, true, true, false]);
  assert.deepEqual(await Promise.all(['SELECT', 'INSERT', 'UPDATE', 'DELETE'].map((p) => can('support_ticket_messages', p))), [true, true, false, false]);
  const columns = await db.query(`select column_name from information_schema.columns where table_name='support_tickets'`);
  assert.ok(!columns.rows.some((c) => /patient|cpf/i.test(c.column_name)), 'nenhuma coluna de paciente');
  await db.close();
});

function ticketsModule() {
  return loadTs('lib/support/tickets.ts', { '@/lib/supabase-admin': { dbError() {}, getSupabaseAdmin: () => ({}) } });
}

test('quem vê o chamado: autor, gerência da mesma organização; ninguém de fora', () => {
  const { canSeeTicket } = ticketsModule();
  const session = (id, role, org = ORG) => ({ account: { id, role }, organization: { id: org } });
  const ticket = { organization_id: ORG, created_by: 8 };
  assert.equal(canSeeTicket(session(8, 'secretary'), ticket), true, 'quem abriu');
  assert.equal(canSeeTicket(session(7, 'general_manager'), ticket), true, 'gerência da organização');
  assert.equal(canSeeTicket(session(9, 'doctor'), ticket), false, 'colega sem ser gerente');
  assert.equal(canSeeTicket(session(7, 'general_manager', OTHER_ORG), ticket), false, 'gerente de outra organização');
  assert.equal(canSeeTicket(session(8, 'secretary', OTHER_ORG), ticket), false, 'autor com outra organização ativa');
});

test('nova mensagem: o status só muda se ninguém mexeu antes (409 em corrida)', async () => {
  const calls = [];
  const db = (updatedRows) => ({ from: (name) => ({
    update(values) { calls.push(['update', name, values]); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return this; },
    select: async () => ({ data: updatedRows, error: null }),
    insert: async (row) => { calls.push(['insert', name, { ...row }]); return { error: null }; },
  }) });
  const load = (rows) => loadTs('lib/support/tickets.ts', { '@/lib/supabase-admin': { dbError() {}, getSupabaseAdmin: () => db(rows) } });
  await load([{ id: 3 }]).addTicketMessage({ id: 3, status: 'open' }, { authorId: 12, fromSupport: true, body: 'Olá', status: 'waiting_customer' });
  const update = calls.find((c) => c[0] === 'update')[2];
  assert.equal(update.status, 'waiting_customer');
  assert.equal(update.last_message_from, 'support');
  assert.deepEqual(calls.filter((c) => c[0] === 'eq').map((c) => c.slice(1)), [['id', 3], ['status', 'open']]);
  assert.deepEqual(calls.find((c) => c[0] === 'insert')[2], { ticket_id: 3, author_user_id: 12, from_support: true, body: 'Olá' });

  calls.length = 0;
  await assert.rejects(() => load([]).addTicketMessage({ id: 3, status: 'open' }, { authorId: 12, fromSupport: true, body: 'x', status: 'resolved' }), (e) => e.status === 409);
  assert.ok(!calls.some((c) => c[0] === 'insert'), 'sem status atualizado, a mensagem não entra');
});

function createApi({ session = { account: { id: 8, role: 'secretary' }, organization: { id: ORG } } } = {}) {
  const calls = [];
  const cache = new Map();
  loadTs('lib/security/http.ts', {}, cache);
  const api = loadTs('app/api/help/tickets/route.ts', {
    '@/app/authz': { getSession: async () => session },
    '@/lib/security/rate-limit': { consumeLimit: async (scope) => { calls.push(['consume', scope]); } },
    '@/lib/supabase-admin': { dbError() {}, getSupabaseAdmin: () => ({ from: (name) => ({
      insert(row) { calls.push(['insert', name, { ...row }]); return { select: () => ({ single: async () => ({ data: { id: 41 }, error: null }) }), then: (r) => r({ error: null }) }; },
    }) }) },
  }, cache);
  const post = (body) => api.POST(new Request('https://example.com/api/help/tickets', { method: 'POST',
    headers: { origin: 'https://example.com', 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/131.0 Safari/537.36' }, body: JSON.stringify(body) }));
  return { calls, post };
}

test('API do app: abrir chamado leva contexto técnico limpo e recusa CPF', async () => {
  const ok = createApi();
  const response = await ok.post({ subject: 'Agenda não abre', category: 'problema', message: 'Ao abrir a agenda a tela fica branca.', from: '/patients/123?nome=Maria' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, 41);
  const ticket = ok.calls.find((c) => c[0] === 'insert' && c[1] === 'support_tickets')[2];
  assert.equal(ticket.organization_id, ORG, 'organização da sessão, nunca do corpo');
  assert.equal(ticket.created_by, 8);
  assert.deepEqual(Object.keys(ticket.context).sort(), ['browser', 'page', 'role', 'version']);
  assert.equal(ticket.context.page, '/patients/:id');
  assert.equal(ticket.context.browser, 'Chrome · Windows');
  assert.deepEqual(ok.calls.find((c) => c[1] === 'support_ticket_messages')[2], { ticket_id: 41, author_user_id: 8, from_support: false, body: 'Ao abrir a agenda a tela fica branca.' });
  assert.ok(ok.calls.some((c) => c[0] === 'consume' && c[1] === 'help-ticket-create'));

  const cpf = createApi();
  assert.equal((await cpf.post({ subject: 'Paciente', category: 'duvida', message: 'O CPF 123.456.789-09 não aparece' })).status, 400);
  assert.ok(!cpf.calls.some((c) => c[0] === 'insert'));
  assert.equal((await createApi().post({ subject: 'Oi', category: 'duvida', message: 'curto' })).status, 400);
  assert.equal((await createApi().post({ subject: 'Assunto', category: 'outro', message: 'Mensagem longa o bastante' })).status, 400);
  assert.equal((await createApi().post({ subject: 'Assunto', category: 'duvida', message: 'Mensagem longa o bastante', organizationId: OTHER_ORG })).status, 400, 'campo extra recusado');
  assert.equal((await createApi({ session: null }).post({ subject: 'Assunto', category: 'duvida', message: 'Mensagem longa o bastante' })).status, 401);
});

function replyApi({ session, ticket, support = false, staff = true }) {
  const calls = [];
  const cache = new Map();
  const { HttpError } = loadTs('lib/security/http.ts', {}, cache);
  const { canSeeTicket } = ticketsModule();
  const tickets = {
    canSeeTicket, loadTicket: async () => ticket ? { ticket, messages: [] } : null,
    addTicketMessage: async (t, input) => { calls.push(['message', input]); },
  };
  const api = support
    ? loadTs('app/api/support/tickets/route.ts', {
      '@/lib/support/staff': { requireSupportApi: async () => { if (!staff) throw new HttpError(404, 'Não encontrado.'); return { session: { account: { id: 12 } } }; } },
      '@/lib/support/audit': { supportAudit: async (id, action, details) => { calls.push(['audit', action, details.organizationId, { ...details.metadata }]); } },
      '@/lib/support/tickets': tickets,
      '@/lib/security/rate-limit': { consumeLimit: async () => {} },
    }, cache)
    : loadTs('app/api/help/reply/route.ts', {
      '@/app/authz': { getSession: async () => session },
      '@/lib/support/tickets': tickets,
      '@/lib/security/rate-limit': { consumeLimit: async () => {} },
    }, cache);
  const url = support ? 'https://example.com/api/support/tickets' : 'https://example.com/api/help/reply';
  const post = (body) => api.POST(new Request(url, { method: 'POST',
    headers: { origin: 'https://example.com', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { calls, post };
}

test('API do app: responder reabre, resolver fecha e chamado alheio não aparece', async () => {
  const ticket = { id: 5, organization_id: ORG, created_by: 8, status: 'waiting_customer', subject: 'Ajuda' };
  const author = { account: { id: 8, role: 'secretary' }, organization: { id: ORG } };
  const reply = replyApi({ session: author, ticket });
  assert.equal((await reply.post({ ticketId: 5, message: 'Ainda não funcionou.' })).status, 200);
  assert.deepEqual({ ...reply.calls[0][1] }, { authorId: 8, fromSupport: false, body: 'Ainda não funcionou.', status: 'open' });

  const resolve = replyApi({ session: author, ticket });
  assert.equal((await resolve.post({ ticketId: 5, resolve: true })).status, 200);
  assert.equal(resolve.calls[0][1].status, 'resolved');
  assert.equal(resolve.calls[0][1].body, null);

  const colleague = replyApi({ session: { account: { id: 9, role: 'doctor' }, organization: { id: ORG } }, ticket });
  assert.equal((await colleague.post({ ticketId: 5, message: 'Oi' })).status, 404);
  assert.equal((await replyApi({ session: author, ticket }).post({ ticketId: 5, message: 'CPF 12345678909' })).status, 400);
  assert.equal((await replyApi({ session: author, ticket }).post({ ticketId: 5 })).status, 400, 'nada para enviar');
});

test('API do console: só a equipe responde, muda o status e tudo fica registrado', async () => {
  const ticket = { id: 5, organization_id: ORG, created_by: 8, status: 'open', subject: 'Ajuda' };
  assert.equal((await replyApi({ support: true, staff: false, ticket }).post({ ticketId: 5, status: 'resolved' })).status, 404);

  const answer = replyApi({ support: true, ticket });
  assert.equal((await answer.post({ ticketId: 5, message: 'Já corrigimos.', status: 'waiting_customer' })).status, 200);
  assert.deepEqual({ ...answer.calls[0][1] }, { authorId: 12, fromSupport: true, body: 'Já corrigimos.', status: 'waiting_customer' });
  assert.deepEqual(answer.calls[1], ['audit', 'ticket_reply', ORG, { from: 'open', to: 'waiting_customer' }]);

  const status = replyApi({ support: true, ticket });
  assert.equal((await status.post({ ticketId: 5, status: 'in_progress' })).status, 200);
  assert.equal(status.calls[1][1], 'ticket_status');
  assert.equal((await replyApi({ support: true, ticket }).post({ ticketId: 5, status: 'open' })).status, 400, 'sem resposta e sem mudança');
  assert.equal((await replyApi({ support: true, ticket: null }).post({ ticketId: 5, status: 'resolved' })).status, 404);
});

test('telas: Ajuda no cabeçalho e no menu, páginas protegidas e Chamados no console', () => {
  assert.match(read('components/site-header.tsx'), /<HelpLink className="hub-icon hub-settings"\/>/);
  assert.match(read('components/mobile-navigation.tsx'), /<HelpLink onNavigate=\{closeMenu\}>/);
  for (const page of ['app/ajuda/page.tsx', 'app/ajuda/[id]/page.tsx']) assert.match(read(page), /if \(!session\) redirect\("\/entrar"\);/, page);
  assert.match(read('app/ajuda/[id]/page.tsx'), /if \(!data \|\| !canSeeTicket\(session, data\.ticket\)\) notFound\(\);/);
  for (const page of ['chamados/page.tsx', 'chamados/[id]/page.tsx']) assert.match(read(`app/suporte/(console)/${page}`), /await requireSupportPage\(\);/, page);
  assert.match(read('app/suporte/(console)/nav.tsx'), /href: "\/suporte\/chamados", label: "Chamados"/);
  const data = read('lib/support/tickets.ts');
  for (const table of ['patients', 'appointments', 'app_state']) assert.ok(!data.includes(`from("${table}`), table);
});
