/**
 * t20-hayd-tesouros | sessao.mjs
 * Uma "sessão de rolagem" acompanha, em ordem, TODO dado rolado para
 * resolver um resultado (a "trilha") — usada tanto para exibir/postar no
 * chat como cada rolagem levou ao item final, quanto para permitir o modo
 * "passo a passo": em vez de rolar tudo de uma vez, cada dado da cadeia
 * (o d6 do tipo de equipamento, o d100 de qual item, o d100 de cada
 * melhoria...) pode ser decidido individualmente pela UI (rolar agora,
 * pedir a um jogador, ou inserir manualmente) antes de seguir pro próximo.
 *
 * motor.mjs nunca chama `Roll` diretamente — todo dado passa por aqui, o
 * que garante que a trilha registrada é sempre completa e na ordem certa.
 */
import { rolarDado, rolarFormula } from './utils.mjs';

/**
 * Sinal de "o Mestre desistiu desta geração".
 *
 * O motor resolve as tabelas recursivamente, então não há como devolver um
 * "cancelado" pelo valor de retorno sem que cada nível tenha de checá-lo. Uma
 * exceção dedicada sobe sozinha até quem iniciou a rolagem, que a trata como
 * cancelamento em vez de erro.
 */
export class RolagemCancelada extends Error {
  constructor() {
    super('t20-hayd-tesouros | geração cancelada pelo Mestre');
    this.name = 'RolagemCancelada';
  }
}

export class SessaoDeRolagem {
  /**
   * @param {"auto"|"passo"} modo - rótulo livre pra quem monta a sessão (a
   *   própria classe não decide mais nada por causa dele — quem decide se
   *   `aoPedirPasso` intercepta ou não uma rolagem é o PRÓPRIO callback,
   *   olhando `dado`/`formula`; isso é o que permite, por exemplo, o modo
   *   "Automático" interceptar só os d100 — ver app-gerador.mjs).
   * @param {Function|null} aoPedirPasso - `async ({ rotulo, tipo, dado?, formula? }) => Roll|{total,manual:true}|falsy`.
   *   Chamado ANTES de toda rolagem (dado ou fórmula). Se devolver algo
   *   truthy, esse é o resultado usado; se devolver falsy (ou não existir),
   *   a sessão rola normal (`rolarDado`/`rolarFormula`).
   * @param {Function|null} aoEscolher - `async ({ rotulo, opcoes:[n1,n2] }) => valorEscolhido`.
   *   Usado SEMPRE que há uma regra "2D" — o Mestre escolhe qual dos dois d6
   *   usar ANTES de saber o que cada um resultaria (só o número, nunca o
   *   item). Sem callback, usa o primeiro valor.
   */
  constructor({ modo = 'auto', aoPedirPasso = null, aoEscolher = null } = {}) {
    this.modo = modo;
    this.aoPedirPasso = aoPedirPasso;
    this.aoEscolher = aoEscolher;
    /** @type {Array<{rotulo:string, formula:string, total:number|string, ajustado:number|null, manual:boolean, roll:Roll|null}>} */
    this.trilha = [];
  }

  /**
   * Rola 1d<dado> (ex.: o d6 de categoria, o d100 de um item, o d20 de
   * espaços). `ajustar(totalBruto) => totalFinal` cobre a regra "+%" do
   * livro (soma 20 na rolagem de riqueza/poção): a trilha guarda os dois
   * valores (bruto e ajustado), mas quem chama só recebe o ajustado.
   */
  async d(dado, rotulo, { ajustar = null } = {}) {
    const roll = await this.#obter({ rotulo, tipo: 'dado', dado });
    const bruto = roll.total;
    const total = ajustar ? ajustar(bruto) : bruto;
    this.trilha.push({
      rotulo, formula: `1d${dado}`, total: bruto, ajustado: total !== bruto ? total : null,
      manual: !!roll.manual, roll: roll.manual ? null : roll
    });
    return { total };
  }

  /** Rola uma fórmula (dinheiro, quantidade de riquezas/poções...). */
  async formula(formula, rotulo) {
    const roll = await this.#obter({ rotulo, tipo: 'formula', formula });
    this.trilha.push({ rotulo, formula, total: roll.total, ajustado: null, manual: !!roll.manual, roll: roll.manual ? null : roll });
    return roll;
  }

  /**
   * Regra "2D": rola 2d6 SEPARADOS (cada metade passa por `aoPedirPasso`
   * como qualquer outro d6) e devolve o valor ESCOLHIDO — não os dois, quem
   * chama só recebe um d6 pronto pra usar. O Mestre escolhe qual dos dois
   * números usar ANTES de saber o que cada um resultaria (a escolha é só
   * entre "4" e "2", nunca entre "espada" e "machado") — por isso essa
   * escolha acontece aqui dentro, e não depois na UI.
   */
  async escolha2D(rotulo) {
    const a = await this.d(6, `${rotulo} — dado 1`);
    const b = await this.d(6, `${rotulo} — dado 2`);
    const opcoes = [a.total, b.total];
    const escolhido = this.aoEscolher ? await this.aoEscolher({ rotulo, opcoes }) : opcoes[0];
    this.trilha.push({
      rotulo: `${rotulo} — escolha do Mestre`, formula: `${opcoes[0]} ou ${opcoes[1]}`,
      total: escolhido, ajustado: null, manual: false, roll: null
    });
    return escolhido;
  }

  async #obter(spec) {
    if (this.aoPedirPasso) {
      const resultado = await this.aoPedirPasso(spec);
      if (resultado) return resultado;
    }
    return spec.tipo === 'dado' ? rolarDado(spec.dado) : rolarFormula(spec.formula);
  }
}

/** Sessão "rápida" (comportamento de antes: rola tudo internamente, sem pausar nem postar passo a passo). */
export function sessaoAutomatica(opcoes = {}) {
  return new SessaoDeRolagem({ modo: 'auto', ...opcoes });
}
