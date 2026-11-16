// Página inicial pública em "/", login em "/entrar" e cadastro com "quem vai usar?".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadTs } from './load-ts.mjs';

const read = (p) => readFileSync(p, 'utf8');
const pages = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? pages(path) : /\.tsx?$/.test(name) ? [path] : [];
});

test('"/" mostra a página inicial para visitantes e leva quem está logado direto ao app', async () => {
  const mocks = (session) => ({
    './authz': { getSession: async () => session },
    '@/lib/doctor-services': { doctorHome: () => '/dashboard?agenda=1' },
    '@/components/landing-page': { LandingPage: () => 'landing' },
    'next/navigation': { redirect: (url) => { throw Error('redirect:' + url); } },
  });
  const visitor = loadTs('app/page.tsx', mocks(null));
  assert.ok(await visitor.default());
  const signedIn = loadTs('app/page.tsx', mocks({ account: { id: 1 } }));
  await assert.rejects(() => signedIn.default(), /redirect:\/dashboard\?agenda=1/);
});

test('a página inicial leva para criar conta e para o login', () => {
  const landing = read('components/landing-page.tsx');
  assert.match(landing, /href="\/cadastro"/);
  assert.match(landing, /href="\/entrar"/);
  assert.match(read('app/entrar/page.tsx'), /<LoginForm \/>/);
});

test('quem não está logado vai para /entrar, nunca para a página inicial', () => {
  const offenders = pages('app').filter((p) => /redirect\((['"])\/\1\)/.test(read(p)));
  assert.deepEqual(offenders, []);
  assert.match(read('app/hub/hub-logout.tsx'), /window\.location\.assign\("\/entrar"\)/);
});

test('cadastro começa perguntando quem vai usar, com os três tipos de organização', () => {
  const form = read('components/auth-forms.tsx');
  assert.match(form, /Quem vai usar o RN Integra\?/);
  for (const kind of ['MANAGEMENT_COMPANY', 'CLINIC', 'SOLO_DOCTOR']) assert.ok(form.includes(`["${kind}",`), kind);
  assert.ok(form.indexOf('before={') < form.indexOf('fields={[{ name: "name"'), 'a pergunta vem antes dos campos');
});

test('cadastro sem confirmação de e-mail só com a chave ligada', () => {
  const { signupEmailVerificationSkipped } = loadTs('lib/legal.ts');
  const env = { ...process.env };
  try {
    process.env.SIGNUP_SKIP_EMAIL_VERIFICATION = 'true';
    assert.equal(signupEmailVerificationSkipped(), true);
    delete process.env.SIGNUP_SKIP_EMAIL_VERIFICATION;
    assert.equal(signupEmailVerificationSkipped(), false, 'desligado por padrão');
  } finally { process.env = env; }
  const route = read('app/api/auth/signup/route.ts');
  assert.match(route, /if \(!skipVerification\) requireEmailDelivery\(\);/);
  assert.match(route, /if \(skipVerification\) \{[\s\S]*rpc\("confirm_email", \{ p_token_hash: hash \}\)/);
});
