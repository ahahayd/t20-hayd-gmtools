import test from 'node:test';
import assert from 'node:assert/strict';
import { FUNCOES, IMPACTO_CONFIG, ligadasNoPreset, nivelDaConfiguracao } from '../scripts/impacto.mjs';

const ligadas = (teto) => ligadasNoPreset(teto).filter(f => f.ligada).map(f => f.chave);

test('o preset liga tudo até o teto e nada acima dele', () => {
  const baixo = ligadasNoPreset('baixo');
  assert.ok(baixo.every(f => f.ligada === (f.nivel === 'baixo')));

  const medio = ligadasNoPreset('medio');
  assert.ok(medio.every(f => f.ligada === (f.nivel !== 'alto')));

  assert.ok(ligadasNoPreset('alto').every(f => f.ligada));
});

test('cada preset é um superconjunto do anterior', () => {
  const baixo = ligadas('baixo');
  const medio = ligadas('medio');
  const alto = ligadas('alto');
  assert.ok(baixo.every(c => medio.includes(c)));
  assert.ok(medio.every(c => alto.includes(c)));
  assert.equal(alto.length, FUNCOES.length);
});

test('teto desconhecido não liga nada — não adivinha', () => {
  assert.deepEqual(ligadas('turbo'), []);
  assert.deepEqual(ligadas(undefined), []);
});

test('configuração sem impacto declarado é baixo', () => {
  assert.equal(nivelDaConfiguracao('reguaEfeitos'), 'baixo');
  assert.equal(nivelDaConfiguracao('automacoesEnabled'), 'alto');
  assert.equal(nivelDaConfiguracao('metagameMenu'), 'medio');
  // Todo nível declarado tem de ser um dos três
  assert.ok(Object.values(IMPACTO_CONFIG).every(n => ['baixo', 'medio', 'alto'].includes(n)));
});

test('toda função do preset declara um nível conhecido', () => {
  assert.ok(FUNCOES.every(f => ['baixo', 'medio', 'alto'].includes(f.nivel)));
  assert.equal(new Set(FUNCOES.map(f => f.chave)).size, FUNCOES.length);
});
