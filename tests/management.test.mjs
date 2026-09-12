import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fonte = await readFile(new URL('../t20-hayd-management.mjs', import.meta.url), 'utf8');

test('mudança mundial dos grupos repinta o botão em todos os clientes', () => {
  const registro = fonte.slice(
    fonte.indexOf('game.settings.register(SETTINGS_NS, "parties"'),
    fonte.indexOf('game.settings.register(SETTINGS_NS, "visibility"')
  );
  const refresh = fonte.slice(
    fonte.indexOf('function atualizarUiDasParties()'),
    fonte.indexOf('/* ============================================================\n   CONFIGURAÇÕES')
  );

  assert.match(registro, /onChange: atualizarUiDasParties/,
    'a setting mundial precisa avisar também os jogadores conectados');
  assert.match(refresh, /refreshPartyApps\(\)/);
  assert.match(refresh, /ui\.actors\?\.render\(\)/,
    'repintar o ActorDirectory dispara novamente a injeção dos botões');
});

test('a primeira carga repinta os botões depois que o jogo está pronto', () => {
  const ready = fonte.slice(fonte.indexOf('Hooks.once("ready"'));
  assert.match(ready, /if \(lerConfig\("partySheetEnabled"\)\) atualizarUiDasParties\(\);/);
});
