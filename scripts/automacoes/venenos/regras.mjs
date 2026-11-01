/**
 * Venenos de dano contínuo — regras puras.
 *
 * Dano de veneno é cumulativo: cada veneno aplicado conta as próprias rodadas
 * e, no início do turno da criatura, o dano de todos sai numa rolagem só. O
 * dano é sempre perda de PV, então a fórmula guardada é só o dado ("1d12") e
 * o tipo entra na hora de rolar.
 *
 * Nada aqui toca em documentos do Foundry.
 */

/** Condição do sistema que acompanha os venenos. */
export const CONDICAO = 'envenenado';

/** Categoria da condição: imunidade a ela também protege do veneno. */
const CATEGORIA = 'veneno';

/** Os dois resultados do teste de resistência, na ordem dos botões. */
export const RESULTADOS = ['sucesso', 'falha'];

/**
 * Só dados e números somados ou subtraídos. O sistema dá o tipo termo a termo
 * ao aplicar o dano, então uma fórmula com multiplicação ou parênteses perderia
 * o tipo "perda" em parte dos termos.
 */
const FORMULA_DE_DANO = /^\d+(d\d+)?([+-]\d+(d\d+)?)*$/;

/** "1D12 [perda]" → "1d12": o tipo é sempre perda, quem digitou não precisa dele. */
export function normalizarDano(texto) {
  return String(texto ?? '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, '').toLowerCase();
}

export function danoValido(texto) {
  return FORMULA_DE_DANO.test(normalizarDano(texto));
}

export function normalizarRodadas(valor) {
  return Math.max(0, Math.trunc(Number(valor) || 0));
}

/** Um resultado do teste já normalizado. */
function normalizarResultado(resultado) {
  return { dano: normalizarDano(resultado?.dano), rodadas: normalizarRodadas(resultado?.rodadas) };
}

/** Configuração salva no item, já normalizada. */
export function normalizarConfig(config = {}) {
  return {
    sucesso: normalizarResultado(config?.sucesso),
    falha: normalizarResultado(config?.falha),
    ignoraImunidade: !!config?.ignoraImunidade
  };
}

/** Resultado em branco: passar (ou falhar) no teste não aplica veneno nenhum. */
export function resultadoVazio(resultado) {
  return !normalizarDano(resultado?.dano) && !normalizarRodadas(resultado?.rodadas);
}

/** Um resultado preenchido precisa de dano válido e de ao menos uma rodada. */
function resultadoValido(resultado) {
  return danoValido(resultado?.dano) && normalizarRodadas(resultado?.rodadas) > 0;
}

/**
 * Cada resultado ou fica em branco ou vem completo, e pelo menos um deles
 * precisa aplicar alguma coisa.
 */
export function configValida(config) {
  const resultados = RESULTADOS.map((r) => config?.[r]);
  return resultados.some((r) => !resultadoVazio(r))
    && resultados.every((r) => resultadoVazio(r) || resultadoValido(r));
}

/** "1d12+2" → "1d12[perda]+2[perda]", o formato que o sistema lê termo a termo. */
export function formulaDePerda(dano) {
  return normalizarDano(dano).replace(/\d+(d\d+)?/g, '$&[perda]');
}

/** Fórmula única com o dano de todos os venenos. */
export function formulaAcumulada(venenos) {
  return venenos.map((v) => formulaDePerda(v.dano)).join('+');
}

/** Venenos gravados no ator (mapa por id) como lista, do mais antigo ao mais novo. */
export function listarVenenos(registro) {
  return Object.values(registro ?? {})
    .filter((v) => v?.id)
    .sort((a, b) => (a.criado ?? 0) - (b.criado ?? 0));
}

/** Passa uma rodada: cada veneno desconta a própria, sem tocar nos outros. */
export function avancarRodada(venenos) {
  const contados = venenos.map((v) => ({ ...v, rodadas: normalizarRodadas(v.rodadas) - 1 }));
  return {
    restantes: contados.filter((v) => v.rodadas > 0),
    encerrados: contados.filter((v) => v.rodadas <= 0)
  };
}

/** Rolagens lembradas por criatura: bem mais do que uma mesa volta de uma vez. */
const LIMITE_HISTORICO = 30;

/** A criatura já rolou o veneno nesta rodada deste combate? */
export function jaRolou(historico, agora) {
  return (historico ?? []).some((r) => r.combate === agora.combate && r.rodada === agora.rodada);
}

/**
 * Histórico com a rolagem deste turno. Guarda só o que ela mudou, para desfazer
 * sem tocar no que veio depois: quem seguiu contando e quem acabou nela.
 * Outros combates saem: não há como voltar para eles.
 */
export function registrarTurno(historico, agora, { restantes, encerrados }) {
  const registro = {
    ...agora,
    contados: restantes.map((v) => v.id),
    encerrados: encerrados.map((v) => ({ ...v, rodadas: 1 }))
  };
  return [...(historico ?? []).filter((r) => r.combate === agora.combate), registro]
    .slice(-LIMITE_HISTORICO);
}

/** O turno desta rolagem ainda não aconteceu, olhando de onde o combate está? */
function ficouAdiante(registro, agora) {
  if (registro.combate !== agora.combate) return false;
  return registro.rodada > agora.rodada
    || (registro.rodada === agora.rodada && registro.turno > agora.turno);
}

/**
 * Desfaz as rolagens que ficaram adiante do turno atual: devolve a rodada de
 * cada veneno e traz de volta os que acabaram nelas. Veneno aplicado depois
 * segue como está, e o encerrado à mão não volta.
 * Devolve o histórico que sobra e os venenos que mudaram.
 */
export function desfazerTurnos(historico, agora, ativos) {
  const desfeitos = (historico ?? []).filter((r) => ficouAdiante(r, agora));
  const venenos = new Map(ativos.map((v) => [v.id, v]));
  const mudados = new Map();
  // Do mais novo ao mais antigo: quem acabou volta antes de recuperar as outras rodadas
  for (const registro of [...desfeitos].reverse()) {
    for (const veneno of registro.encerrados) {
      venenos.set(veneno.id, veneno);
      mudados.set(veneno.id, veneno);
    }
    for (const id of registro.contados) {
      const veneno = venenos.get(id);
      if (!veneno) continue;
      const devolvido = { ...veneno, rodadas: normalizarRodadas(veneno.rodadas) + 1 };
      venenos.set(id, devolvido);
      mudados.set(id, devolvido);
    }
  }
  return {
    historico: (historico ?? []).filter((r) => !ficouAdiante(r, agora)),
    mudados: [...mudados.values()]
  };
}

/** `imunidades`: o Set (ou lista) de `system.tracos.ic.value`. */
export function imuneAVeneno(imunidades) {
  const lista = new Set(imunidades ?? []);
  return lista.has(CONDICAO) || lista.has(CATEGORIA);
}
