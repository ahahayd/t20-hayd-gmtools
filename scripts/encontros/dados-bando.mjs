/**
 * t20-hayd-gmtools | encontros/dados-bando.mjs
 * Bando (Ameaças de Arton, p. 388): transforma uma criatura num grupo
 * tratado como uma única ameaça. Matemática pura, sem Foundry.
 */
import { parametros, patamar, ndRotulo } from './regras.mjs';

export const TAMANHOS = ['min', 'peq', 'med', 'gra', 'eno', 'col'];

export const ESCALAS = {
  dezena: { rotulo: '~10 indivíduos', faixa: [2, 4], padrao: 3, tamanho: 1 },
  centena: { rotulo: 'dezenas a ~100', faixa: [6, 8], padrao: 7, tamanho: 3 }
};

/** NDs permitidos para o bando a partir do ND da criatura-base. */
export function ndsDoBando(ndBase, escala) {
  const [min, max] = ESCALAS[escala].faixa;
  const base = Math.max(1, Math.floor(ndBase));
  const out = [];
  for (let d = min; d <= max; d++) if (base + d <= 20) out.push(base + d);
  return out.length ? out : [20];
}

export function tamanhoDoBando(tamanho, escala) {
  const i = TAMANHOS.indexOf(tamanho);
  if (i < 0) return tamanho;
  return TAMANHOS[Math.min(TAMANHOS.length - 1, i + ESCALAS[escala].tamanho)];
}

/** Multiplicador de dano por patamares subidos (exceto magias). */
export function multiplicadorDeDano(ndBase, ndBando) {
  const subiu = patamar(ndBando).ordem - patamar(ndBase).ordem;
  return [1, 2, 4, 6][Math.max(0, Math.min(3, subiu))];
}

/** "1d12+18" ×2 → "2d12+36". Dados multiplicam a quantidade; números, o valor. */
export function multiplicarFormula(formula, k) {
  if (k === 1 || !formula) return formula;
  return String(formula)
    .replace(/(\d*)d(\d+)/gi, (_m, n, f) => `${(Number(n) || 1) * k}d${f}`)
    .replace(/(^|[+\-*\s(])(\d+)(?![\dd])/gi, (m, pre, num, off, str) => {
      // Não mexe no número de faces que acabou de ser escrito ("2d12").
      if (str[off - 1] === 'd' || str[off + m.length] === 'd') return m;
      return `${pre}${Number(num) * k}`;
    });
}

/**
 * Valores do bando: mesma distância da criatura-base para a linha dela,
 * reaplicada na linha do novo ND. PV seguem a proporção (a diferença
 * absoluta não escala bem de um patamar para outro).
 */
export function calcularBando({ papel = 'lackey', nd, ndBando, pv, defesa, resistencias = [], tamanho, escala = 'dezena' }) {
  const p = papel === 'hazard' ? 'solo' : papel;
  const velha = parametros(p, nd);
  const nova = parametros(p, ndBando);
  const deltaND = Math.floor(ndBando) - Math.max(1, Math.floor(nd));
  return {
    ndBando, ndRotulo: ndRotulo(ndBando),
    tamanho: tamanhoDoBando(tamanho, escala),
    pv: pv ? Math.max(1, Math.round(pv / velha.pv * nova.pv)) : nova.pv,
    defesa: Number.isFinite(defesa) ? defesa + (nova.defesa - velha.defesa) : nova.defesa,
    // Cada resistência sobe o mesmo que a coluna dela na tabela (forte/média/fraca).
    deltaResistencias: ordenarResistencias(resistencias).map(({ i, coluna }) => ({ i, delta: nova[coluna] - velha[coluna] })),
    deltaAtaque: nova.ataque - velha.ataque,
    deltaCD: nova.cd - velha.cd,
    deltaPericias: Math.floor(deltaND / 2),
    multDano: multiplicadorDeDano(nd, ndBando),
    subiuPatamar: patamar(ndBando).ordem > patamar(nd).ordem
  };
}

/** Maior resistência = forte, a do meio = média, a menor = fraca. */
function ordenarResistencias(res) {
  const col = ['resForte', 'resMedia', 'resFraca'];
  return res.map((v, i) => ({ v: Number(v) || 0, i }))
    .sort((a, b) => b.v - a.v)
    .map((x, k) => ({ i: x.i, coluna: col[k] ?? 'resFraca' }));
}

export const TEXTO_BANDO = '<p><b>Bando.</b> Esta criatura é um grupo tratado como uma única ameaça. '
  + 'Um ataque que exceda a Defesa do alvo por 10 ou mais causa dano dobrado; um ataque que erre causa metade do dano. '
  + 'Imune a manobras e a efeitos de alvo único que não causem dano. Vulnerável a dano de área.</p>';
