import test from 'node:test';
import assert from 'node:assert/strict';
import { IndiceAtoresAutomacoes } from '../../scripts/automacoes/indice-atores.mjs';

function preparar({ atores = [], tokens = [] } = {}) {
  globalThis.game = { actors: atores };
  globalThis.canvas = { scene: { tokens } };
}

test('índice inclui atores do mundo e atores sintéticos da cena sem duplicar', () => {
  const mundo = { id: 'a', uuid: 'Actor.a', relevante: true };
  const sintetico = { id: 'b', uuid: 'Scene.s.Token.t.Actor.b', relevante: true };
  preparar({ atores: [mundo], tokens: [{ actor: mundo }, { actor: sintetico }] });

  const indice = new IndiceAtoresAutomacoes((ator) => ator.relevante);
  assert.deepEqual(indice.listar(), [mundo, sintetico]);
});

test('índice usa cache até ser invalidado', () => {
  const a = { id: 'a', uuid: 'Actor.a', relevante: true };
  const b = { id: 'b', uuid: 'Actor.b', relevante: true };
  preparar({ atores: [a] });
  const indice = new IndiceAtoresAutomacoes((ator) => ator.relevante);

  assert.deepEqual(indice.listar(), [a]);
  game.actors.push(b);
  assert.deepEqual(indice.listar(), [a]);
  indice.invalidar();
  assert.deepEqual(indice.listar(), [a, b]);
});
