import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ID_EFEITO_TAMANHO, dadosDoEfeitoDeTamanho, ehEfeitoDeManobra, modificadorDeManobra, unicosPorId
} from '../scripts/manobra.mjs';

test('cada tamanho tem o modificador de manobra da tabela', () => {
  assert.equal(modificadorDeManobra('min'), -5);
  assert.equal(modificadorDeManobra('peq'), -2);
  assert.equal(modificadorDeManobra('gra'), 2);
  assert.equal(modificadorDeManobra('eno'), 5);
  assert.equal(modificadorDeManobra('col'), 10);
});

test('Médio tem linha, mas não muda o ataque', () => {
  assert.deepEqual(dadosDoEfeitoDeTamanho({ tamanho: 'med', nome: 'x', origem: 'y' }).changes, []);
});

test('o efeito de tamanho soma no ataque e já vem aplicado', () => {
  const dados = dadosDoEfeitoDeTamanho({ tamanho: 'peq', nome: 'Tamanho: Pequeno', origem: 'Actor.a' });
  assert.equal(dados._id, ID_EFEITO_TAMANHO);
  assert.equal(dados._id.length, 16);
  assert.equal(dados.disabled, false);
  assert.deepEqual(dados.changes, [{ key: 'ataque', mode: 2, value: '-2', priority: 20 }]);
});

test('só o efeito marcado conta como de manobra', () => {
  assert.equal(ehEfeitoDeManobra({ flags: { 't20-hayd-gmtools': { manobra: true } } }), true);
  assert.equal(ehEfeitoDeManobra({ flags: { 't20-hayd-gmtools': { manobra: false } } }), false);
  assert.equal(ehEfeitoDeManobra({ flags: {} }), false);
});

test('ids repetidos saem da lista e a ordem é mantida', () => {
  const a = { id: 'a' };
  const b = { id: 'b' };
  assert.deepEqual(unicosPorId([a, b, { id: 'a' }]).map((e) => e.id), ['a', 'b']);
});
