/**
 * Contas das mensagens de dano, cura e mana — sem Foundry, testáveis.
 *
 * O cartão nativo só mostra um número. O que dá para desfazer de verdade é a
 * diferença real entre os recursos antes e depois: já com os PV temporários
 * absorvendo primeiro, RD aplicada e o sistema limitando ao mínimo/máximo.
 */

const num = (valor) => Number(valor) || 0;

function normalizar(recursos) {
  return {
    pv: num(recursos?.pv),
    pvTemp: num(recursos?.pvTemp),
    pm: num(recursos?.pm),
    pmTemp: num(recursos?.pmTemp)
  };
}

/** Lê PV/PM (e temporários) de `actor.system.attributes`. */
export function lerRecursos(atributos) {
  return normalizar({
    pv: atributos?.pv?.value,
    pvTemp: atributos?.pv?.temp,
    pm: atributos?.pm?.value,
    pmTemp: atributos?.pm?.temp
  });
}

export function diferenca(antes, depois) {
  const a = normalizar(antes);
  const d = normalizar(depois);
  return {
    pv: d.pv - a.pv,
    pvTemp: d.pvTemp - a.pvTemp,
    pm: d.pm - a.pm,
    pmTemp: d.pmTemp - a.pmTemp
  };
}

export function temAlteracao(delta) {
  return Object.values(normalizar(delta)).some((valor) => valor !== 0);
}

/**
 * Uma linha por efeito visível. Perdas somam o que saiu dos temporários com o
 * que saiu do valor normal — para quem sofreu, foi um golpe só. Ganhos ficam
 * separados porque são recursos diferentes (cura não vira PV temporário).
 */
export function linhasDoResultado(delta) {
  const d = normalizar(delta);
  const linhas = [];
  const perdaPV = Math.min(d.pv, 0) + Math.min(d.pvTemp, 0);
  if (perdaPV < 0) linhas.push({ tipo: 'dano', valor: perdaPV, recurso: 'pv' });
  if (d.pv > 0) linhas.push({ tipo: 'cura', valor: d.pv, recurso: 'pv' });
  if (d.pvTemp > 0) linhas.push({ tipo: 'pvTemp', valor: d.pvTemp, recurso: 'pv' });
  const perdaPM = Math.min(d.pm, 0) + Math.min(d.pmTemp, 0);
  if (perdaPM < 0) linhas.push({ tipo: 'mana', valor: perdaPM, recurso: 'pm' });
  if (d.pm > 0) linhas.push({ tipo: 'manaGanha', valor: d.pm, recurso: 'pm' });
  if (d.pmTemp > 0) linhas.push({ tipo: 'pmTemp', valor: d.pmTemp, recurso: 'pm' });
  return linhas;
}

const limite = (valor, padrao) => (valor === null || valor === undefined || valor === ''
  || !Number.isFinite(Number(valor)) ? padrao : Number(valor));

/**
 * Tira a diferença dos valores ATUAIS (sentido -1, desfazer) ou põe de novo
 * (+1, refazer). Nunca restaura o "antes" gravado: qualquer dano sofrido
 * depois da mensagem seria apagado junto.
 */
export function aplicarDiferenca(atual, delta, limites = {}, sentido = -1) {
  const a = normalizar(atual);
  const d = normalizar(delta);
  const pvMin = limite(limites.pvMin, -Infinity);
  const pvMax = limite(limites.pvMax, Infinity);
  const pmMin = limite(limites.pmMin, 0);
  const pmMax = limite(limites.pmMax, Infinity);
  const entre = (valor, min, max) => Math.min(Math.max(valor, min), max);
  return {
    pv: entre(a.pv + sentido * d.pv, pvMin, pvMax),
    pvTemp: Math.max(0, a.pvTemp + sentido * d.pvTemp),
    pm: entre(a.pm + sentido * d.pm, pmMin, pmMax),
    pmTemp: Math.max(0, a.pmTemp + sentido * d.pmTemp)
  };
}
