// Card de agendamento: valor do procedimento em célula própria e letras menores no desktop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync('public/legacy-app.js', 'utf8');
const css = readFileSync('public/legacy.css', 'utf8');

test('card mostra o valor do procedimento, quando houver, fora do convênio', () => {
  assert.match(js, /<span class="appointment-insurance">\$\{esc\(appointmentInsurance\(a\)\|\|"Sem convênio"\)\}<\/span>\$\{a\.procedureValue!=null\?`<span class="appointment-value">\$\{esc\(money\(a\.procedureValue\)\)\}<\/span>`:""\}/);
  assert.match(js, /a\.procedureValue!=null\?money\(a\.procedureValue\):"",statusLabel\(a\.status\)\]/, 'o resumo (title) também traz o valor');
  assert.match(css, /#calendar \.appointment \.appointment-value\{grid-column:2;grid-row:4;/);
  assert.match(css, /\.mobile-appointment-content \.appointment-value\{grid-column:2;grid-row:5;/);
});

test('desktop: letras do card um ponto menores', () => {
  assert.match(css, /#calendar \.appointment \.appointment-patient\{font-size:10\.5px!important\}/);
  assert.match(css, /#calendar \.appointment \.appointment-procedure\{font-size:9\.5px!important\}/);
});
