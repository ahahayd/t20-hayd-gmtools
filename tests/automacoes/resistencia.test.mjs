import test from 'node:test';
import assert from 'node:assert/strict';
import { testesCitados, passouNoTeste } from '../../scripts/automacoes/resistencia.mjs';

test('reconhece Reflexos, Fortitude e Vontade sozinhos', () => {
  assert.deepEqual(testesCitados('Reflexos').map((t) => t.chave), ['refl']);
  assert.deepEqual(testesCitados('Fortitude').map((t) => t.chave), ['fort']);
  assert.deepEqual(testesCitados('Vontade').map((t) => t.chave), ['vont']);
});

test('qualificadores junto da palavra-chave não atrapalham', () => {
  for (const txt of ['Reflexos parcial', 'Vontade anula', 'Fortitude (veja texto)', 'reflexos', 'VONTADE']) {
    assert.ok(testesCitados(txt).length > 0, `não reconheceu: ${txt}`);
  }
});

test('mais de uma palavra-chave no mesmo texto vira mais de um teste', () => {
  const achados = testesCitados('Reflexos ou Fortitude (veja texto)').map((t) => t.chave);
  assert.deepEqual(achados, ['refl', 'fort']);
});

test('texto sem nenhuma das três palavras não reconhece nada', () => {
  assert.deepEqual(testesCitados(''), []);
  assert.deepEqual(testesCitados(null), []);
  assert.deepEqual(testesCitados('Percepção'), []);
});

test('passa na CD com total igual ou maior, nunca com menor', () => {
  assert.equal(passouNoTeste(26, 26), true);
  assert.equal(passouNoTeste(30, 26), true);
  assert.equal(passouNoTeste(25, 26), false);
  assert.equal(passouNoTeste(NaN, 26), false);
});
