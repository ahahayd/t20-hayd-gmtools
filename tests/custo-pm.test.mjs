import test from 'node:test';
import assert from 'node:assert/strict';
import { custoTotalDePM } from '../scripts/custo-pm.mjs';

test('o custo base entra na conta — é o bug que a correção existe para resolver', () => {
  // Magia de 2º círculo (3 PM) com um aprimoramento de 4 PM: o sistema mostra
  // 4, ignorando o custo do próprio item.
  assert.equal(custoTotalDePM(3, [{ custo: '4', quantidade: 1 }]), 7);
  // Sem aprimoramento nenhum, o custo do item continua valendo
  assert.equal(custoTotalDePM(3, []), 3);
});

test('aprimoramento desmarcado ou zerado não soma', () => {
  assert.equal(custoTotalDePM(3, [{ custo: '4', quantidade: 0 }]), 3);
  assert.equal(custoTotalDePM(3, [{ custo: '4', quantidade: -2 }]), 3);
});

test('aprimoramento que aumenta multiplica pela quantidade', () => {
  assert.equal(custoTotalDePM(1, [{ custo: '2', quantidade: 3 }]), 7);
  assert.equal(custoTotalDePM(0, [{ custo: '2', quantidade: '2' }]), 4);
});

test('aprimoramento sem custo não conta (inclusive "Truque")', () => {
  assert.equal(custoTotalDePM(3, [{ custo: 'Truque', quantidade: 1 }]), 3);
  assert.equal(custoTotalDePM(3, [{ custo: '', quantidade: 1 }]), 3);
  assert.equal(custoTotalDePM(3, [{ custo: '0', quantidade: 1 }]), 3);
});

test('o ajuste manual soma e subtrai, mas não derruba abaixo de 1 PM', () => {
  assert.equal(custoTotalDePM(3, [], '+2'), 5);
  assert.equal(custoTotalDePM(3, [], -1), 2);
  // Mesma regra que o sistema já aplicava: um uso que custa PM nunca vai a 0
  assert.equal(custoTotalDePM(3, [], -10), 1);
});

test('item sem custo em PM e sem aprimoramento continua em zero', () => {
  assert.equal(custoTotalDePM(0, []), 0);
  assert.equal(custoTotalDePM(undefined, []), 0);
  assert.equal(custoTotalDePM(null, [{ custo: 'Truque', quantidade: 1 }]), 0);
  // Mas um aprimoramento com custo acende a conta mesmo sem custo base
  assert.equal(custoTotalDePM(0, [{ custo: '2', quantidade: 1 }]), 2);
});

test('entrada malformada não quebra a janela', () => {
  assert.equal(custoTotalDePM('3', [null, undefined, {}], undefined), 3);
  assert.equal(custoTotalDePM(NaN, []), 0);
});
