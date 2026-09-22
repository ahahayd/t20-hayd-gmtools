import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicarDiferenca,
  diferenca,
  lerRecursos,
  linhasDoResultado,
  temAlteracao
} from '../scripts/mensagens-dano.mjs';

test('lê PV/PM do ator e trata campos ausentes como zero', () => {
  assert.deepEqual(
    lerRecursos({ pv: { value: 20, temp: 5 }, pm: { value: '8', temp: null } }),
    { pv: 20, pvTemp: 5, pm: 8, pmTemp: 0 }
  );
  assert.deepEqual(lerRecursos(undefined), { pv: 0, pvTemp: 0, pm: 0, pmTemp: 0 });
});

test('dano que passa pelos PV temporários vira uma linha só', () => {
  const delta = diferenca({ pv: 20, pvTemp: 4 }, { pv: 14, pvTemp: 0 });
  assert.deepEqual(linhasDoResultado(delta), [{ tipo: 'dano', valor: -10, recurso: 'pv' }]);
});

test('cura, temporários e mana ficam em linhas separadas', () => {
  const delta = diferenca(
    { pv: 10, pvTemp: 0, pm: 5, pmTemp: 0 },
    { pv: 15, pvTemp: 3, pm: 2, pmTemp: 0 }
  );
  assert.deepEqual(linhasDoResultado(delta).map((l) => [l.tipo, l.valor]), [
    ['cura', 5], ['pvTemp', 3], ['mana', -3]
  ]);
  assert.deepEqual(
    linhasDoResultado({ pm: 2, pmTemp: 4 }).map((l) => l.tipo),
    ['manaGanha', 'pmTemp']
  );
});

test('dano totalmente absorvido não gera linha nem alteração', () => {
  const delta = diferenca({ pv: 10 }, { pv: 10 });
  assert.deepEqual(linhasDoResultado(delta), []);
  assert.equal(temAlteracao(delta), false);
});

test('desfazer tira a diferença do valor atual, sem apagar o que veio depois', () => {
  // Levou 8 (20 → 12) e depois mais 5 (12 → 7). Desfazer o primeiro devolve
  // só os 8: o segundo golpe continua valendo.
  const delta = diferenca({ pv: 20 }, { pv: 12 });
  assert.equal(aplicarDiferenca({ pv: 7 }, delta, { pvMax: 30 }).pv, 15);
});

test('desfazer devolve os PV temporários consumidos', () => {
  const delta = diferenca({ pv: 20, pvTemp: 4 }, { pv: 14, pvTemp: 0 });
  assert.deepEqual(aplicarDiferenca({ pv: 14, pvTemp: 0 }, delta, { pvMax: 30 }), {
    pv: 20, pvTemp: 4, pm: 0, pmTemp: 0
  });
});

test('refazer aplica a diferença de novo', () => {
  const delta = diferenca({ pm: 10 }, { pm: 7 });
  assert.equal(aplicarDiferenca({ pm: 10 }, delta, { pmMax: 10 }, 1).pm, 7);
});

test('os limites do ator valem no desfazer e no refazer', () => {
  // Curou 10 até o máximo; se o máximo caiu depois, desfazer não passa dele
  const cura = diferenca({ pv: 20 }, { pv: 30 });
  assert.equal(aplicarDiferenca({ pv: 30 }, cura, { pvMin: -5, pvMax: 30 }, 1).pv, 30);
  assert.equal(aplicarDiferenca({ pv: 0 }, cura, { pvMin: -5, pvMax: 30 }).pv, -5);
  // PM nunca fica negativo, e temporários nunca abaixo de zero
  const gasto = diferenca({ pm: 3, pmTemp: 2 }, { pm: 0, pmTemp: 0 });
  assert.deepEqual(aplicarDiferenca({ pm: 1, pmTemp: 0 }, gasto, { pmMax: 10 }, 1), {
    pv: 0, pvTemp: 0, pm: 0, pmTemp: 0
  });
});
