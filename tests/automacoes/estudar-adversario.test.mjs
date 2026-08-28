import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BONUS_POR_ESTUDO,
  normalizarEstudo,
  bonusDoEstudo,
  registrarEstudo,
  desfazerEstudo
} from '../../scripts/automacoes/estudar-adversario.mjs';
import { AUTOMACOES } from '../../scripts/automacoes/catalogo.mjs';

test('catálogo: o efeito soma +2 por ponto só no acerto, nunca no dano', () => {
  const def = AUTOMACOES['estudar-o-adversario'];
  assert.ok(def, 'automação ausente do catálogo');
  assert.deepEqual(def.tipos, ['poder']);

  // Sem pontos não há efeito nenhum na ficha
  assert.deepEqual(def.estudo.changes(0), []);

  const um = def.estudo.changes(1);
  assert.equal(um.length, 1, 'só a chave de ataque deve ser alterada');
  assert.equal(um[0].key, 'ataque');
  assert.equal(um[0].value, '2');
  assert.equal(um[0].mode, 2, 'ADD');

  assert.equal(def.estudo.changes(3)[0].value, '6');
  assert.ok(!def.estudo.changes(3).some((c) => c.key === 'dano'),
    'a regra não concede bônus de dano');

  // O efeito não deve aparecer em magias — o poder é sobre testes de ataque
  assert.equal(def.estudo.alvos.spell, undefined);
  assert.equal(def.estudo.alvos.attack, true);
});

test('bônus é de +2 por ponto acumulado', () => {
  assert.equal(BONUS_POR_ESTUDO, 2);
  assert.equal(bonusDoEstudo(0), 0);
  assert.equal(bonusDoEstudo(1), 2);
  assert.equal(bonusDoEstudo(3), 6);
  assert.equal(bonusDoEstudo(undefined), 0);
  assert.equal(bonusDoEstudo(-5), 0);
});

test('registro ausente ou corrompido vira contagem zerada', () => {
  assert.deepEqual(normalizarEstudo(undefined), { n: 0 });
  assert.deepEqual(normalizarEstudo({ n: 'abc' }), { n: 0 });
  assert.deepEqual(normalizarEstudo({ n: -3 }), { n: 0 });
  assert.deepEqual(normalizarEstudo({ n: 2.7 }), { n: 2 });
});

test('registros antigos com rodada/combate continuam legíveis', () => {
  // A versão anterior limitava um registro por rodada e guardava { n, r, c }.
  // Os campos extras devem ser ignorados sem perder a contagem já acumulada.
  assert.deepEqual(normalizarEstudo({ n: 4, r: 7, c: 'combate-1' }), { n: 4 });
  assert.deepEqual(registrarEstudo({ n: 4, r: 7, c: 'combate-1' }), { n: 5 });
});

test('a contagem sobe quantas vezes forem necessárias, sem trava por rodada', () => {
  let registro = normalizarEstudo(undefined);
  for (let i = 1; i <= 5; i += 1) {
    registro = registrarEstudo(registro);
    assert.equal(registro.n, i);
  }
  assert.equal(bonusDoEstudo(registro.n), 10);
  // Nada no registro guarda rodada ou combate: não há o que travar
  assert.deepEqual(Object.keys(registro), ['n']);
});

test('desfazer devolve um ponto', () => {
  assert.deepEqual(desfazerEstudo({ n: 3 }), { n: 2 });
  assert.deepEqual(desfazerEstudo({ n: 2, r: 5, c: 'combate-1' }), { n: 1 });
});

test('desfazer o último ponto devolve null para a entrada ser apagada', () => {
  assert.equal(desfazerEstudo({ n: 1 }), null);
  assert.equal(desfazerEstudo({ n: 0 }), null);
  assert.equal(desfazerEstudo(undefined), null);
});
