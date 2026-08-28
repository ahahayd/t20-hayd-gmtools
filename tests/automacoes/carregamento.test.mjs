import test from 'node:test';
import assert from 'node:assert/strict';

test('fachada carrega o motor e registra os hooks esperados', async () => {
  const registrados = [];
  globalThis.Hooks = {
    on: (nome, fn) => { registrados.push(['on', nome, fn]); },
    once: (nome, fn) => { registrados.push(['once', nome, fn]); }
  };
  globalThis.foundry = {
    applications: { api: { DialogV2: class {} } },
    appv1: { api: { FormApplication: class {} } },
    utils: {}
  };
  globalThis.CONFIG = {
    T20: {
      damageTypes: {},
      distanceUnits: {}
    }
  };
  globalThis.game = {};
  globalThis.canvas = {};

  const modulo = await import(`../../t20-hayd-automacoes.mjs?smoke=${Date.now()}`);
  assert.equal(typeof modulo.injetarControlesAutomacao, 'function');

  const nomes = registrados.map(([, nome]) => nome);
  for (const esperado of [
    'getItemSheetHeaderButtons', 'renderChatMessageHTML', 'targetToken',
    'updateCombat', 'createChatMessage', 'updateItem', 'deleteItem',
    'init', 'ready'
  ]) assert.ok(nomes.includes(esperado), `hook ausente: ${esperado}`);
});
