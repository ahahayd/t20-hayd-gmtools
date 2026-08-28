/**
 * Estudar o Adversário — contagem por oponente.
 *
 * Regra: ao errar um ataque, o personagem ganha +2 cumulativo em testes de
 * ataque contra AQUELE alvo, até o fim da cena.
 *
 * A contagem é individual por oponente (como as Combinações), mas não expira
 * sozinha: só o fim da cena zera (como Sangue dos Inimigos). Quantas vezes ela
 * pode subir por rodada é decisão da mesa — o módulo não trava.
 *
 * Funções puras: nada aqui toca em documentos do Foundry.
 */

/** Bônus em teste de ataque concedido por ponto de estudo. */
export const BONUS_POR_ESTUDO = 2;

/**
 * Registro por oponente: `{ n }` — pontos acumulados.
 *
 * Registros antigos podem trazer campos extras (a versão anterior guardava a
 * rodada para limitar um registro por rodada); eles são simplesmente ignorados.
 */
export function normalizarEstudo(registro) {
  return { n: Math.max(0, Math.trunc(Number(registro?.n) || 0)) };
}

/** Bônus concreto em teste de ataque para uma contagem. */
export function bonusDoEstudo(pontos) {
  return Math.max(0, Math.trunc(Number(pontos) || 0)) * BONUS_POR_ESTUDO;
}

/** Soma um ponto contra aquele oponente. */
export function registrarEstudo(registro) {
  return { n: normalizarEstudo(registro).n + 1 };
}

/**
 * Desfaz o último ponto. Devolve null quando não sobra nada, para o chamador
 * apagar a entrada em vez de guardar um zero.
 */
export function desfazerEstudo(registro) {
  const n = Math.max(0, normalizarEstudo(registro).n - 1);
  return n > 0 ? { n } : null;
}
