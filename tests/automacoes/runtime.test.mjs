import test from 'node:test';
import assert from 'node:assert/strict';

const usuario = (id, { active = true, isGM = false } = {}) => ({ id, active, isGM });

function instalarGame({ atual, usuarios, gmAtivo = null, setting = true }) {
  const lista = [...usuarios];
  lista.activeGM = gmAtivo;
  globalThis.game = {
    user: atual,
    users: lista,
    settings: { get: () => setting }
  };
}

const runtime = await import('../../scripts/automacoes/runtime.mjs');

test('interruptor mundial reflete a configuração', () => {
  const gm = usuario('gm', { isGM: true });
  instalarGame({ atual: gm, usuarios: [gm], gmAtivo: gm, setting: false });
  assert.equal(runtime.automacoesAtivas(), false);
});

test('um único jogador ativo é escolhido de forma determinística', () => {
  const b = usuario('b');
  const a = usuario('a');
  const gm = usuario('gm', { isGM: true });
  const ator = { testUserPermission: (u) => !u.isGM };

  instalarGame({ atual: a, usuarios: [b, gm, a], gmAtivo: gm });
  assert.equal(runtime.usuarioResponsavelPeloAtor(ator), a);
  assert.equal(runtime.souResponsavelPeloAtor(ator), true);

  game.user = b;
  assert.equal(runtime.souResponsavelPeloAtor(ator), false);
});

test('GM ativo assume quando não há jogador proprietário ativo', () => {
  const jogador = usuario('jogador', { active: false });
  const gm = usuario('gm', { isGM: true });
  const ator = { testUserPermission: (u) => u.id === 'jogador' || u.isGM };
  instalarGame({ atual: gm, usuarios: [jogador, gm], gmAtivo: gm });
  assert.equal(runtime.usuarioResponsavelPeloAtor(ator), gm);
});

test('personagem escolhido tem prioridade em ficha compartilhada', () => {
  const a = usuario('a');
  const b = usuario('b');
  b.character = { id: 'heroi' };
  const gm = usuario('gm', { isGM: true });
  const ator = { id: 'heroi', testUserPermission: (u) => !u.isGM };
  instalarGame({ atual: b, usuarios: [a, b, gm], gmAtivo: gm });
  assert.equal(runtime.usuarioResponsavelPeloAtor(ator), b);
});
