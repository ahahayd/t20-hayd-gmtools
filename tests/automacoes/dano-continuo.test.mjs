import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarConfig, configValida, disparou, parcelasDaRolagem, montarParcelas,
  formulaDasParcelas, resumoDasParcelas, novaInstancia, restantes, jaRolouNaRodada, depoisDeRolar
} from '../../scripts/automacoes/dano-continuo/regras.mjs';

const mais = { operador: '+' };
// Bola de Fogo com esfera: 3d6[fogo] + 4 (Arcano de Batalha) + 2 (campo Bônus)
const termos = [
  { expressao: '3d6', total: 11, dado: true, tipo: 'fogo' }, mais,
  { expressao: '4', total: 4, dado: false, tipo: '' }, mais,
  { expressao: '2', total: 2, dado: false, tipo: '' }
];

test('gatilho por aprimoramento ignora acento e maiúsculas', () => {
  const c = normalizarConfig({ gatilho: 'aprimoramento', aprimoramento: 'Esfera Flamejante' });
  assert.ok(disparou(c, '+2 PM: muda a área para efeito de ESFERA flamejante com tamanho Médio'));
  assert.ok(!disparou(c, '+2 PM: aumenta o dano em +2d6'));
  assert.ok(disparou(normalizarConfig({}), ''));
});

test('configuração valida o que cada modo pede', () => {
  assert.ok(!configValida({ gatilho: 'aprimoramento' }));
  assert.ok(!configValida({ origem: 'formula' }));
  assert.ok(configValida({ origem: 'formula', formula: '2d6' }));
  assert.equal(normalizarConfig({ usos: -3, tipo: 'xx' }).usos, 0);
  assert.equal(normalizarConfig({ tipo: 'xx' }).tipo, '');
});

test('com fontes: dano do item marcado, bônus de primeira rolagem desmarcados', () => {
  const faixas = [
    { fonte: 'Dano de Bola de Fogo', ini: 0, fim: 1 },
    { fonte: 'Bônus de dano', ini: 1, fim: 2 },
    { fonte: 'Campo Bônus', ini: 2, fim: 3 }
  ];
  const p = parcelasDaRolagem(termos, faixas, { ehDoItem: (f) => f === 'Dano de Bola de Fogo' });
  assert.deepEqual(p.map((x) => [x.fonte, x.formula, x.ativa]), [
    ['Dano de Bola de Fogo', '3d6[fogo]', true],
    ['Bônus de dano', '4', false],
    ['Campo Bônus', '2', false]
  ]);
  assert.equal(formulaDasParcelas(p), '3d6[fogo]');
  assert.equal(resumoDasParcelas(p), '3d6');
});

test('sem fontes: primeiro grupo de dados é do item, o resto é bônus', () => {
  const p = parcelasDaRolagem(termos, null, {});
  assert.equal(p[0].formula, '3d6[fogo] + 4');
  assert.equal(p[0].ativa, true);
  assert.deepEqual(p.slice(1).map((x) => [x.formula, x.ativa]), [['2', false]]);
});

test('bônus que se repetem e fórmula própria', () => {
  const orig = parcelasDaRolagem(termos, null, {});
  const rep = montarParcelas(normalizarConfig({ bonusRepetem: true }), orig, 'X');
  assert.equal(formulaDasParcelas(rep), '3d6[fogo] + 4 + 2');

  const prop = montarParcelas(normalizarConfig({ origem: 'formula', formula: '2d6', tipo: 'acido' }), orig, 'Flecha Ácida');
  assert.equal(prop[0].formula, '2d6[acido]');
  assert.equal(formulaDasParcelas(prop), '2d6[acido]');
  assert.equal(prop.length, 2); // o bônus fica listado, desmarcado
});

test('sinal negativo atravessa a montagem', () => {
  assert.equal(formulaDasParcelas([
    { ativa: true, formula: '2d6' }, { ativa: true, formula: '-1' }, { ativa: false, formula: '9' }
  ]), '2d6 - 1');
});

test('usos e uma vez por rodada', () => {
  const inst = novaInstancia({
    id: 'a', item: { id: 'i', name: 'Flecha' }, config: normalizarConfig({ usos: 2, umaVezPorRodada: true }), parcelas: []
  });
  const agora = { combate: 'c', rodada: 1 };
  assert.equal(restantes(inst), 2);
  const um = depoisDeRolar(inst, agora);
  assert.equal(restantes(um), 1);
  assert.ok(jaRolouNaRodada(um, agora));
  assert.ok(!jaRolouNaRodada(um, { combate: 'c', rodada: 2 }));
  assert.equal(depoisDeRolar(um, agora), null);
  assert.equal(restantes(novaInstancia({ id: 'b', item: { id: 'i', name: 'x' }, config: normalizarConfig({}), parcelas: [] })), null);
});
