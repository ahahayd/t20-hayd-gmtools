/** Metadados da rodada em que um efeito ou condição foi aplicado. */
export function marcaAplicacao(combateId, rodada, { turno = null, combatente = null } = {}) {
  return {
    combate: combateId,
    rodada: Number(rodada) || 0,
    turno: Number.isFinite(Number(turno)) ? Number(turno) : null,
    combatente
  };
}

/** Aceita tanto o registro atual quanto o formato antigo (somente um array). */
export function normalizarRegistroCondicoes(registro) {
  if (Array.isArray(registro)) {
    return { condicoes: registro, combate: null, rodada: null };
  }
  return {
    condicoes: Array.isArray(registro?.condicoes) ? registro.condicoes : [],
    combate: registro?.combate ?? null,
    rodada: Number.isFinite(Number(registro?.rodada)) ? Number(registro.rodada) : null,
    turno: Number.isFinite(Number(registro?.turno)) ? Number(registro.turno) : null,
    combatente: registro?.combatente ?? null
  };
}

/** Uma aplicação dura até a rodada seguinte, sem ser renovada pela contagem geral. */
export function aplicacaoExpirada(registro, combateId, rodadaAtual, {
  rodadaAnterior = null,
  turnoAnterior = null,
  combatenteAnterior = null,
  combatenteEsperado = null
} = {}) {
  const dados = normalizarRegistroCondicoes(registro);
  if (!dados.combate || dados.rodada === null) return false;
  if (dados.combate !== combateId) return false;

  const combatente = dados.combatente ?? combatenteEsperado;
  if (combatente) {
    // Expira ao SAIR do próximo turno de quem aplicou. Assim o efeito ainda
    // vale durante esse turno inteiro e só some quando a iniciativa avança.
    if (combatenteAnterior !== combatente) return false;
    const rAnterior = Number.isFinite(Number(rodadaAnterior))
      ? Number(rodadaAnterior) : Number(rodadaAtual);
    return rAnterior > dados.rodada
      || (rAnterior === dados.rodada
        && dados.turno !== null && Number(turnoAnterior) > dados.turno);
  }

  // Compatibilidade com aplicações antigas, que ainda não guardavam o turno.
  return Number(rodadaAtual) > dados.rodada;
}
