/**
 * Cálculo do custo em PM de um uso.
 *
 * Lógica pura, fora do arquivo que fala com o Foundry: assim dá para testar a
 * conta sem um mundo aberto — mesmo padrão de regras.mjs e sugestao.mjs.
 */

/**
 * Soma o custo em PM de um uso: o do próprio item, os aprimoramentos aplicados
 * e o ajuste manual da janela.
 *
 * @param {number} base    Custo do próprio item (system.ativacao.custo)
 * @param {Array<{custo: any, quantidade?: number}>} parcelas  Aprimoramentos
 * @param {any} ajuste     Campo "ajuste de custo" da janela
 * @returns {number}
 */
export function custoTotalDePM(base, parcelas = [], ajuste = 0) {
  let total = Number(base) || 0;
  let temCusto = total > 0;

  for (const parcela of parcelas) {
    // "Truque" e vazio viram NaN/0 de propósito: são aprimoramentos sem custo,
    // e é assim que o próprio sistema os trata.
    const custo = Number(parcela?.custo);
    if (!custo) continue;

    const quantidade = parcela.quantidade === undefined ? 1 : Number(parcela.quantidade) || 0;
    if (quantidade <= 0) continue;

    total += custo * quantidade;
    temCusto = true;
  }

  total += Number(ajuste) || 0;

  // Um uso que custa PM nunca fica abaixo de 1 — mesma regra que o sistema já
  // aplica quando um aprimoramento reduz o custo.
  if (!temCusto) return 0;
  return Math.max(total, 1);
}
