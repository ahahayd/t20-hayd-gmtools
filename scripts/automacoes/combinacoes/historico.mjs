/** Identificador que separa contagens de encontros diferentes. */
export function idCombateAtual() {
  return game.combat?.id ?? 'sem-combate';
}

/** Entradas pertencentes exclusivamente ao encontro informado. */
export function historicoDoCombate(historico, combateId = idCombateAtual()) {
  return (Array.isArray(historico) ? historico : [])
    .filter((entrada) => entrada?.c === combateId);
}

/**
 * Calcula a corrente na rodada pedida. Ordenar por rodada permite voltar o
 * combate, registrar um acerto e depois avançar novamente sem prender o valor.
 */
export function contagemNaRodada(historico, rodada, combateId = idCombateAtual()) {
  const entradas = historicoDoCombate(historico, combateId)
    .map((entrada, ordem) => ({ ...entrada, ordem }))
    .sort((a, b) => (Number(a.r) || 0) - (Number(b.r) || 0) || a.ordem - b.ordem);

  let valor = 0;
  let anterior = null;
  for (const entrada of entradas) {
    const r = Number(entrada?.r) || 0;
    const d = Number(entrada?.d) || 0;
    if (r > rodada) break;
    if (anterior !== null && r - anterior > 1) valor = 0;
    if (Number.isFinite(Number(entrada?.v))) valor = Number(entrada.v);
    else valor += d;
    anterior = r;
  }
  if (anterior === null || rodada - anterior > 1) return 0;
  return Math.max(0, valor);
}

export function criarEntrada(rodada, incremento, combateId = idCombateAtual()) {
  return { c: combateId, r: Number(rodada) || 0, d: Number(incremento) || 0 };
}

/** Marca um valor absoluto na rodada, usado pelo controle manual de redução. */
export function criarEntradaValor(rodada, valor, combateId = idCombateAtual()) {
  return { c: combateId, r: Number(rodada) || 0, v: Math.max(0, Number(valor) || 0) };
}

/** Remove somente o último acerto do encontro atual. */
export function removerUltimaEntrada(historico, combateId = idCombateAtual()) {
  const atual = historicoDoCombate(historico, combateId);
  atual.pop();
  return atual;
}
