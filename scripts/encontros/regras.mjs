/**
 * t20-hayd-gmtools | encontros/regras.mjs
 * Matemática de encontros de Tormenta20, sem dependência do Foundry:
 * ND de encontro (LB cap. 7 / AdA p. 9), parâmetros por papel e ND
 * (AdA Tabela 2-3 A/B/C), XP (LB cap. 8), Bando (AdA p. 388), Chefe Final
 * (AdA p. 368) e o motor de sugestões da Calculadora de Encontros.
 *
 * O que os livros não definem está marcado como DECISÃO DO MÓDULO — são escolhas do
 * módulo, explicadas na própria janela para o Mestre saber o que é regra.
 */

export const ORDEM_ND = [
  '1/4', '1/2', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', 'S', 'S+'
];

/** DECISÃO DO MÓDULO: S e S+ são "maiores que 20" no cálculo de encontro. */
const ND_S = 21;
const ND_SMAIS = 22;

/** "1/4", "0.25", "5", "S", "S+" → número. Vazio ou ilegível → null. */
export function ndNumero(nd) {
  if (nd === null || nd === undefined) return null;
  if (typeof nd === 'number') return Number.isFinite(nd) && nd > 0 ? nd : null;
  const s = String(nd).trim().toUpperCase().replace(',', '.');
  if (!s) return null;
  if (s === 'S+') return ND_SMAIS;
  if (s === 'S') return ND_S;
  const fracao = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fracao) {
    const v = Number(fracao[1]) / Number(fracao[2]);
    return v > 0 ? v : null;
  }
  const v = Number(s);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Número → rótulo do livro. Abaixo de 1, só existem 1/4 e 1/2. */
export function ndRotulo(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (n >= ND_SMAIS) return 'S+';
  if (n >= ND_S) return 'S';
  if (n >= 1) return String(Math.floor(n));
  if (n >= 0.5) return '1/2';
  if (n >= 0.25) return '1/4';
  return '0';
}

/** Chave da linha da Tabela 2-3 (S e S+ têm linha própria). */
export function chaveTabela(n) {
  if (n >= ND_SMAIS) return 'S+';
  if (n >= ND_S) return 'S';
  if (n >= 20) return '20';
  if (n >= 1) return String(Math.floor(n));
  return n >= 0.5 ? '1/2' : '1/4';
}

/** Arredondamento final do encontro: para baixo, sem sair da escala do livro. */
export function arredondarND(total) {
  if (total >= 1) return Math.floor(total + 1e-9);
  if (total >= 0.5) return 0.5;
  if (total >= 0.25) return 0.25;
  return total > 0 ? 0.25 : 0;
}

/** Patamar do ND/nível (AdA "Patamares"). */
export function patamar(n) {
  if (n > 20) return { id: 'lplus', rotulo: 'L+', ordem: 5 };
  if (n >= 17) return { id: 'lenda', rotulo: 'Lenda', ordem: 4 };
  if (n >= 11) return { id: 'campeao', rotulo: 'Campeão', ordem: 3 };
  if (n >= 5) return { id: 'veterano', rotulo: 'Veterano', ordem: 2 };
  return { id: 'iniciante', rotulo: 'Iniciante', ordem: 1 };
}

/* ─── ND de encontro ─────────────────────────────────────────────────────── */

/**
 * +2 por dobra. Para quantidades fora das potências de 2 o livro não diz
 * nada — DECISÃO DO MÓDULO: ⌊2·log2(q)⌋, que reproduz 2 → +2, 4 → +4, 8 → +6.
 */
export function acrescimoPorQuantidade(qtd) {
  if (qtd <= 1) return 0;
  return Math.floor(2 * Math.log2(qtd) + 1e-9);
}

/** ND de um grupo de `qtd` ameaças do mesmo ND (regra 2.1). */
export function ndDeGrupo(nd, qtd) {
  if (qtd <= 1) return nd;
  return nd < 1 ? nd * qtd : nd + acrescimoPorQuantidade(qtd);
}

/** Quanto uma ameaça soma ao ND base, pela distância até ele (regra 2.2). */
export function somaPorDiferenca(d) {
  if (d <= 1 + 1e-9) return 1;
  if (d <= 2 + 1e-9) return 0.5;
  if (d <= 3 + 1e-9) return 0.25;
  return 0;
}

/**
 * ND do encontro, com o passo a passo.
 *
 * @param {{id?:string, nd:number, qtd?:number}[]} ameacas
 * @returns {{nd:number, bruto:number, rotulo:string, grupos:object[], passos:string[], ignorados:Set<string>, base:object|null}}
 */
export function calcularNDEncontro(ameacas) {
  const validas = (ameacas ?? []).filter(a => a && a.nd > 0 && (a.qtd ?? 1) > 0);
  const passos = [];
  if (!validas.length) {
    return { nd: 0, bruto: 0, rotulo: '—', grupos: [], passos, ignorados: new Set(), base: null };
  }

  // 1. Agrupa ameaças de mesmo ND.
  const porND = new Map();
  for (const a of validas) {
    const g = porND.get(a.nd) ?? { valor: a.nd, qtd: 0, membros: [] };
    g.qtd += a.qtd ?? 1;
    if (a.id) g.membros.push(a.id);
    porND.set(a.nd, g);
  }
  let grupos = [...porND.values()].map(g => {
    const valor = ndDeGrupo(g.valor, g.qtd);
    if (g.qtd > 1) passos.push(`${g.qtd} × ND ${ndRotulo(g.valor)} → ${rotuloBruto(valor)}`);
    return { valor, membros: g.membros };
  });

  // 2. Grupos que deram o mesmo ND se agrupam de novo, até não sobrar empate.
  for (let volta = 0; volta < 20; volta++) {
    const contagem = new Map();
    for (const g of grupos) {
      const k = chaveValor(g.valor);
      const c = contagem.get(k) ?? { valor: g.valor, qtd: 0, membros: [] };
      c.qtd += 1;
      c.membros.push(...g.membros);
      contagem.set(k, c);
    }
    if ([...contagem.values()].every(c => c.qtd === 1)) break;
    grupos = [...contagem.values()].map(c => {
      if (c.qtd === 1) return { valor: c.valor, membros: c.membros };
      const valor = ndDeGrupo(c.valor, c.qtd);
      passos.push(`${c.qtd} grupos de ND ${rotuloBruto(c.valor)} → ${rotuloBruto(valor)}`);
      return { valor, membros: c.membros };
    });
  }

  // 3. Maior ND é a base; os demais somam pela diferença.
  grupos.sort((a, b) => b.valor - a.valor);
  const [base, ...resto] = grupos;
  base.soma = null;
  base.papelNoCalculo = 'base';
  let total = base.valor;
  const ignorados = new Set();
  for (const g of resto) {
    const d = base.valor - g.valor;
    g.diferenca = d;
    g.soma = somaPorDiferenca(d);
    g.papelNoCalculo = g.soma ? 'soma' : 'ignorado';
    if (!g.soma) g.membros.forEach(m => ignorados.add(m));
    total += g.soma;
  }
  if (resto.length) {
    passos.push(`Base ${rotuloBruto(base.valor)}` + resto.map(g =>
      g.soma ? ` + ${rotuloSoma(g.soma)} (ND ${rotuloBruto(g.valor)})` : ` + 0 (ND ${rotuloBruto(g.valor)}, fraca demais)`).join('')
      + ` = ${rotuloBruto(total)}`);
  }
  const nd = arredondarND(total);
  if (total !== nd) passos.push(`Arredondado para baixo: ND ${ndRotulo(nd)}`);
  return { nd, bruto: total, rotulo: ndRotulo(nd), grupos, passos, ignorados, base };
}

function chaveValor(v) { return Math.round(v * 1000) / 1000; }
function rotuloSoma(s) { return s === 0.5 ? '½' : s === 0.25 ? '¼' : String(s); }
function rotuloBruto(v) {
  if (v === 0.25 || v === 0.5) return ndRotulo(v);
  if (v === ND_S) return 'S';
  if (v === ND_SMAIS) return 'S+';
  const r = Math.round(v * 100) / 100;
  return String(r).replace('.', ',');
}

/* ─── ND do grupo (alvo) ─────────────────────────────────────────────────── */

/**
 * Ajuste pelo tamanho do grupo. O livro só diz "menos PJs ⇒ ND menor, mais
 * ⇒ maior". DECISÃO DO MÓDULO: a mesma escala do ND de encontro (dobrar o grupo
 * equivale a +2), arredondada: 2 PJs −2, 3 PJs −1, 5–6 PJs +1, 7–8 PJs +2.
 */
export function ajusteTamanhoGrupo(nPJs) {
  if (!nPJs || nPJs < 1) return 0;
  return Math.round(2 * Math.log2(nPJs / 4));
}

/** Quantidade de combates na aventura (AdA p. 9 / LB cap. 7). */
export const RITMOS = [
  { id: 'unico2', rotulo: 'Combate único (+2)', delta: 2 },
  { id: 'unico', rotulo: 'Combate único (+1)', delta: 1 },
  { id: 'normal', rotulo: '1 ou 2 combates (padrão)', delta: 0 },
  { id: 'varios', rotulo: 'Muitos combates (−1)', delta: -1 },
  { id: 'muitos', rotulo: 'Muitos combates (−2)', delta: -2 }
];

/** Experiência / otimização da mesa (LB "Dicas para Combates"). Números são DECISÃO DO MÓDULO. */
export const PERFIS_MESA = [
  { id: 'iniciante', rotulo: 'Grupo narrativo / iniciante (−1)', delta: -1 },
  { id: 'padrao', rotulo: 'Grupo padrão do livro', delta: 0 },
  { id: 'veterano', rotulo: 'Jogadores veteranos / otimizados (+1)', delta: 1 }
];

/** Leva um ND alvo calculado (pode ser ≤ 0) à escala do livro. */
export function normalizarAlvo(v) {
  if (v >= ND_SMAIS) return ND_SMAIS;
  if (v >= 1) return Math.floor(v);
  if (v >= 0) return 0.5;
  return 0.25;
}

/**
 * ND do grupo: nível médio + ajustes. É o "desafio justo" — o ponto zero
 * da escala de dificuldade.
 */
export function ndDoGrupo({ niveis = [], ritmo = 'normal', perfil = 'padrao', manual = 0 }) {
  const n = niveis.length;
  if (!n) return { nd: 1, media: 0, partes: [], n: 0 };
  const media = niveis.reduce((s, x) => s + x, 0) / n;
  const base = Math.max(1, Math.round(media));
  const partes = [{ rotulo: `Nível médio (${n} PJ${n > 1 ? 's' : ''})`, valor: base }];
  const tam = ajusteTamanhoGrupo(n);
  if (tam) partes.push({ rotulo: `Grupo de ${n} (o livro presume 4)`, valor: tam, convencao: true });
  const r = RITMOS.find(x => x.id === ritmo)?.delta ?? 0;
  if (r) partes.push({ rotulo: 'Quantidade de combates', valor: r });
  const p = PERFIS_MESA.find(x => x.id === perfil)?.delta ?? 0;
  if (p) partes.push({ rotulo: 'Perfil da mesa', valor: p, convencao: true });
  if (manual) partes.push({ rotulo: 'Ajuste manual', valor: manual });
  const total = partes.reduce((s, x) => s + x.valor, 0);
  return { nd: normalizarAlvo(total), media, partes, n, min: Math.min(...niveis), max: Math.max(...niveis) };
}

/* ─── Dificuldade ────────────────────────────────────────────────────────── */

/**
 * Faixas a partir do ND do grupo. O livro só fixa "ND do encontro = ND do
 * grupo ⇒ desafio justo" e "5+ abaixo do nível ⇒ irrelevante (sem XP)";
 * as demais fronteiras são DECISÃO DO MÓDULO.
 */
export const FAIXAS = [
  { id: 'irrelevante', rotulo: 'Irrelevante', ate: -5, dica: 'ND 5 ou mais abaixo do nível do grupo: não rende XP (LB cap. 8).' },
  { id: 'facil', rotulo: 'Fácil', ate: -2, dica: 'Bom para abrir a campanha ou encadear vários combates sem descanso.' },
  { id: 'justo', rotulo: 'Desafio justo', ate: 0, dica: 'Gasta PV e PM, talvez derrube alguém, mas o grupo vence. O grupo aguenta 1 ou 2 destes antes de descansar.' },
  { id: 'desafiador', rotulo: 'Desafiador', ate: 2, dica: 'Na faixa do "combate único" (+1/+2). Exige bom uso de recursos.' },
  { id: 'mortal', rotulo: 'Mortal', ate: 4, dica: 'Chance real de baixas. Reserve para clímax ou para grupos muito otimizados.' },
  { id: 'massacre', rotulo: 'Massacre', ate: Infinity, dica: 'Muito acima do grupo — vencer só com poder bruto é improvável.' }
];

export const ALVOS = [
  { id: 'facil', rotulo: 'Fácil', delta: -2 },
  { id: 'justo', rotulo: 'Desafio justo', delta: 0 },
  { id: 'desafiador', rotulo: 'Desafiador', delta: 2 },
  { id: 'mortal', rotulo: 'Mortal', delta: 4 }
];

/** Diferença em "passos" de ND, tratando 1/4 e 1/2 como degraus abaixo do 1. */
export function passosND(n) {
  if (n >= 1) return n;
  if (n >= 0.5) return 0;
  if (n >= 0.25) return -1;
  return -2;
}

export function classificar(ndEncontro, ndGrupo) {
  if (!ndEncontro) return null;
  const d = passosND(ndEncontro) - passosND(ndGrupo);
  const faixa = FAIXAS.find(f => d <= f.ate);
  return { ...faixa, diferenca: d };
}

export function ndAlvo(ndGrupo, alvoId) {
  const delta = ALVOS.find(a => a.id === alvoId)?.delta ?? 0;
  const p = passosND(ndGrupo) + delta;
  if (p >= 1) return Math.min(p, ND_SMAIS);
  return p === 0 ? 0.5 : 0.25;
}

/* ─── Tabela 2-3 (AdA pp. 382–384) ───────────────────────────────────────── */

export const COLUNAS = ['ataque', 'dano', 'defesa', 'resForte', 'resMedia', 'resFraca', 'pv', 'cd'];

export const TABELA_2_3 = {
  solo: {
    '1/4': [6, 8, 11, 3, 0, -2, 7, 12], '1/2': [7, 10, 14, 6, 3, -1, 15, 13],
    '1': [9, 15, 16, 11, 5, 0, 35, 14], '2': [12, 18, 19, 13, 7, 2, 70, 16],
    '3': [14, 21, 21, 15, 9, 3, 105, 17], '4': [16, 24, 23, 16, 10, 4, 140, 18],
    '5': [17, 40, 24, 17, 11, 5, 200, 20], '6': [20, 56, 27, 18, 12, 6, 240, 22],
    '7': [24, 62, 31, 20, 14, 7, 280, 24], '8': [26, 68, 33, 21, 15, 8, 320, 26],
    '9': [27, 74, 34, 21, 15, 9, 360, 28], '10': [29, 80, 36, 22, 16, 10, 400, 30],
    '11': [34, 130, 41, 24, 18, 11, 550, 31], '12': [36, 144, 43, 26, 20, 12, 600, 33],
    '13': [37, 158, 44, 26, 20, 13, 650, 35], '14': [39, 172, 46, 28, 22, 14, 700, 38],
    '15': [43, 186, 50, 28, 22, 15, 750, 40], '16': [46, 200, 53, 30, 24, 16, 800, 42],
    '17': [47, 270, 54, 30, 24, 17, 1020, 44], '18': [49, 288, 56, 32, 26, 18, 1080, 47],
    '19': [52, 306, 59, 32, 26, 19, 1140, 47], '20': [54, 324, 61, 34, 28, 20, 1200, 49],
    'S': [58, 360, 65, 36, 30, 22, 2500, 51], 'S+': [65, 500, 70, 38, 33, 25, 4000, 55]
  },
  lackey: {
    '1/4': [7, 9, 10, 2, 0, -1, 4, 12], '1/2': [9, 11, 13, 5, 3, 0, 6, 13],
    '1': [11, 17, 15, 10, 5, 1, 9, 14], '2': [14, 21, 18, 12, 7, 3, 14, 16],
    '3': [16, 24, 20, 14, 9, 4, 21, 17], '4': [17, 32, 22, 15, 10, 5, 28, 18],
    '5': [20, 56, 23, 16, 11, 6, 40, 20], '6': [24, 62, 26, 17, 12, 7, 48, 22],
    '7': [26, 68, 30, 19, 14, 8, 56, 24], '8': [27, 74, 32, 20, 15, 9, 64, 26],
    '9': [29, 80, 33, 20, 15, 10, 72, 28], '10': [34, 105, 35, 21, 16, 11, 80, 30],
    '11': [36, 144, 40, 23, 18, 12, 110, 31], '12': [37, 158, 42, 25, 20, 13, 120, 33],
    '13': [39, 172, 43, 25, 20, 14, 130, 35], '14': [43, 186, 45, 27, 22, 15, 140, 38],
    '15': [46, 200, 49, 27, 22, 16, 150, 40], '16': [47, 235, 52, 29, 24, 17, 160, 42],
    '17': [49, 288, 53, 29, 24, 18, 204, 44], '18': [52, 306, 55, 31, 26, 19, 216, 47],
    '19': [54, 324, 58, 31, 26, 20, 228, 47], '20': [56, 344, 60, 33, 28, 21, 240, 49],
    'S': [60, 385, 64, 35, 30, 23, 500, 51], 'S+': [67, 540, 69, 37, 33, 26, 800, 55]
  },
  special: {
    '1/4': [4, 8, 11, 3, 0, -2, 5, 14], '1/2': [5, 10, 12, 6, 3, -1, 11, 15],
    '1': [7, 15, 14, 11, 5, 0, 25, 16], '2': [10, 18, 17, 13, 7, 2, 49, 18],
    '3': [12, 21, 19, 15, 9, 3, 74, 19], '4': [14, 24, 21, 16, 10, 4, 98, 20],
    '5': [15, 40, 22, 17, 11, 5, 140, 22], '6': [18, 56, 25, 18, 12, 6, 168, 24],
    '7': [22, 62, 29, 20, 14, 7, 196, 26], '8': [24, 68, 31, 21, 15, 8, 224, 28],
    '9': [25, 74, 32, 21, 15, 9, 252, 30], '10': [27, 80, 34, 22, 16, 10, 280, 32],
    '11': [32, 130, 39, 24, 18, 11, 385, 33], '12': [34, 144, 41, 26, 20, 12, 420, 35],
    '13': [35, 158, 42, 26, 20, 13, 455, 37], '14': [37, 172, 44, 28, 22, 14, 490, 40],
    '15': [41, 186, 48, 28, 22, 15, 525, 42], '16': [44, 200, 51, 30, 24, 16, 560, 44],
    '17': [45, 270, 52, 30, 24, 17, 714, 46], '18': [47, 288, 54, 32, 26, 18, 756, 49],
    '19': [50, 306, 57, 32, 26, 19, 798, 49], '20': [52, 324, 59, 34, 28, 20, 840, 51],
    'S': [55, 360, 63, 36, 30, 22, 1750, 55], 'S+': [60, 500, 67, 38, 33, 25, 2800, 60]
  }
};

export const PAPEIS = {
  solo: { rotulo: 'Solo', icone: 'fa-dragon' },
  lackey: { rotulo: 'Lacaio', icone: 'fa-people-group' },
  special: { rotulo: 'Especial', icone: 'fa-hat-wizard' },
  hazard: { rotulo: 'Perigo', icone: 'fa-triangle-exclamation' }
};

/** Linha da Tabela 2-3 como objeto. Papel desconhecido usa Solo. */
export function parametros(papel, nd) {
  const tabela = TABELA_2_3[papel] ?? TABELA_2_3.solo;
  const linha = tabela[chaveTabela(nd)];
  return Object.fromEntries(COLUNAS.map((c, i) => [c, linha[i]]));
}

/**
 * Em que ND da tabela um valor da ficha "cai" — a forma oficial de validar
 * uma criatura (AdA p. 380: ±1–2 NDs compensados entre si).
 */
export function ndEquivalente(papel, coluna, valor) {
  const tabela = TABELA_2_3[papel] ?? TABELA_2_3.solo;
  const i = COLUNAS.indexOf(coluna);
  let melhor = '1/4';
  for (const nd of ORDEM_ND) {
    if (tabela[nd][i] <= valor) melhor = nd;
    else break;
  }
  return melhor;
}

/** Desvios da ficha em relação à linha (papel + ND), em degraus de ND. */
export function validarFicha({ papel, nd, pv, defesa, resistencias }) {
  if (!nd || papel === 'hazard') return [];
  const idxND = ORDEM_ND.indexOf(chaveTabela(nd));
  const linha = parametros(papel, nd);
  const avaliar = (coluna, valor, rotulo) => {
    if (!Number.isFinite(valor) || valor <= 0 && coluna === 'pv') return null;
    const eq = ndEquivalente(papel, coluna, valor);
    const delta = ORDEM_ND.indexOf(eq) - idxND;
    if (Math.abs(delta) < 2) return null;
    return { coluna, rotulo, valor, esperado: linha[coluna], ndEquivalente: eq, delta };
  };
  const out = [
    avaliar('pv', pv, 'PV'),
    avaliar('defesa', defesa, 'Defesa')
  ];
  if (resistencias?.length === 3 && resistencias.every(Number.isFinite)) {
    const forte = Math.max(...resistencias);
    out.push(avaliar('resForte', forte, 'Resistência forte'));
  }
  return out.filter(Boolean);
}

/* ─── Chefe Final (AdA p. 368) ───────────────────────────────────────────── */

export function ajustesChefeFinal(nd, pvBase) {
  const p = patamar(nd).id;
  const rd = { iniciante: 0, veterano: 5, campeao: 10, lenda: 20, lplus: 20 }[p];
  return {
    pv: pvBase ? pvBase * 2 : null,
    rd,
    pmPorND: 2,
    ndRecompensa: nd < 1 ? 2 : nd + 2,
    recursos: 2 * Math.min(4, patamar(nd).ordem)
  };
}

/* ─── XP (LB cap. 8) ─────────────────────────────────────────────────────── */

export const XP_POR_NIVEL = [0, 0, 1000, 3000, 6000, 10000, 15000, 21000, 28000, 36000, 45000,
  55000, 66000, 78000, 91000, 105000, 120000, 136000, 153000, 171000, 190000];

/** ND para recompensas: S/S+ contam como 20 (DECISÃO DO MÓDULO), chefe final +2. */
export function ndRecompensa(nd, chefe) {
  const base = Math.min(nd, 20);
  if (!chefe) return base;
  return base < 1 ? 2 : base + 2;
}

/**
 * XP do encontro pelos dois métodos do livro: por ameaça (padrão) e pelo ND
 * total do encontro (alternativa unificada, AdA p. 376).
 */
export function calcularXP({ ameacas, ndEncontro, nivelGrupo, nPJs }) {
  const pjs = Math.max(1, nPJs || 1);
  const irrelevante = n => nivelGrupo && n <= nivelGrupo - 5;
  let porAmeaca = 0;
  const linhas = [];
  for (const a of ameacas) {
    if (!(a.nd > 0) || a.parceiro) continue;
    const n = ndRecompensa(a.nd, a.chefe);
    const xp = irrelevante(n) ? 0 : Math.round(n * 1000) * (a.qtd ?? 1);
    porAmeaca += xp;
    linhas.push({ id: a.id, nd: n, xp, irrelevante: irrelevante(n) });
  }
  const temChefe = ameacas.some(a => a.chefe);
  const ndUnif = Math.min(ndEncontro, 20) + (temChefe ? 2 : 0);
  const unificado = !ndEncontro || irrelevante(ndUnif) ? 0 : Math.round(ndUnif * 1000);
  return {
    porAmeaca, porAmeacaPJ: Math.floor(porAmeaca / pjs),
    unificado, unificadoPJ: Math.floor(unificado / pjs),
    linhas,
    empate: Math.floor(porAmeaca / pjs / 2),
    derrota: Math.floor(porAmeaca / pjs / 4)
  };
}

/** Quantos encontros iguais a este até o próximo nível. */
export function encontrosAteSubir(nivel, xpPorPJ) {
  if (!xpPorPJ || !nivel || nivel >= 20) return null;
  const falta = XP_POR_NIVEL[nivel + 1] - XP_POR_NIVEL[nivel];
  return Math.ceil(falta / xpPorPJ);
}

/* ─── Bando (AdA p. 388) ─────────────────────────────────────────────────── */

/** Proposta de bando para N criaturas iguais. */
export function propostaBando(nd, qtd) {
  const [min, max] = qtd >= 30 ? [6, 8] : [2, 4];
  const meio = Math.round((min + max) / 2);
  const ndBando = Math.min(20, Math.floor(nd) + meio);
  const subiu = patamar(ndBando).ordem - patamar(nd).ordem;
  return {
    ndMin: Math.floor(nd) + min, ndMax: Math.floor(nd) + max, ndBando,
    tamanho: qtd >= 30 ? '+3 categorias' : '+1 categoria',
    multDano: [1, 2, 4, 6][Math.max(0, Math.min(3, subiu))]
  };
}

/** Chance de um ataque acertar uma Defesa: d20 + ataque ≥ Defesa, entre 5% e 95%. */
export function chanceDeAcerto(ataque, defesa) {
  return Math.min(0.95, Math.max(0.05, (21 - (defesa - ataque)) / 20));
}

/** DECISÃO DO MÓDULO: 75% de acerto é a referência de Defesa boa para o encontro. */
export const ACERTO_RECOMENDADO = 0.75;

/**
 * DECISÃO DO MÓDULO: o aviso aparece com 5 ou mais de Defesa abaixo da
 * recomendada, quando o ataque só erra no 1 natural.
 */
const FOLGA_DEFESA = 5;

/** Defesa que deixa um ataque em ACERTO_RECOMENDADO (ver chanceDeAcerto). */
export function defesaRecomendada(ataque) {
  return ataque + 21 - Math.round(ACERTO_RECOMENDADO * 20);
}

/* ─── Sugestões ──────────────────────────────────────────────────────────── */

const papelDe = a => a.papel || 'solo';
const nomesDe = lista => lista.map(a => a.nome).join(', ');
const totalInimigos = lista => lista.filter(a => papelDe(a) !== 'hazard')
  .reduce((s, a) => s + (a.qtd ?? 1), 0);

function ndCom(lista) {
  return calcularNDEncontro(lista.map(a => ({ id: a.id, nd: a.nd, qtd: a.qtd ?? 1 }))).nd;
}

function distancia(a, b) { return Math.abs(passosND(a) - passosND(b)); }

/**
 * Edições de uma ameaça só (quantidade ±, dobrar, metade, remover) que
 * aproximam o ND do alvo. Cada uma vira um botão na janela.
 */
export function ajustesDeQuantidade(lista, alvo) {
  const atual = ndCom(lista);
  const distAtual = distancia(atual, alvo);
  if (!distAtual) return [];
  const opcoes = [];
  for (const a of lista) {
    const q = a.qtd ?? 1;
    for (let nq = 0; nq <= 16; nq++) {
      if (nq === q) continue;
      const nova = lista.map(x => x.id === a.id ? { ...x, qtd: nq } : x).filter(x => x.qtd > 0);
      const nd = ndCom(nova);
      const dist = distancia(nd, alvo);
      if (dist >= distAtual) continue;
      opcoes.push({ id: a.id, nome: a.nome, de: q, para: nq, nd, dist, inimigos: totalInimigos(nova) });
    }
  }
  // Mais perto do alvo primeiro; empate: mexer menos e manter menos inimigos.
  opcoes.sort((x, y) => x.dist - y.dist || Math.abs(x.para - x.de) - Math.abs(y.para - y.de) || x.inimigos - y.inimigos);
  const vistos = new Set();
  return opcoes.filter(o => {
    const k = `${o.id}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  }).slice(0, 3);
}

/**
 * Para um ND base e um alvo, quantos lacaios de qual ND fecham a conta.
 * Usado tanto para "o solo está sozinho" quanto para as receitas.
 */
export function lacaiosParaAlvo(listaAtual, alvo, { maxQtd = 8, ndMax } = {}) {
  const out = [];
  const topo = ndMax ?? Math.max(...listaAtual.map(a => a.nd), alvo);
  for (const ndL of ORDEM_ND.map(ndNumero).filter(n => n < topo && n <= 20)) {
    for (const q of [2, 3, 4, 6, 8]) {
      if (q > maxQtd) continue;
      const nd = ndCom([...listaAtual, { id: '__l', nd: ndL, qtd: q }]);
      if (nd === alvo) out.push({ nd: ndL, qtd: q });
    }
  }
  // Prefere grupos menores e lacaios mais fortes (combate mais curto).
  out.sort((a, b) => a.qtd - b.qtd || b.nd - a.nd);
  return out.slice(0, 2);
}

/** Composições prontas que dão exatamente o ND alvo (para encontro vazio). */
export function receitas(alvo) {
  const out = [];
  const add = (titulo, partes) => {
    if (partes.some(p => !(p.nd > 0))) return;
    if (ndCom(partes.map((p, i) => ({ id: String(i), ...p }))) !== alvo) return;
    out.push({ titulo, partes });
  };
  const a = passosND(alvo);
  const n = p => (p >= 1 ? p : p === 0 ? 0.5 : p === -1 ? 0.25 : null);
  add('Um solo', [{ papel: 'solo', nd: alvo, qtd: 1 }]);
  for (const ds of [1, 2, 3]) {
    const s = n(a - ds);
    const lac = s ? lacaiosParaAlvo([{ id: 's', nd: s, qtd: 1 }], alvo, { ndMax: s }) : [];
    if (lac[0]) { add('Líder com lacaios', [{ papel: 'special', nd: s, qtd: 1 }, { papel: 'lackey', ...lac[0] }]); break; }
  }
  add('Dupla de solos', [{ papel: 'solo', nd: n(a - 2), qtd: 2 }]);
  add('Horda de lacaios', [{ papel: 'lackey', nd: n(a - 4), qtd: 4 }]);
  // Base a−1, mais uma ameaça 1 abaixo (+1) = a.
  add('Solo e escolta', [{ papel: 'solo', nd: n(a - 1), qtd: 1 }, { papel: 'special', nd: n(a - 2), qtd: 1 }]);
  return out;
}

/**
 * Motor de sugestões. Devolve cartões { nivel, icone, titulo, texto, acoes }.
 * nivel: 'alerta' | 'aviso' | 'dica' | 'ok'. Ações são interpretadas pela
 * janela: { tipo: 'qtd'|'papel'|'remover'|'buscar'|'chefe', ... }.
 */
export function sugerir({ ameacas, alvo, ndGrupo, nivelGrupo, nPJs, defesaMediaPJ, ndEncontro }) {
  const cartoes = [];
  const lista = ameacas.filter(a => a.nd > 0 && (a.qtd ?? 1) > 0);
  const inimigos = totalInimigos(lista);
  const conta = papel => lista.filter(a => papelDe(a) === papel).reduce((s, a) => s + (a.qtd ?? 1), 0);
  const solos = conta('solo'), lacaios = conta('lackey'), especiais = conta('special');
  const rotA = ndRotulo(alvo);

  if (!lista.length) {
    cartoes.push({
      nivel: 'dica', icone: 'fa-lightbulb', titulo: `Monte um encontro de ND ${rotA}`,
      texto: 'Arraste ameaças do diretório ou de um compêndio, use os tokens selecionados ou parta de uma destas composições:',
      receitas: receitas(alvo).map(r => ({
        ...r,
        resumo: r.partes.map(p => `${p.qtd > 1 ? `${p.qtd} × ` : ''}${PAPEIS[p.papel].rotulo} ND ${ndRotulo(p.nd)}`).join(' + ')
      }))
    });
    return cartoes;
  }

  const atual = ndEncontro ?? ndCom(lista);
  const dist = passosND(alvo) - passosND(atual);

  // 1. Distância até o alvo.
  if (dist === 0) {
    cartoes.push({ nivel: 'ok', icone: 'fa-circle-check', titulo: `Na medida: ND ${rotA}`, texto: 'O ND do encontro bate com a dificuldade escolhida. Confira abaixo a composição e a economia de ações.' });
  } else {
    const ajustes = ajustesDeQuantidade(lista, alvo);
    const subir = dist > 0;
    cartoes.push({
      nivel: Math.abs(dist) >= 3 ? 'alerta' : 'aviso',
      icone: subir ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down',
      titulo: subir ? `Faltam ${dist} ND para o alvo (${rotA})` : `${-dist} ND acima do alvo (${rotA})`,
      texto: subir
        ? 'Dobrar a quantidade de criaturas iguais sobe o ND do encontro em 2 (ex.: 2 → 4 goblins). Somar uma ameaça diferente, até 1 ND abaixo da mais forte, sobe em 1.'
        : 'Uma ameaça 4 ou mais ND abaixo da mais forte não pesa no cálculo, então trocá-la por algo mais fraco ajuda. Outra opção é baixar o ND de uma criatura (AdA p. 387: reaplique os desvios dela na linha do novo ND).',
      acoes: [
        ...ajustes.map(o => o.para === 0
          ? { tipo: 'remover', id: o.id, rotulo: `Remover ${o.nome} → ND ${ndRotulo(o.nd)}` }
          : { tipo: 'qtd', id: o.id, qtd: o.para, rotulo: `${o.nome}: ${o.de} → ${o.para} (ND ${ndRotulo(o.nd)})` }),
        ...(subir ? [{ tipo: 'buscar', rotulo: 'Buscar ameaças que completem' }] : [])
      ]
    });
  }

  // 2. Economia de ações.
  if (inimigos === 1 && nPJs >= 3) {
    const unico = lista.find(a => papelDe(a) !== 'hazard');
    const papel = papelDe(unico ?? {});
    const lac = unico ? lacaiosParaAlvo(lista, alvo, { ndMax: unico.nd }) : [];
    cartoes.push({
      nivel: 'aviso', icone: 'fa-scale-unbalanced',
      titulo: `Um inimigo contra ${nPJs} PJs`,
      texto: `Um único oponente é mais fácil do que o ND sugere: os ${nPJs} PJs agem ${nPJs} vezes por rodada e ele uma. `
        + (papel === 'solo'
          ? 'Solos aguentam isso (são feitos para durar 3 a 5 rodadas), mas lacaios dão alvos alternativos e deixam a cena mais cinematográfica.'
          : papel === 'special'
            ? 'Especiais (líderes e conjuradores) devem ser usados com lacaios — eles fortalecem os outros.'
            : 'Um lacaio sozinho cai em uma rodada; lacaios funcionam em grupo.')
        + (lac[0] ? ` Para manter ND ${rotA}: ${lac[0].qtd} lacaios de ND ${ndRotulo(lac[0].nd)}.` : ''),
      acoes: [
        lac[0] ? { tipo: 'buscar', papel: 'lackey', nd: lac[0].nd, qtd: lac[0].qtd, rotulo: `Buscar lacaios ND ${ndRotulo(lac[0].nd)}` }
          : { tipo: 'buscar', papel: 'lackey', rotulo: 'Buscar lacaios' },
        ...(papel === 'lackey' && unico ? [{ tipo: 'papel', id: unico.id, papel: 'solo', rotulo: 'Tratar como Solo' }] : [])
      ]
    });
  }
  if (inimigos > 10) {
    cartoes.push({ nivel: 'aviso', icone: 'fa-hourglass-half', titulo: `${inimigos} inimigos`, texto: 'O livro recomenda evitar combates com mais de 10 inimigos: as rodadas ficam lentas. Agrupe criaturas iguais em um Bando.' });
  } else if (inimigos > nPJs * 2 && nPJs) {
    cartoes.push({ nivel: 'dica', icone: 'fa-users', titulo: 'Muitos alvos', texto: `${inimigos} inimigos para ${nPJs} PJs: rodadas mais longas e muitas decisões de posicionamento. Prefira lacaios (caem rápido) a vários solos.` });
  }

  // 3. Composição por papel.
  if (especiais && !lacaios) {
    const esp = lista.find(a => papelDe(a) === 'special');
    const lac = lacaiosParaAlvo(lista, alvo, { ndMax: esp.nd });
    cartoes.push({
      nivel: 'dica', icone: 'fa-hat-wizard', titulo: 'Especial sem lacaios',
      texto: 'Conjuradores, trapaceiros e líderes têm ataque e Defesa menores e CD maior: brilham atrás de uma linha de lacaios que segure os PJs.',
      acoes: [{ tipo: 'buscar', papel: 'lackey', nd: lac[0]?.nd, qtd: lac[0]?.qtd, rotulo: lac[0] ? `Buscar ${lac[0].qtd} lacaios ND ${ndRotulo(lac[0].nd)}` : 'Buscar lacaios' }]
    });
  }
  if (lacaios && !solos && !especiais) {
    const ndLider = ndRotulo(normalizarAlvo(passosND(alvo) - 2));
    cartoes.push({
      nivel: 'dica', icone: 'fa-crown', titulo: 'Horda sem líder',
      texto: `Só lacaios funciona, mas um capitão (especial) ou chefão (solo) dá foco à cena — e um alvo prioritário para os PJs. Um especial de ND ${ndLider} é um bom ponto de partida.`,
      acoes: [{ tipo: 'buscar', papel: 'special', rotulo: 'Buscar um líder (especial)' }]
    });
  }
  if (solos >= 2 && !lacaios && solos === inimigos) {
    cartoes.push({ nivel: 'dica', icone: 'fa-dragon', titulo: 'Vários solos', texto: 'Solos têm muitos PV para durar 3 a 5 rodadas sozinhos. Vários juntos alongam muito o combate; considere trocar parte deles por lacaios.' });
  }

  for (const a of lista) {
    const papel = papelDe(a);
    if (papel === 'lackey' && nivelGrupo && a.nd >= nivelGrupo && (a.qtd ?? 1) === 1) {
      cartoes.push({
        nivel: 'dica', icone: 'fa-people-group', titulo: `${a.nome}: lacaio forte demais para estar só`,
        texto: 'Lacaios costumam ter ND menor que o nível do grupo e aparecer em quantidade — têm poucos PV para cair rápido. Com ND igual ou maior que o grupo e sozinho, ele cai antes de ameaçar.',
        acoes: [{ tipo: 'papel', id: a.id, papel: 'solo', rotulo: 'Considerar como Solo' }]
      });
    }
    if (papel === 'solo' && nivelGrupo && (a.qtd ?? 1) >= 4 && a.nd <= nivelGrupo - 3) {
      cartoes.push({
        nivel: 'dica', icone: 'fa-people-group', titulo: `${a.qtd} × ${a.nome} como solo`,
        texto: 'Criaturas de horda bem abaixo do grupo funcionam melhor como lacaios: mais ataque e dano, poucos PV. Vários solos fracos arrastam o combate.',
        acoes: [{ tipo: 'papel', id: a.id, papel: 'lackey', rotulo: 'Considerar como Lacaio' }]
      });
    }
    if (papel !== 'hazard' && (a.qtd ?? 1) >= 6) {
      const b = propostaBando(a.nd, a.qtd);
      cartoes.push({
        nivel: 'dica', icone: 'fa-layer-group', titulo: `${a.qtd} × ${a.nome}: vire um Bando`,
        texto: `Bando (AdA p. 388): o grupo vira uma ameaça só, de ND ${b.ndMin}–${b.ndMax} (sugestão: ${b.ndBando}), tamanho ${b.tamanho}. Use a linha do novo ND mantendo os desvios da criatura`
          + (b.multDano > 1 ? `; subiu de patamar, então o dano dos ataques ×${b.multDano}` : '; mesmo patamar, mesmo dano')
          + '. Ganha a habilidade Bando: dano dobrado ao passar a Defesa por 10+, metade ao errar, vulnerável a área.'
      });
    }
    if (a.chefe && papel === 'lackey') {
      cartoes.push({ nivel: 'aviso', icone: 'fa-crown', titulo: `${a.nome} como Chefe Final`, texto: 'Lacaios não servem como chefe final (AdA p. 368). Escolha um solo ou especial.', acoes: [{ tipo: 'chefe', id: a.id, valor: false, rotulo: 'Desmarcar chefe' }] });
    }
    if (a.nd > 20) {
      cartoes.push({ nivel: 'aviso', icone: 'fa-skull', titulo: `${a.nome}: ND ${ndRotulo(a.nd)}`, texto: 'Ameaças S e S+ têm Maior que a Morte e devem ser o ápice de uma série de aventuras — não vencíveis só com poder bruto (AdA p. 376).' });
    }
  }

  const semPapel = lista.filter(a => !a.papelFicha && papelDe(a) !== 'hazard');
  if (semPapel.length) {
    cartoes.push({ nivel: 'dica', icone: 'fa-circle-question', titulo: `Papel não definido: ${nomesDe(semPapel)}`, texto: 'A ficha não diz se é solo, lacaio ou especial: conta como Solo. Ajuste o papel na lista para refinar as sugestões.' });
  }

  // 4. Ameaças que não pesam.
  const res = calcularNDEncontro(lista.map(a => ({ id: a.id, nd: a.nd, qtd: a.qtd ?? 1 })));
  const leves = lista.filter(x => res.ignorados.has(x.id));
  if (leves.length) {
    cartoes.push({
      nivel: 'dica', icone: 'fa-feather', titulo: `Não soma ao ND: ${nomesDe(leves)}`,
      texto: '4 ou mais ND abaixo da ameaça mais forte: fraca demais para mudar o encontro, mas ainda gasta ações dos PJs. Mantenha só de propósito, ou aumente a quantidade.',
      acoes: leves.map(a => ({ tipo: 'remover', id: a.id, rotulo: leves.length > 1 ? `Remover ${a.nome}` : 'Remover' }))
    });
  }

  // 5. Chance de acerto contra a Defesa do grupo: um cartão por extremo, não um por criatura.
  if (defesaMediaPJ) {
    const chances = lista.filter(x => papelDe(x) !== 'hazard').map(a => {
      const { ataque, cd } = parametros(papelDe(a), a.nd);
      return { nome: a.nome, ataque, cd, pct: Math.round(chanceDeAcerto(ataque, defesaMediaPJ) * 100) };
    }).sort((x, y) => y.ataque - x.ataque);
    const pior = chances[0];
    if (pior && defesaMediaPJ <= defesaRecomendada(pior.ataque) - FOLGA_DEFESA) {
      const outras = chances.slice(1).filter(c => defesaMediaPJ <= defesaRecomendada(c.ataque) - FOLGA_DEFESA);
      cartoes.push({
        nivel: 'aviso', icone: 'fa-shield-halved', titulo: `Defesa recomendada: ${defesaRecomendada(pior.ataque)} (grupo: ${defesaMediaPJ})`,
        texto: `Com essa Defesa, ${pior.nome} (ataque +${pior.ataque}) acertaria ${Math.round(ACERTO_RECOMENDADO * 100)}% das vezes; contra a média do grupo, acerta ${pior.pct}%.`
          + (outras.length ? ` Também só erram no 1 natural: ${nomesDe(outras)}.` : '')
          + ' Não conta buffs dos PJs nem debuffs no combate.'
      });
    }
    const raras = chances.filter(c => c.pct <= 30);
    if (raras.length) {
      cartoes.push({
        nivel: 'dica', icone: 'fa-shield-halved', titulo: `Difícil acertar o grupo: ${nomesDe(raras)}`,
        texto: `Contra a Defesa média ${defesaMediaPJ}, acerta ${raras.length > 1 ? 'no máximo ' : ''}${Math.max(...raras.map(c => c.pct))}% das vezes e o combate se arrasta. Habilidades com teste de resistência (CD ${Math.max(...raras.map(c => c.cd))}) ignoram a Defesa.`
      });
    }
  }

  // 6. Chefe Final.
  const temChefe = lista.some(a => a.chefe);
  const candidatoChefe = lista.filter(a => ['solo', 'special'].includes(papelDe(a))).sort((x, y) => y.nd - x.nd)[0];
  if (!temChefe && candidatoChefe && passosND(alvo) - passosND(ndGrupo) >= 2) {
    const c = ajustesChefeFinal(candidatoChefe.nd);
    cartoes.push({
      nivel: 'dica', icone: 'fa-crown', titulo: 'Batalha decisiva? Use o Chefe Final',
      texto: `${candidatoChefe.nome} como Chefe Final (AdA p. 368): PV dobrados, Maior que a Morte${c.rd ? `, RD ${c.rd}` : ''}, +2 PM por ND e ${c.recursos} recursos de arena (Rei da Arena). O ND sobe +2 só para XP e tesouro.`,
      acoes: [{ tipo: 'chefe', id: candidatoChefe.id, valor: true, rotulo: `Marcar ${candidatoChefe.nome} como Chefe` }]
    });
  }

  if (nPJs && nPJs !== 4) {
    cartoes.push({ nivel: 'dica', icone: 'fa-user-group', titulo: `Grupo de ${nPJs}`, texto: `O ND do livro presume 4 PJs. ${nPJs < 4 ? 'Com menos PJs, cada ação inimiga pesa mais: prefira poucos inimigos fortes a muitos.' : 'Com mais PJs, a economia de ações favorece o grupo: acrescente inimigos (lacaios) em vez de só subir o ND de um.'}` });
  }

  const ordem = { alerta: 0, aviso: 1, ok: 2, dica: 3 };
  return cartoes.sort((x, y) => ordem[x.nivel] - ordem[y.nivel]);
}

/**
 * Pontuação de uma ameaça de compêndio como sugestão: quão perto ela leva o
 * encontro do alvo (com a melhor quantidade entre 1, 2 e 4) e se cobre o
 * papel que está faltando.
 */
export function avaliarCandidata(lista, alvo, candidata, papelDesejado) {
  const atual = ndCom(lista);
  let melhor = null;
  for (const q of [1, 2, 3, 4, 6, 8]) {
    if (candidata.papel === 'solo' && q > 2) break;
    if (candidata.papel === 'special' && q > 2) break;
    const r = calcularNDEncontro([...lista, { id: '__c', nd: candidata.nd, qtd: q }]
      .map(a => ({ id: a.id, nd: a.nd, qtd: a.qtd ?? 1 })));
    const nd = r.nd;
    // Uma quantidade que nem entra na conta (4+ ND abaixo) não é sugestão.
    const dist = distancia(nd, alvo) + (lista.length && r.ignorados.has('__c') ? 3 : 0);
    if (!melhor || dist < melhor.dist) melhor = { qtd: q, nd, dist };
    if (!dist) break;
  }
  let pontos = melhor.dist * 10 + (melhor.qtd - 1);
  if (papelDesejado && candidata.papel !== papelDesejado) pontos += 25;
  // Adicionar algo que não muda o ND (fraco demais) não ajuda.
  if (lista.length && melhor.nd === atual && atual !== alvo) pontos += 30;
  return { ...melhor, pontos };
}

/** Papel que mais falta, pela mesma leitura das sugestões. */
export function papelQueFalta(lista) {
  const ps = lista.filter(a => a.nd > 0).map(papelDe);
  if (!ps.length) return null;
  if (!ps.includes('lackey')) return 'lackey';
  if (!ps.includes('solo') && !ps.includes('special')) return 'special';
  return null;
}

/* ─── Temas e ambiente do montador ───────────────────────────────────────── */

/** Ambientes do montador: só entram criaturas com esse deslocamento na ficha. */
export const AMBIENTES = [
  { id: 'aquatico', rotulo: 'Aquático', deslocamento: 'swim' },
  { id: 'aereo', rotulo: 'Aéreo', deslocamento: 'fly' }
];

/** O subtipo das fichas é texto livre: estes também valem como tipo de criatura. */
const TIPO_DO_SUBTIPO = { 'morto-vivo': 'mor', espirito: 'esp' };
const NAO_SAO_SUBTIPO = new Set(['bando']);

const semAcento = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Metros de um deslocamento, que pode vir como número ou { base } na ficha. */
function metros(v) {
  return (typeof v === 'object' ? Number(v?.base ?? v?.value) : Number(v)) || 0;
}

/**
 * Tipo, subtipos e deslocamentos de uma ficha, no formato dos filtros.
 *
 * @param {{tipo?:string, raca?:string, movement?:object}} ficha
 */
export function perfilDeTema({ tipo, raca, movement }) {
  const subtipos = String(raca ?? '').split(/[,/]/).map(s => s.trim().toLocaleLowerCase('pt-BR')).filter(Boolean)
    .map(nome => ({ chave: semAcento(nome), nome }));
  const tipos = [...new Set([tipo, ...subtipos.map(s => TIPO_DO_SUBTIPO[s.chave])].filter(Boolean))];
  return {
    tipos,
    subtipos: subtipos.filter(s => !TIPO_DO_SUBTIPO[s.chave] && !NAO_SAO_SUBTIPO.has(s.chave)),
    swim: metros(movement?.swim) > 0,
    fly: metros(movement?.fly) > 0
  };
}

export function combinaTema(e, id) {
  const [campo, valor] = id.split(':');
  return campo === 'tipo' ? e.tipos.includes(valor) : e.subtipos.some(s => s.chave === valor);
}

export function combinaAmbiente(e, id) {
  const ambiente = AMBIENTES.find(a => a.id === id);
  return !ambiente || e[ambiente.deslocamento];
}

/**
 * Temas que existem no índice: cada tipo, com os subtipos que aparecem em pelo
 * menos `minimo` fichas (abaixo disso costuma ser erro de digitação). O subtipo
 * fica no tipo em que é mais comum.
 *
 * @param {object[]} indice
 * @param {Record<string,string>} rotulos - tipo → nome do tipo
 */
export function temasDisponiveis(indice, rotulos, minimo = 3) {
  const subs = new Map();
  for (const e of indice) {
    for (const s of e.subtipos) {
      const c = subs.get(s.chave) ?? { nome: s.nome, n: 0, tipos: new Map() };
      c.n += 1;
      c.tipos.set(e.tipos[0], (c.tipos.get(e.tipos[0]) ?? 0) + 1);
      subs.set(s.chave, c);
    }
  }
  const tipos = [...new Set(indice.flatMap(e => e.tipos))]
    .map(tipo => ({ tipo, nome: rotulos[tipo] ?? tipo }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return tipos.map(({ tipo, nome }) => ({
    nome,
    temas: [{ id: `tipo:${tipo}`, rotulo: nome }, ...[...subs.entries()]
      .filter(([, c]) => c.n >= minimo && [...c.tipos.entries()].sort((a, b) => b[1] - a[1])[0][0] === tipo)
      .map(([chave, c]) => ({ id: `sub:${chave}`, rotulo: `${nome} (${c.nome})` }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))]
  }));
}

/* ─── "Monte um encontro pra mim" ────────────────────────────────────────── */

/**
 * Estruturas de encontro. Cada parte tem papel, quantidade e deslocamento
 * de ND em relação à ameaça principal (0); `montarEstrutura` acha o ND da
 * principal que faz o encontro bater o alvo.
 */
export const ESTRUTURAS = [
  { id: 'solo', grupo: 'Solo', rotulo: 'Solo sozinho', partes: [{ papel: 'solo', d: 0, qtd: 1 }] },
  { id: 'solo-poucos', grupo: 'Solo', rotulo: 'Solo com poucos lacaios', partes: [{ papel: 'solo', d: 0, qtd: 1 }, { papel: 'lackey', d: -3, qtd: 2 }] },
  { id: 'solo-varios', grupo: 'Solo', rotulo: 'Solo com vários lacaios', partes: [{ papel: 'solo', d: 0, qtd: 1 }, { papel: 'lackey', d: -4, qtd: 5 }] },
  { id: 'solo-horda', grupo: 'Solo', rotulo: 'Solo com uma horda', partes: [{ papel: 'solo', d: 0, qtd: 1 }, { papel: 'lackey', d: -6, qtd: 8 }] },
  { id: 'solo-escolta', grupo: 'Solo', rotulo: 'Solo com escolta especial', partes: [{ papel: 'solo', d: 0, qtd: 1 }, { papel: 'special', d: -1, qtd: 1 }] },
  { id: 'solo-chefe', grupo: 'Solo', rotulo: 'Chefe final com lacaios', partes: [{ papel: 'solo', d: 0, qtd: 1, chefe: true }, { papel: 'lackey', d: -3, qtd: 3 }] },
  { id: 'solo-dupla', grupo: 'Solo', rotulo: 'Dupla de solos', partes: [{ papel: 'solo', d: 0, qtd: 2 }] },
  { id: 'solo-trio', grupo: 'Solo', rotulo: 'Trio de solos', partes: [{ papel: 'solo', d: 0, qtd: 3 }] },
  { id: 'solo-rivais', grupo: 'Solo', rotulo: 'Dois solos diferentes', partes: [{ papel: 'solo', d: 0, qtd: 1 }, { papel: 'solo', d: -1, qtd: 1 }] },
  { id: 'esp-guarda', grupo: 'Especial', rotulo: 'Especial com guarda pessoal', partes: [{ papel: 'special', d: 0, qtd: 1 }, { papel: 'lackey', d: -2, qtd: 2 }] },
  { id: 'esp-lacaios', grupo: 'Especial', rotulo: 'Especial com lacaios', partes: [{ papel: 'special', d: 0, qtd: 1 }, { papel: 'lackey', d: -3, qtd: 4 }] },
  { id: 'esp-horda', grupo: 'Especial', rotulo: 'Especial comandando uma horda', partes: [{ papel: 'special', d: 0, qtd: 1 }, { papel: 'lackey', d: -5, qtd: 8 }] },
  { id: 'esp-guardacostas', grupo: 'Especial', rotulo: 'Especial com guarda-costas solo', partes: [{ papel: 'special', d: 0, qtd: 1 }, { papel: 'solo', d: -1, qtd: 1 }] },
  { id: 'esp-protegido', grupo: 'Especial', rotulo: 'Conjurador protegido', partes: [{ papel: 'special', d: 0, qtd: 1 }, { papel: 'solo', d: -2, qtd: 1 }, { papel: 'lackey', d: -4, qtd: 3 }] },
  { id: 'esp-dupla', grupo: 'Especial', rotulo: 'Dois especiais com lacaios', partes: [{ papel: 'special', d: 0, qtd: 2 }, { papel: 'lackey', d: -4, qtd: 4 }] },
  { id: 'esp-capitao', grupo: 'Especial', rotulo: 'Capitão, tenentes e soldados', partes: [{ papel: 'special', d: 0, qtd: 1 }, { papel: 'solo', d: -2, qtd: 2 }, { papel: 'lackey', d: -4, qtd: 4 }] },
  { id: 'esp-cabala', grupo: 'Especial', rotulo: 'Cabala (só especiais)', partes: [{ papel: 'special', d: 0, qtd: 3 }] },
  { id: 'lac-patrulha', grupo: 'Lacaios', rotulo: 'Patrulha (poucos lacaios fortes)', partes: [{ papel: 'lackey', d: 0, qtd: 3 }] },
  { id: 'lac-bando', grupo: 'Lacaios', rotulo: 'Bando de lacaios', partes: [{ papel: 'lackey', d: 0, qtd: 4 }] },
  { id: 'lac-horda', grupo: 'Lacaios', rotulo: 'Horda (muitos lacaios fracos)', partes: [{ papel: 'lackey', d: 0, qtd: 8 }] },
  { id: 'lac-misto', grupo: 'Lacaios', rotulo: 'Tropa mista (veteranos e recrutas)', partes: [{ papel: 'lackey', d: 0, qtd: 2 }, { papel: 'lackey', d: -2, qtd: 4 }] },
  { id: 'lac-sargento', grupo: 'Lacaios', rotulo: 'Lacaios com um sargento solo', partes: [{ papel: 'solo', d: 0, qtd: 1 }, { papel: 'lackey', d: -1, qtd: 4 }] },
  { id: 'misto-equipe', grupo: 'Misto', rotulo: 'Equipe rival (solo + especial + lacaios)', partes: [{ papel: 'solo', d: 0, qtd: 1 }, { papel: 'special', d: -1, qtd: 1 }, { papel: 'lackey', d: -3, qtd: 2 }] },
  { id: 'misto-exercito', grupo: 'Misto', rotulo: 'Pequeno exército', partes: [{ papel: 'solo', d: 0, qtd: 1 }, { papel: 'special', d: -2, qtd: 2 }, { papel: 'lackey', d: -4, qtd: 6 }] },
  { id: 'misto-emboscada', grupo: 'Misto', rotulo: 'Emboscada (especiais e lacaios)', partes: [{ papel: 'special', d: 0, qtd: 2 }, { papel: 'lackey', d: -2, qtd: 3 }] },
  // Bando (AdA p. 388): a parte é o BANDO já pronto; o montador sorteia a
  // criatura-base 3 ND abaixo (~10 indivíduos) ou 7 abaixo (~100).
  { id: 'bando-so', grupo: 'Bando', rotulo: 'Um bando (~10)', partes: [{ papel: 'lackey', d: 0, qtd: 1, bando: 'dezena' }] },
  { id: 'bando-enorme', grupo: 'Bando', rotulo: 'Um bando enorme (~100)', partes: [{ papel: 'lackey', d: 0, qtd: 1, bando: 'centena' }] },
  { id: 'bando-dois', grupo: 'Bando', rotulo: 'Dois bandos', partes: [{ papel: 'lackey', d: 0, qtd: 2, bando: 'dezena' }] },
  { id: 'bando-solo', grupo: 'Bando', rotulo: 'Solo com um bando', partes: [{ papel: 'solo', d: 0, qtd: 1 }, { papel: 'lackey', d: -1, qtd: 1, bando: 'dezena' }] },
  { id: 'bando-especial', grupo: 'Bando', rotulo: 'Especial liderando um bando', partes: [{ papel: 'special', d: 0, qtd: 1 }, { papel: 'lackey', d: -1, qtd: 1, bando: 'dezena' }] },
  { id: 'bando-lacaios', grupo: 'Bando', rotulo: 'Bando com lacaios avulsos', partes: [{ papel: 'lackey', d: 0, qtd: 1, bando: 'dezena' }, { papel: 'lackey', d: -2, qtd: 3 }] },
  { id: 'chefe-so', grupo: 'Chefe Final', rotulo: 'Chefe final sozinho', partes: [{ papel: 'solo', d: 0, qtd: 1, chefe: true }] },
  { id: 'chefe-escolta', grupo: 'Chefe Final', rotulo: 'Chefe final com escolta especial', partes: [{ papel: 'solo', d: 0, qtd: 1, chefe: true }, { papel: 'special', d: -2, qtd: 1 }] },
  { id: 'chefe-especial', grupo: 'Chefe Final', rotulo: 'Chefe final conjurador com guarda', partes: [{ papel: 'special', d: 0, qtd: 1, chefe: true }, { papel: 'lackey', d: -2, qtd: 3 }] },
  { id: 'chefe-bando', grupo: 'Chefe Final', rotulo: 'Chefe final com um bando', partes: [{ papel: 'solo', d: 0, qtd: 1, chefe: true }, { papel: 'lackey', d: -2, qtd: 1, bando: 'dezena' }] },
  { id: 'chefe-horda', grupo: 'Chefe Final', rotulo: 'Chefe final com uma horda', partes: [{ papel: 'solo', d: 0, qtd: 1, chefe: true }, { papel: 'lackey', d: -5, qtd: 8 }] }
];

/** Inverso de passosND: passo → ND do livro (≤ 0 vira 1/2 e 1/4). */
export function ndDePassos(p) {
  if (p >= 1) return Math.min(p, 20);
  if (p === 0) return 0.5;
  if (p === -1) return 0.25;
  return null;
}

/**
 * Acha o ND da ameaça principal que faz a estrutura dar o alvo (ou o mais
 * perto possível). Devolve as partes com ND concreto.
 */
export function montarEstrutura(estrutura, alvo) {
  // Grupos grandes de lacaios podem variar um pouco a quantidade (a horda
  // continua horda): sem isso, várias estruturas nunca fechavam o alvo.
  // As partes de apoio também podem ficar 1 ND acima ou abaixo do previsto.
  const variacoes = estrutura.partes.map((x, i) => {
    const qtds = x.papel === 'lackey' && x.qtd >= 4 && !x.bando
      ? [x.qtd, x.qtd - 1, x.qtd + 1, x.qtd - 2, x.qtd + 2, x.qtd + 4] : [x.qtd];
    const ds = i === 0 ? [x.d] : [x.d, x.d - 1, x.d + 1];
    return ds.flatMap(d => qtds.map(q => ({ d, q })));
  });
  const combinacoes = variacoes.reduce((acc, vs) => acc.flatMap(c => vs.map(v => [...c, v])), [[]]);
  let melhor = null;
  for (let p = 20; p >= -1; p--) {
    for (const qtds of combinacoes) {
      // Apoio nunca fica no ND da principal ou acima (senão a estrutura muda de cara).
      if (qtds.some((v, i) => i > 0 && v.d >= 0 && estrutura.partes[i].d < 0)) continue;
      const partes = estrutura.partes.map((x, i) => ({ ...x, qtd: qtds[i].q, nd: ndDePassos(p + qtds[i].d) }));
      if (partes.some(x => !x.nd)) continue;
      if (partes.some(x => x.bando && Math.floor(x.nd) - (x.bando === 'centena' ? 7 : 3) < 1)) continue;
      const nd = ndCom(partes.map((x, i) => ({ id: String(i), nd: x.nd, qtd: x.qtd })));
      const dist = distancia(nd, alvo);
      if (!melhor || dist < melhor.dist) melhor = { partes, nd, dist };
      if (!dist) return melhor;
    }
  }
  return melhor;
}
