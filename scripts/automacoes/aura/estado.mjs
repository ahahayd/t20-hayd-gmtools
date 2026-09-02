/**
 * Auras — estado na ficha da fonte.
 *
 * A flag mora no ator FONTE de propósito: é a ficha que o jogador possui e
 * pode escrever. O Mestre observa essa flag e é quem grava os efeitos nos
 * aliados, que o jogador não teria permissão de tocar.
 */
import { MODULE_ID } from '../runtime.mjs';
import { definicaoDe } from '../estado.mjs';
import { aurasAtivas, raioEfetivo, normalizarEstado } from './regras.mjs';

/** Flag no ATOR fonte: `{ [itemId]: estado }`. */
export const FLAG_AURAS = 'auras';

/* ─── Leitura ────────────────────────────────────────────────────────────── */

/** Poderes da ficha que definem uma aura. */
export function poderesDeAura(ator) {
  return ator?.items?.filter((i) => definicaoDe(i)?.aura) ?? [];
}

/** Modificadores de aura presentes na ficha (Aura Poderosa, Aura de Cura…). */
export function modificadoresDeAura(ator) {
  return (ator?.items ?? [])
    .map((i) => definicaoDe(i)?.auraModificador)
    .filter(Boolean);
}

/** Auras ligadas nesta ficha, com o item e a definição já resolvidos. */
export function aurasDoAtor(ator) {
  const flag = ator?.getFlag?.(MODULE_ID, FLAG_AURAS);
  const saida = [];
  for (const estado of aurasAtivas(flag)) {
    const item = ator.items?.get(estado.itemId);
    const def = item ? definicaoDe(item) : null;
    if (!def?.aura) continue;
    saida.push({ estado, item, def });
  }
  return saida;
}

/** Estado de uma aura específica (ou null). */
export function estadoDaAura(ator, itemId) {
  const flag = ator?.getFlag?.(MODULE_ID, FLAG_AURAS) ?? {};
  return normalizarEstado(flag[itemId]);
}

/** Raio final desta aura, já com Aura Poderosa e afins. */
export function raioDaAura(ator, def) {
  return raioEfetivo(def?.aura?.raio, modificadoresDeAura(ator));
}

/** Primeiro modificador de cura da ficha (Aura de Cura). */
export function modificadorDeCura(ator) {
  return modificadoresDeAura(ator).find((m) => m?.cura) ?? null;
}

/* ─── Escrita ────────────────────────────────────────────────────────────── */

async function gravar(ator, itemId, estado) {
  const tudo = foundry.utils.deepClone(ator.getFlag(MODULE_ID, FLAG_AURAS) ?? {});
  if (estado) {
    tudo[itemId] = estado;
    await ator.setFlag(MODULE_ID, FLAG_AURAS, tudo);
    return;
  }
  // setFlag faz MERGE: apagar a chave do objeto não a remove no banco.
  delete tudo[itemId];
  await ator.update({ [`flags.${MODULE_ID}.${FLAG_AURAS}.-=${itemId}`]: null });
}

/** Liga a aura. O efeito nos aliados é gravado pelo Mestre, ao ver a flag. */
export async function ativarAura(item) {
  const ator = item?.actor;
  if (!ator) return null;

  const token = ator.token?.object ?? ator.getActiveTokens?.()[0] ?? null;
  if (!token) {
    ui.notifications.warn(game.i18n.localize('T20HaydGMTools.AuraPrecisaToken'));
    return null;
  }

  const estado = {
    id: definicaoDe(item)?.id ?? null,
    cena: canvas?.scene?.id ?? null,
    token: token.id,
    aviso: null,
    sustentada: null,
    pedido: null,
    feito: null
  };
  await gravar(ator, item.id, estado);

  if (!game.users?.activeGM) {
    ui.notifications.warn(game.i18n.localize('T20HaydGMTools.AuraSemMestre'));
  }
  return estado;
}

/** Desliga a aura. A limpeza dos efeitos fica com o Mestre. */
export async function desativarAura(ator, itemId) {
  if (!ator) return;
  await gravar(ator, itemId, null);
}

/** Marca que o jogador confirmou a manutenção nesta rodada. */
export async function marcarSustentada(ator, itemId, { combate, rodada }) {
  const estado = estadoDaAura(ator, itemId);
  if (!estado) return;
  await gravar(ator, itemId, { ...estado, sustentada: { combate, rodada } });
}

/** Marca que o lembrete daquela rodada já foi publicado. */
export async function marcarAviso(ator, itemId, { combate, rodada }) {
  const estado = estadoDaAura(ator, itemId);
  if (!estado) return;
  await gravar(ator, itemId, { ...estado, aviso: { combate, rodada } });
}

/**
 * Registra um pedido do jogador para o Mestre executar (hoje, só a cura).
 *
 * É o canal jogador → Mestre sem socket: o jogador escreve na própria ficha.
 */
export async function pedir(ator, itemId, tipo, dados = {}) {
  const estado = estadoDaAura(ator, itemId);
  if (!estado) return;
  const pedido = { id: foundry.utils.randomID(), tipo, ...dados };
  await gravar(ator, itemId, { ...estado, pedido });
}

/** O Mestre marca o pedido como executado e limpa a fila. */
export async function concluirPedido(ator, itemId, pedidoId) {
  const estado = estadoDaAura(ator, itemId);
  if (!estado) return;
  await gravar(ator, itemId, { ...estado, pedido: null, feito: pedidoId });
}
