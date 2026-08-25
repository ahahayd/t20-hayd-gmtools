/**
 * t20-hayd-tesouros | utils.mjs
 * Utilitários compartilhados por dados, motor, vínculo e integração.
 */

/** Minúsculas, sem acento, sem pontuação — usado para gerar chaves estáveis e comparar nomes. */
export function normalizarTexto(str) {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Slug kebab-case estável a partir de um nome (usado como `chave` de catálogo). */
export function slugify(str) {
  return normalizarTexto(str).replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Converte uma fórmula do PDF ("1d6x10", "2d6+1x100", "1d4x1.000", "1d3+1")
 * numa fórmula válida do Foundry Roll. Multiplicadores usam "x"; pontos como
 * separador de milhar são apenas removidos (não são fórmulas com "x").
 */
export function formulaParaRoll(formula) {
  const limpa = String(formula).trim();
  const partesX = limpa.split(/x/i);
  if (partesX.length === 2) {
    const [dado, mult] = partesX;
    const multiplicador = Number(mult.replace(/\./g, ''));
    return `(${dado.trim()}) * ${multiplicador}`;
  }
  return limpa;
}

/**
 * Separa a parte de DADOS de uma fórmula do PDF, para que o Mestre possa
 * digitar o que saiu nos dados em vez do total já multiplicado: em "3d8x100"
 * ele digita 10, não 1000.
 *
 * Devolve `null` quando a fórmula não é um NdM simples (com bônus fixo
 * opcional) — nesse caso quem chama volta a pedir o total direto.
 *
 * "3d8x100"  → { dados: "3d8",   min: 3, max: 24, multiplicador: 100 }
 * "2d6+1x100"→ { dados: "2d6+1", min: 3, max: 13, multiplicador: 100 }
 * "1d3+1"    → { dados: "1d3+1", min: 2, max: 4,  multiplicador: 1 }
 */
export function analisarFormula(formula) {
  const limpa = String(formula ?? '').trim();
  const partesX = limpa.split(/x/i);
  if (partesX.length > 2) return null;

  const temMult = partesX.length === 2;
  const multiplicador = temMult ? Number(partesX[1].replace(/\./g, '')) : 1;
  if (!Number.isFinite(multiplicador) || multiplicador <= 0) return null;

  const dadoTxt = (temMult ? partesX[0] : limpa).trim();
  const m = dadoTxt.match(/^(\d*)d(\d+)\s*([+-]\s*\d+)?$/i);
  if (!m) return null;

  const n = Number(m[1] || 1);
  const faces = Number(m[2]);
  const bonus = m[3] ? Number(m[3].replace(/\s+/g, '')) : 0;
  if (!n || !faces) return null;

  return {
    dados: dadoTxt, n, faces, bonus, multiplicador,
    min: n + bonus,
    max: (n * faces) + bonus
  };
}

/** Rola uma fórmula (já convertida por `formulaParaRoll` se necessário) e devolve o Roll avaliado. */
export async function rolarFormula(formula) {
  const roll = new Roll(formulaParaRoll(formula));
  await roll.evaluate();
  return roll;
}

/** Rola 1d<max> (tabelas de catálogo) e devolve o Roll avaliado. */
export async function rolarDado(max) {
  const roll = new Roll(`1d${max}`);
  await roll.evaluate();
  return roll;
}

/** Regra "2D": rola 2d6 SEPARADOS (não somados) para o Mestre escolher um dos dois. */
export async function rolarEscolha2D() {
  const roll = new Roll('2d6');
  await roll.evaluate();
  const [a, b] = roll.dice[0]?.results?.map(r => r.result) ?? [1, 1];
  return { roll, opcoes: [a, b] };
}

/** Bigrama de uma string normalizada — base do fuzzy match em vinculo.mjs. */
export function bigramas(str) {
  const s = normalizarTexto(str).replace(/\s+/g, ' ');
  const out = new Set();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** Coeficiente de Dice/Sørensen entre dois CONJUNTOS de bigramas já calculados (0..1). */
export function similaridadeDeConjuntos(A, B) {
  if (!A.size || !B.size) return A.size === B.size ? 1 : 0;
  // Itera o menor conjunto — a interseção não muda, só o custo do loop.
  const [menor, maior] = A.size <= B.size ? [A, B] : [B, A];
  let intersecao = 0;
  for (const g of menor) if (maior.has(g)) intersecao++;
  return (2 * intersecao) / (A.size + B.size);
}

/** Coeficiente de Dice/Sørensen entre dois textos (0..1) via bigramas — calcula os conjuntos na hora. */
export function similaridade(a, b) {
  return similaridadeDeConjuntos(bigramas(a), bigramas(b));
}

/** Gera id incremental estável para candidatos numa mesma tabela (evita colisão de chave). */
export function chaveUnica(base, usados) {
  let chave = base || 'item';
  let i = 2;
  while (usados.has(chave)) chave = `${base}-${i++}`;
  usados.add(chave);
  return chave;
}
