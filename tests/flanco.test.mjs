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

test('quadrado fora do alcance do alvo não flanqueia', () => {
  // Colossal 4x4 em (0,0); alvo em (4,5); aliado em (5,6). Só o canto (3,3)
  // fica a 3 m: alcança com 9 m, não com 1,5 m.
  const colossal = q(0, 0, 4);
  assert.equal(linhasDeFlanco(colossal, q(5, 6), q(4, 5), 100, { metros: 1.5, alcanceA: 1.5 }).length, 0);
  assert.ok(linhasDeFlanco(colossal, q(5, 6), q(4, 5), 100, { metros: 1.5, alcanceA: 9 }).length >= 1);
});

test('só lados opostos são inimigos', () => {
  assert.equal(saoInimigos(1, -1), true);
  assert.equal(saoInimigos(1, 1), false);
  assert.equal(saoInimigos(0, -1), false);
});
