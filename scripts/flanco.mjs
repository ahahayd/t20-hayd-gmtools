/**
 * Detecção de flanco, no modelo do PF2e: dois inimigos do alvo, ambos ao
 * alcance dele, com uma linha entre os dois cruzando lados opostos do alvo.
 * Criaturas maiores testam uma linha por quadrado ocupado.
 *
 * Lógica pura: retângulos em pixels { x, y, w, h, elevacao }.
 */

export const ID_EFEITO_FLANCO = 't20gFlanqueando0';

const ALCANCE_POR_TAMANHO = { gra: 3, eno: 4.5, col: 9 };

/** Dados do efeito padrão, no formato do v13. A automação só decide se ele vem marcado. */
export function dadosDoEfeitoDeFlanco({ nome, origem }) {
  return {
    _id: ID_EFEITO_FLANCO,
    name: nome,
    img: 'icons/svg/combat.svg',
    origin: origem,
    disabled: true,
    changes: [{ key: 'ataque', mode: 2, value: '2', priority: 20 }],
    flags: { tormenta20: { onuse: true, attack: true, custo: '' } }
  };
}

export function alcanceDoTamanho(tamanho) {
  return ALCANCE_POR_TAMANHO[tamanho] ?? 1.5;
}

export function saoInimigos(a, b) {
  return a * b === -1;
}

/** Centro de cada quadrado ocupado. */
export function centrosDosQuadrados(r, grade) {
  const centros = [];
  for (let i = 0; i < Math.max(1, Math.round(r.w / grade)); i += 1) {
    for (let j = 0; j < Math.max(1, Math.round(r.h / grade)); j += 1) {
      centros.push({ x: r.x + (i + 0.5) * grade, y: r.y + (j + 0.5) * grade });
    }
  }
  return centros;
}

/** Distância entre as bordas, em metros. Diagonal conta como um quadrado. */
export function distanciaEmMetros(a, b, grade, metros) {
  const vaoX = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0);
  const vaoY = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0);
  const quadrados = Math.ceil(Math.max(vaoX, vaoY) / grade) + 1;
  return Math.max(quadrados * metros, Math.abs((a.elevacao ?? 0) - (b.elevacao ?? 0)));
}

function cruza(p, q, a, b) {
  const lado = (u, v, w) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
  return lado(p, q, a) * lado(p, q, b) <= 0 && lado(a, b, p) * lado(a, b, q) <= 0;
}

/** Mesmo teste do `onOppositeSides` do PF2e. */
export function cruzaLadosOpostos(p, q, r) {
  const [e, d, c, b] = [r.x, r.x + r.w, r.y, r.y + r.h];
  const tl = { x: e, y: c };
  const tr = { x: d, y: c };
  const bl = { x: e, y: b };
  const br = { x: d, y: b };
  return (cruza(p, q, tl, bl) && cruza(p, q, tr, br)) || (cruza(p, q, tl, tr) && cruza(p, q, bl, br));
}

/** Todas as linhas entre quadrados de A e B que flanqueiam o alvo. */
export function linhasDeFlanco(a, b, alvo, grade) {
  const linhas = [];
  for (const de of centrosDosQuadrados(a, grade)) {
    for (const para of centrosDosQuadrados(b, grade)) {
      if (cruzaLadosOpostos(de, para, alvo)) linhas.push([de, para]);
    }
  }
  return linhas;
}
