import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alternarModo, aplicarBonusAcerto, aplicarBonusDano, textoDaMargem
} from '../scripts/preview-dano.mjs';

const rolagemDeDano = () => ([
  { type: 'ataque', parts: [['1d20', ''], ['@luta', '']] },
  { type: 'dano', parts: [['1d8', 'corte'], ['@for', '']] }
]);

test('o bônus digitado entra como parcela e herda o tipo da primeira', () => {
  const rolls = rolagemDeDano();
  aplicarBonusDano(rolls, '+1d6');
  assert.deepEqual(rolls[1].parts.at(-1), ['+1d6', 'corte']);
  // A rolagem de ataque não é tocada
  assert.equal(rolls[0].parts.length, 2);
});

test('campo de bônus vazio não mexe em nada', () => {
  for (const vazio of ['', '0', undefined, null]) {
    const rolls = rolagemDeDano();
    aplicarBonusDano(rolls, vazio);
    assert.equal(rolls[1].parts.length, 2);
  }
});

test('as duas caixas são exclusivas e clicar de novo desliga', () => {
  assert.equal(alternarModo('', 'max'), 'max');
  assert.equal(alternarModo('max', 'min'), 'min');
  assert.equal(alternarModo('max', 'max'), '');
  assert.equal(alternarModo('max', 'outro'), '');
});

test('a margem de crítico vira faixa legível', () => {
  assert.equal(textoDaMargem(19), '19-20');
  assert.equal(textoDaMargem('18'), '18-20');
  assert.equal(textoDaMargem(20), '20');
  assert.equal(textoDaMargem(undefined), '20');
  assert.equal(textoDaMargem('19-20'), '19-20');
});

test('o bônus de acerto entra nas parcelas da rolagem de ataque', () => {
  const rolls = rolagemDeDano();
  aplicarBonusAcerto(rolls, '+2');
  assert.deepEqual(rolls[0].parts.at(-1), ['+2', '']);
  // A rolagem de dano não é tocada
  assert.equal(rolls[1].parts.length, 2);
  // Vazio não mexe em nada
  const limpo = rolagemDeDano();
  aplicarBonusAcerto(limpo, '');
  assert.equal(limpo[0].parts.length, 2);
});
