/**
 * Efeitos ativos mantidos pelas automações.
 *
 * Vive fora do motor porque as auras também precisam disso e não podem
 * importar `motor.mjs` — a direção de import é sempre motor → domínio.
 */
import { MODULE_ID } from './runtime.mjs';

/** Flag no EFEITO do ator: chave da automação que o originou. */
export const FLAG_ORIGEM = 'automacaoOrigem';

/** Efeito mantido pelo módulo sob uma chave (item.id, ou item.id:sufixo). */
export function efeitoPorChave(ator, chave) {
  return ator?.effects?.find((ef) => ef.getFlag(MODULE_ID, FLAG_ORIGEM) === chave);
}

/** Todos os efeitos que usam exatamente a mesma chave de automação. */
export function efeitosPorChave(ator, chave) {
  return (ator?.effects ?? []).filter((ef) => ef.getFlag(MODULE_ID, FLAG_ORIGEM) === chave);
}

/**
 * O efeito já está exatamente como o módulo quer?
 *
 * Mirar um token dispara duas sincronizações (desmarcar o antigo, marcar o
 * novo) e a mesa troca de alvo o tempo todo. Sem esta comparação, cada clique
 * reescrevia todos os efeitos de Combinação do personagem — e cada escrita é
 * banco de dados, socket para todos os clientes e re-preparo da ficha. Nas
 * auras o efeito é o mesmo: mover um token recalcula todo mundo na área.
 *
 * Compara só o que o módulo define: o sistema pode guardar outras flags no
 * efeito, e elas não são motivo para reescrever.
 */
export function efeitoEmDia(efeito, dados) {
  if (!efeito) return false;
  if (efeito.name !== dados.name) return false;
  if (efeito.img !== dados.img) return false;
  if (!!efeito.disabled !== !!dados.disabled) return false;

  const atuais = efeito.changes ?? [];
  const novas = dados.changes ?? [];
  if (atuais.length !== novas.length) return false;
  for (let i = 0; i < novas.length; i += 1) {
    const a = atuais[i];
    const n = novas[i];
    if (a?.key !== n?.key || a?.mode !== n?.mode || String(a?.value) !== String(n?.value)) {
      return false;
    }
  }

  const t20 = efeito.flags?.tormenta20 ?? {};
  for (const [chave, valor] of Object.entries(dados.flags?.tormenta20 ?? {})) {
    if (t20[chave] !== valor) return false;
  }
  return true;
}
