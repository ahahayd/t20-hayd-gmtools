import { APARATOS } from './catalogo.mjs';

const CUSTO_POR_CIRCULO = [0, 1, 3, 6, 10, 15];

export function custoPadraoDoCirculo(circulo) {
  const n = Math.max(0, Math.floor(Number(circulo) || 0));
  return CUSTO_POR_CIRCULO[n] ?? Math.max(0, n * (n + 1) / 2);
}

/** Mantém apenas aparatos conhecidos, no máximo dois; só Espera pode repetir. */
export function normalizarAparatos(valor) {
  const saida = [];
  for (const id of Array.isArray(valor) ? valor : []) {
    if (!APARATOS[id] || saida.length >= 2) continue;
    if (saida.includes(id) && !APARATOS[id].repetivel) continue;
    saida.push(id);
  }
  return saida;
}

export function normalizarEstado(valor = {}, { custoBase = 0, atributoCD = '' } = {}) {
  const bruto = valor && typeof valor === 'object' ? valor : {};
  return {
    custoBase: Math.max(0, Number(bruto.custoBase ?? custoBase) || 0),
    atributoCDOriginal: String(bruto.atributoCDOriginal ?? atributoCD ?? ''),
    usosDia: Math.max(0, Math.floor(Number(bruto.usosDia) || 0)),
    enguicada: !!bruto.enguicada,
    pericia: String(bruto.pericia || 'enge'),
    aparatos: normalizarAparatos(bruto.aparatos),
    refrigeracaoUsada: !!bruto.refrigeracaoUsada,
    resfriada: !!bruto.resfriada,
    gatilhoPronto: bruto.gatilhoPronto !== false,
    supressorUsado: !!bruto.supressorUsado
  };
}

export function temAparato(estado, id) {
  return normalizarAparatos(estado?.aparatos).includes(id);
}

/** Um aparato soma +2; dois somam +5, inclusive duas Esperas. */
export function modificadorAparatos(aparatos) {
  const total = normalizarAparatos(aparatos).length;
  return total <= 0 ? 0 : total === 1 ? 2 : 5;
}

export function custoAprimoramentos(custo, aparatos) {
  const total = Math.max(0, Number(custo) || 0);
  return Math.max(0, total - (normalizarAparatos(aparatos).includes('comutador') ? 1 : 0));
}

export function calcularCD({ custoBase = 0, aprimoramentos = 0, usosDia = 0, aparatos = [], resfriada = false } = {}) {
  return 15
    + Math.max(0, Number(custoBase) || 0)
    + Math.max(0, Number(aprimoramentos) || 0)
    + Math.max(0, Math.floor(Number(usosDia) || 0)) * 5
    + modificadorAparatos(aparatos)
    - (resfriada ? 5 : 0);
}

/** Estado após uma tentativa; o Supressor evita tanto enguiço quanto incremento. */
export function depoisDaTentativa(estado, { sucesso, usarSupressor = false } = {}) {
  const atual = normalizarEstado(estado, {
    custoBase: estado?.custoBase,
    atributoCD: estado?.atributoCDOriginal
  });
  // `usarSupressor` já é a decisão do jogador no checkbox da ativação —
  // inclusive a de usá-lo de novo mesmo já tendo sido usado na cena. "Uma vez
  // por cena" é só o PADRÃO do checkbox (desmarcado quando `supressorUsado`),
  // não uma trava imposta aqui; por isso não se olha `atual.supressorUsado`.
  const suprimiu = !sucesso && usarSupressor && temAparato(atual, 'supressor-seguranca');
  return {
    ...atual,
    usosDia: atual.usosDia + (suprimiu ? 0 : 1),
    enguicada: sucesso ? false : !suprimiu,
    resfriada: false,
    supressorUsado: atual.supressorUsado || suprimiu
  };
}

/** Troca retroativamente uma falha já contabilizada por sucesso (correção manual). */
export function corrigirFalhaParaSucesso(estadoAtual, estadoAntes, { usarSupressor = false } = {}) {
  const atual = normalizarEstado(estadoAtual, {
    custoBase: estadoAtual?.custoBase,
    atributoCD: estadoAtual?.atributoCDOriginal
  });
  const antes = normalizarEstado(estadoAntes, {
    custoBase: estadoAntes?.custoBase,
    atributoCD: estadoAntes?.atributoCDOriginal
  });
  const falha = depoisDaTentativa(antes, { sucesso: false, usarSupressor });
  const sucesso = depoisDaTentativa(antes, { sucesso: true });
  return {
    ...atual,
    usosDia: Math.max(0, atual.usosDia + sucesso.usosDia - falha.usosDia),
    enguicada: falha.enguicada ? false : atual.enguicada,
    supressorUsado: usarSupressor ? sucesso.supressorUsado : atual.supressorUsado,
    gatilhoPronto: temAparato(antes, 'gatilho-corda') ? false : atual.gatilhoPronto
  };
}

/** Troca retroativamente um sucesso já contabilizado por falha (correção manual). */
export function corrigirSucessoParaFalha(estadoAtual, estadoAntes, { usarSupressor = false } = {}) {
  const atual = normalizarEstado(estadoAtual, {
    custoBase: estadoAtual?.custoBase,
    atributoCD: estadoAtual?.atributoCDOriginal
  });
  const antes = normalizarEstado(estadoAntes, {
    custoBase: estadoAntes?.custoBase,
    atributoCD: estadoAntes?.atributoCDOriginal
  });
  const sucesso = depoisDaTentativa(antes, { sucesso: true });
  const falha = depoisDaTentativa(antes, { sucesso: false, usarSupressor });
  return {
    ...atual,
    usosDia: Math.max(0, atual.usosDia + falha.usosDia - sucesso.usosDia),
    enguicada: falha.enguicada,
    supressorUsado: usarSupressor ? falha.supressorUsado : atual.supressorUsado,
    // Um sucesso de verdade consome o gatilho de corda; desfazer o sucesso
    // devolve o gatilho ao estado de ANTES da tentativa, não ao atual.
    gatilhoPronto: temAparato(antes, 'gatilho-corda') ? antes.gatilhoPronto : atual.gatilhoPronto
  };
}

export function resetarDia(estado) {
  const atual = normalizarEstado(estado, {
    custoBase: estado?.custoBase,
    atributoCD: estado?.atributoCDOriginal
  });
  return { ...atual, usosDia: 0, refrigeracaoUsada: false, resfriada: false };
}

/** Soma +1 por dado encontrado em uma fórmula de cura. */
export function bonusPorDado(formula) {
  const texto = String(formula ?? '');
  let dados = 0;
  for (const m of texto.matchAll(/(?:^|[^\w])(\d+)d\d+/gi)) dados += Number(m[1]) || 0;
  return dados > 0 ? `${texto}+${dados}` : texto;
}

/** Fórmula de um dado extra do mesmo tamanho que o primeiro termo. */
export function dadoExtraDaFormula(formula) {
  const faces = String(formula ?? '').match(/\d+d(\d+)/i)?.[1];
  return faces ? `1d${faces}` : '';
}
