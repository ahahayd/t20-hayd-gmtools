/**
 * Fontes da rolagem — sem Foundry, testável.
 *
 * Uma rolagem do sistema é a soma de parcelas ("1d20", "@skill", "@dano",
 * o campo Bônus da janela…). Quem monta a lista de parcelas com nome é o
 * t20-hayd-fontes.mjs; aqui fica só a parte de casar cada parcela com os
 * termos da rolagem que de fato foi feita.
 *
 * Os termos chegam já simplificados (ver `termoSimples` no glue):
 *   { operador: '+' }                         — OperatorTerm
 *   { expressao, total, resultados?, dado? }  — qualquer outro termo
 */

/**
 * Tira os operadores e põe o sinal no próprio termo: "1d20 + 5 - 1" vira
 * três termos (+1d20, +5, -1). `indice` aponta para a posição original.
 */
export function termosComSinal(termos) {
  const saida = [];
  let sinal = 1;
  (termos ?? []).forEach((termo, indice) => {
    if (termo?.operador) {
      if (termo.operador === '-') sinal = -sinal;
      return;
    }
    const total = Number(termo?.total);
    saida.push({
      indice,
      sinal,
      expressao: String(termo?.expressao ?? ''),
      valor: Number.isFinite(total) ? sinal * total : null,
      resultados: termo?.resultados ?? null,
      dado: !!termo?.dado
    });
    sinal = 1;
  });
  return saida;
}

/**
 * Reparte os termos (já com sinal) entre as parcelas, na ordem: a parcela N
 * ocupa os `termos` termos seguintes. As parcelas entram na fórmula na mesma
 * ordem em que o sistema as junta, então a ordem casa.
 *
 * Devolve null se a conta não fecha (sobra ou falta termo): melhor não dizer
 * nada do que apontar a fonte errada.
 */
export function distribuir(parcelas, quantidadeDeTermos) {
  const faixas = [];
  let posicao = 0;
  for (const parcela of parcelas ?? []) {
    const n = Math.max(0, Number(parcela?.termos) || 0);
    faixas.push({ ...parcela, ini: posicao, fim: posicao + n });
    posicao += n;
  }
  return posicao === quantidadeDeTermos ? faixas : null;
}

/** Sinal entre pedaços de uma conta: "−" no começo, " + " / " − " no meio. */
const juntar = (i, sinal) => (i ? (sinal < 0 ? ' − ' : ' + ') : (sinal < 0 ? '−' : ''));

/** Soma dos termos de uma faixa; null se algum termo não tem total. */
function somaDaFaixa(termos, ini, fim) {
  let soma = 0;
  for (const termo of termos.slice(ini, fim)) {
    if (termo.valor === null) return null;
    soma += termo.valor;
  }
  return soma;
}

/**
 * Os detalhes de uma parcela que vira UM número só ("@skill" → 8) não têm
 * termo próprio: são contas da ficha. Se elas não fecham com o número que
 * entrou na rolagem, a diferença aparece como linha "sem origem".
 */
export function fecharDetalhes(detalhes, total, rotuloDiferenca) {
  const lista = (detalhes ?? []).filter((d) => Number(d?.valor));
  if (!lista.length) return [];
  const soma = lista.reduce((acc, d) => acc + Number(d.valor), 0);
  if (Number.isFinite(total) && soma !== total) {
    lista.push({ fonte: rotuloDiferenca, valor: total - soma, semOrigem: true });
  }
  return lista;
}

/**
 * Linhas da tabela: uma por parcela (as vazias somem), cada uma com o valor
 * que tirou nesta rolagem. Sem faixas (rolagem sem fontes registradas, ou
 * conta que não fechou), cada termo vira uma linha "sem origem".
 */
export function linhasDaTabela(faixas, termos, { semOrigem = 'Sem origem registrada', diferenca = 'Diferença' } = {}) {
  if (!faixas) {
    return termos.map((termo) => ({
      fonte: semOrigem,
      expressao: termo.expressao,
      valor: termo.valor,
      resultados: termo.resultados,
      semOrigem: true,
      detalhes: []
    }));
  }
  const linhas = [];
  for (const faixa of faixas) {
    if (faixa.fim <= faixa.ini) continue;
    const pedaco = termos.slice(faixa.ini, faixa.fim);
    const valor = somaDaFaixa(termos, faixa.ini, faixa.fim);
    // Parcela que não somou nada e não tem dado ("+0" do bônus vazio).
    if (valor === 0 && !pedaco.some((t) => t.dado)) continue;
    linhas.push({
      fonte: faixa.fonte,
      expressao: pedaco.map((t, i) => `${juntar(i, t.sinal)}${t.expressao}`).join(''),
      valor,
      resultados: pedaco.flatMap((t) => t.resultados ?? []),
      semOrigem: !!faixa.semOrigem,
      detalhes: fecharDetalhes(faixa.detalhes, valor, diferenca)
    });
  }
  return linhas;
}

/**
 * Para a prévia: a fonte de cada termo, por índice original do termo.
 * Cada termo recebe o texto da parcela inteira que o contém.
 */
export function fontePorTermo(faixas, termos) {
  const mapa = new Map();
  if (!faixas) return mapa;
  for (const faixa of faixas) {
    for (const termo of termos.slice(faixa.ini, faixa.fim)) {
      mapa.set(termo.indice, faixa);
    }
  }
  return mapa;
}

/** Texto do tooltip: "Perícia: Luta — Metade do nível 2 + Força 3 + Treino 2". */
export function textoDaFonte(faixa, termoValor, diferenca = 'Diferença') {
  if (!faixa) return '';
  const detalhes = fecharDetalhes(faixa.detalhes, termoValor, diferenca);
  if (!detalhes.length) return faixa.fonte;
  const contas = detalhes
    .map((d, i) => `${juntar(i, Math.sign(Number(d.valor)))}${d.fonte} ${Math.abs(Number(d.valor))}`)
    .join('');
  return `${faixa.fonte}: ${contas}`;
}

/**
 * Qual parcela extra (além das que a ficha já explica) veio de qual efeito
 * de uso. O sistema empurra o valor de cada mudança "somar" na lista de
 * parcelas, sem nome; aqui o valor é procurado entre os efeitos aplicados,
 * na ordem, cada um sendo usado uma vez só.
 *
 * `candidatos`: [{ fonte, valor }] — valor já multiplicado pela quantidade.
 */
export function rotularExtras(extras, candidatos, { bonusJanela, rotuloJanela, rotuloEfeito }) {
  const livres = [...(candidatos ?? [])];
  const normal = (v) => String(v ?? '').replace(/^\+|\s/g, '');
  return (extras ?? []).map((formula, i, todas) => {
    const alvo = normal(formula);
    // O campo Bônus da janela entra por último.
    if (i === todas.length - 1 && bonusJanela !== undefined && alvo === normal(bonusJanela)) {
      return { fonte: rotuloJanela, formula };
    }
    const achado = livres.findIndex((c) => normal(c.valor) === alvo);
    if (achado >= 0) {
      const [c] = livres.splice(achado, 1);
      return { fonte: c.fonte, formula };
    }
    return { fonte: rotuloEfeito, formula, semOrigem: true };
  });
}
