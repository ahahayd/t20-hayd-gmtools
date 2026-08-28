import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contagemNaRodada,
  criarEntrada,
  criarEntradaValor,
  removerUltimaEntrada
} from '../../scripts/automacoes/combinacoes/historico.mjs';

test('histórico de outro combate não bloqueia as rodadas do encontro novo', () => {
  const historico = [
    { c: 'antigo', r: 8, d: 2 },
    { c: 'novo', r: 1, d: 2 },
    { c: 'novo', r: 2, d: 2 }
  ];
  assert.equal(contagemNaRodada(historico, 2, 'novo'), 4);
  assert.equal(contagemNaRodada(historico, 8, 'antigo'), 2);
});

test('entradas legadas sem id de combate são ignoradas', () => {
  const historico = [{ r: 10, d: 20 }, { c: 'atual', r: 1, d: 1 }];
  assert.equal(contagemNaRodada(historico, 1, 'atual'), 1);
});

test('voltar rodada e registrar acerto mantém o histórico ordenado', () => {
  const historico = [
    { c: 'x', r: 3, d: 1 },
    { c: 'x', r: 1, d: 1 },
    { c: 'x', r: 2, d: 1 }
  ];
  assert.equal(contagemNaRodada(historico, 2, 'x'), 2);
  assert.equal(contagemNaRodada(historico, 3, 'x'), 3);
});

test('diminuir remove somente o último acerto do encontro atual', () => {
  const historico = [
    { c: 'antigo', r: 7, d: 2 },
    { c: 'atual', r: 1, d: 2 },
    { c: 'atual', r: 2, d: 2 }
  ];
  assert.deepEqual(removerUltimaEntrada(historico, 'atual'), [{ c: 'atual', r: 1, d: 2 }]);
});

test('novas entradas guardam explicitamente o combate', () => {
  assert.deepEqual(criarEntrada(2, 2, 'combate-1'), { c: 'combate-1', r: 2, d: 2 });
});

test('redução manual após avançar rodada não salta direto para zero', () => {
  const historico = [
    { c: 'x', r: 1, d: 2 },
    { c: 'x', r: 2, d: 2 },
    criarEntradaValor(3, 2, 'x')
  ];
  assert.equal(contagemNaRodada(historico, 2, 'x'), 4);
  assert.equal(contagemNaRodada(historico, 3, 'x'), 2);
});
