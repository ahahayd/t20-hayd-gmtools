import test from 'node:test';
import assert from 'node:assert/strict';
import { escalonamento, dadosNoNivel, ajustarDadosNasRolagens, projetarNiveis, circuloMaximo, magiasNoNivel, patamarDe } from '../../scripts/niveis/regras-niveis.mjs';

const FURTIVO = '<p>Voc&ecirc; causa 1d6 pontos de dano extra. A cada dois n&iacute;veis, esse dano extra aumenta em +1d6. Uma criatura imune...</p>';

test('escala do Ataque Furtivo lida do texto', () => {
  const e = escalonamento(FURTIVO);
  assert.equal(e.passo, 2);
  assert.deepEqual(e.incremento, { n: 1, faces: 6 });
  assert.deepEqual(e.base, { n: 1, faces: 6 });
  assert.match(e.trecho, /A cada dois níveis/);
});

test('escala sem dado: só o aviso', () => {
  const e = escalonamento('No 3º nível, você recebe +1 em rolagens de dano. A cada seis níveis, esse bônus aumenta em +1.');
  assert.equal(e.passo, 6);
  assert.equal(e.incremento, null);
  assert.match(e.trecho, /A cada seis níveis/);
  assert.equal(escalonamento('Você recebe +2 na Defesa.'), null);
});

test('dados do Ataque Furtivo por nível de ladino', () => {
  const e = escalonamento(FURTIVO);
  assert.deepEqual([1, 2, 3, 4, 5, 9, 20].map(n => dadosNoNivel(e, 1, n)), [1, 1, 2, 2, 3, 5, 10]);
  assert.equal(dadosNoNivel(escalonamento('A cada seis níveis, +1.'), 3, 9), null);
});

test('ajuste do dado nas rolagens do sistema', () => {
  const rolls = [{ name: 'Dano', parts: [['1d6', 'dano', ''], ['2d8', 'fogo', '']] }];
  const r = ajustarDadosNasRolagens(rolls, 6, 3);
  assert.ok(r.mudou);
  assert.deepEqual(r.rolls[0].parts, [['3d6', 'dano', ''], ['2d8', 'fogo', '']]);
  assert.equal(ajustarDadosNasRolagens(r.rolls, 6, 3).mudou, false);
  assert.equal(rolls[0].parts[0][0], '1d6', 'não mexe no original');
});

test('projeção das classes pelos níveis planejados', () => {
  const p = projetarNiveis({ Ladino: 3 }, 3, { 4: { classe: { nome: 'Ladino' } }, 5: { classe: { nome: 'Guerreiro' } }, 6: { classe: { nome: 'Ladino' } } }, 7);
  assert.deepEqual(p[4], { classe: 'Ladino', nivelClasse: 4, classes: { Ladino: 4 } });
  assert.deepEqual(p[5], { classe: 'Guerreiro', nivelClasse: 1, classes: { Ladino: 4, Guerreiro: 1 } });
  assert.equal(p[6].nivelClasse, 5);
  assert.deepEqual(p[7], { classe: null, nivelClasse: null, classes: { Ladino: 5, Guerreiro: 1 } });
});

const MAGIAS_CLERIGO = '<p>Voc&ecirc; pode lan&ccedil;ar magias divinas de 1&ordm; c&iacute;rculo. A cada quatro n&iacute;veis, pode lan&ccedil;ar magias de um c&iacute;rculo maior (2&ordm; c&iacute;rculo no 5&ordm; n&iacute;vel, 3&ordm; c&iacute;rculo no 9&ordm; n&iacute;vel e assim por diante). Voc&ecirc; come&ccedil;a com tr&ecirc;s magias de 1&ordm; c&iacute;rculo. A cada n&iacute;vel, aprende uma magia de qualquer c&iacute;rculo que possa lan&ccedil;ar.</p>';
const MAGIAS_BARDO = '<p>Escolha tr&ecirc;s escolas de magia. Voc&ecirc; pode lan&ccedil;ar magias arcanas de 1&ordm; c&iacute;rculo que perten&ccedil;am a essas escolas. &Agrave; medida que sobe de n&iacute;vel, pode lan&ccedil;ar magias de c&iacute;rculos maiores (2&ordm; c&iacute;rculo no 6&ordm; n&iacute;vel, 3&ordm; c&iacute;rculo no 10&ordm; n&iacute;vel e 4&ordm; c&iacute;rculo no 14&ordm; n&iacute;vel). Voc&ecirc; come&ccedil;a com duas magias de 1&ordm; c&iacute;rculo. A cada n&iacute;vel par (2&ordm;, 4&ordm; etc.), aprende uma magia de qualquer c&iacute;rculo e escola que possa lan&ccedil;ar.</p>';

test('círculo máximo: a cada quatro níveis, até o 5º', () => {
  assert.deepEqual([1, 4, 5, 8, 9, 13, 17, 20].map(n => circuloMaximo(MAGIAS_CLERIGO, n)), [1, 1, 2, 2, 3, 4, 5, 5]);
});

test('círculo máximo: lista fechada do bardo, até o 4º', () => {
  assert.deepEqual([1, 5, 6, 10, 14, 20].map(n => circuloMaximo(MAGIAS_BARDO, n)), [1, 1, 2, 3, 4, 4]);
  assert.equal(circuloMaximo('<p>Voc&ecirc; recebe +2 na Defesa.</p>', 5), null);
});

test('magias aprendidas no nível: todo nível ou só nos pares', () => {
  assert.equal(magiasNoNivel(MAGIAS_CLERIGO, 3), 1);
  assert.equal(magiasNoNivel(MAGIAS_BARDO, 3), 0);
  assert.equal(magiasNoNivel(MAGIAS_BARDO, 4), 1);
  assert.equal(magiasNoNivel(MAGIAS_CLERIGO, 1), null);
});

test('patamares de jogo: 1–4, 5–10, 11–16, 17–20', () => {
  assert.deepEqual([1, 4, 5, 10, 11, 16, 17, 20].map(n => patamarDe(n).id),
    ['iniciante', 'iniciante', 'veterano', 'veterano', 'campeao', 'campeao', 'lenda', 'lenda']);
});
