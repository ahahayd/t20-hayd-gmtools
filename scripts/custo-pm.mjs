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
export function ajusteInteiro(valor) {
  // Só número inteiro, com sinal opcional: "3", "+3", "-3". Fórmula, dado ou
  // texto valem 0 (parseInt aceitaria "3d6" como 3).
  const texto = String(valor ?? '').trim();
  return /^[+-]?\d+$/.test(texto) ? Number(texto) : 0;
}

/**
 * Custo em PM que o uso realmente gasta depois do ajuste manual: aplica o
 * ajuste ao custo já somado pelo sistema (base + aprimoramentos).
 */
export function custoAjustado(custo, ajuste) {
  const atual = Number(custo) || 0;
  const extra = ajusteInteiro(ajuste);
  if (!extra) return atual;
  if (atual <= 0 && extra <= 0) return atual;
  return Math.max(atual + extra, 1);
}

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

  const extra = ajusteInteiro(ajuste);
  total += extra;
  // Um ajuste positivo cobra PM mesmo de um item que não custava nada.
  if (extra > 0) temCusto = true;

  // Um uso que custa PM nunca fica abaixo de 1 — mesma regra que o sistema já
  // aplica quando um aprimoramento reduz o custo.
  if (!temCusto) return 0;
  return Math.max(total, 1);
}
