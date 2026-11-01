import test from 'node:test';
import assert from 'node:assert/strict';
import { alcanceDoTamanho, distanciaEmMetros, linhasDeFlanco, saoInimigos } from '../scripts/flanco.mjs';

const q = (i, j, n = 1) => ({ x: i * 100, y: j * 100, w: n * 100, h: n * 100 });

test('alcance por tamanho', () => {
  assert.deepEqual(['min', 'peq', 'med', 'gra', 'eno', 'col'].map(alcanceDoTamanho), [1.5, 1.5, 1.5, 3, 4.5, 9]);
});

test('diagonal não conta em dobro', () => {
  assert.equal(distanciaEmMetros(q(0, 0), q(1, 1), 100, 1.5), 1.5);
  assert.equal(distanciaEmMetros(q(0, 0), q(2, 2), 100, 1.5), 3);
  assert.equal(distanciaEmMetros(q(0, 0, 2), q(3, 1), 100, 1.5), 3);
});

test('lados e diagonais opostos flanqueiam; lados vizinhos não', () => {
  assert.equal(linhasDeFlanco(q(0, 1), q(2, 1), q(1, 1), 100).length, 1);
  assert.equal(linhasDeFlanco(q(0, 0), q(2, 2), q(1, 1), 100).length, 1);
  assert.equal(linhasDeFlanco(q(0, 1), q(1, 0), q(1, 1), 100).length, 0);
});

test('criatura grande traça uma linha por quadrado', () => {
  assert.ok(linhasDeFlanco(q(0, 1, 2), q(3, 1), q(2, 1), 100).length >= 1);
  assert.equal(linhasDeFlanco(q(0, 3, 2), q(3, 1), q(2, 1), 100).length, 0);
});

test('só lados opostos são inimigos', () => {
  assert.equal(saoInimigos(1, -1), true);
  assert.equal(saoInimigos(1, 1), false);
  assert.equal(saoInimigos(0, -1), false);
});
