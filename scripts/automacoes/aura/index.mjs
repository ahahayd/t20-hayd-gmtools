/**
 * Auras — orquestrador.
 *
 * É o único objeto que motor e hooks importam. Todo o trabalho de escrita
 * acontece no cliente do Mestre ativo: os efeitos entram em fichas de outros
 * jogadores, que o dono da aura não teria permissão de tocar.
 */
import { MODULE_ID, automacoesAtivas, souGmAtivo } from '../runtime.mjs';
import { IndiceAtoresAutomacoes } from '../indice-atores.mjs';
import { definicaoDe } from '../estado.mjs';
import {
  FLAG_AURAS, poderesDeAura, aurasDoAtor, estadoDaAura, raioDaAura, modificadorDeCura,
  ativarAura, desativarAura, marcarSustentada, marcarAviso, pedir, concluirPedido
} from './estado.mjs';
import { sincronizarAura, limparAura, limparOrfaos, aplicarCura, desfazerCuraDe } from './efeitos.mjs';
import { curaDaAura, precisaAvisar, pedidoPendente } from './regras.mjs';
import { aoPassarMouse, limparPrevia } from './desenho.mjs';
import * as chat from './chat.mjs';

/** Atores que têm algum poder de aura na ficha. */
export const indiceAura = new IndiceAtoresAutomacoes(
  (ator) => poderesDeAura(ator).length > 0
);

/** Existe alguma aura ligada? Corta os gatilhos antes de qualquer trabalho. */
export function existeAlguma() {
  return indiceAura.listar().some((ator) => aurasDoAtor(ator).length > 0);
}

/* ─── Recálculo ──────────────────────────────────────────────────────────── */

async function recalcular() {
  if (!automacoesAtivas() || !souGmAtivo()) return;

  for (const ator of indiceAura.listar()) {
    for (const aura of aurasDoAtor(ator)) {
      // Aura de outra cena não tem geometria conferível aqui.
      if (aura.estado.cena && aura.estado.cena !== canvas?.scene?.id) continue;
      await sincronizarAura(ator, aura);
    }
  }
  await limparOrfaos();
}

/**
 * Mover token e mexer parede vêm em rajada; sem isto, arrastar um token com
 * seis aliados na área viraria dezenas de escritas por segundo.
 */
let _agendado = null;

export function agendarRecalculo() {
  // Criado na primeira chamada, não no import: durante o carregamento do
  // módulo o `foundry.utils` ainda pode não existir.
  _agendado ??= foundry.utils.debounce(() => {
    recalcular().catch((err) => console.error(`${MODULE_ID} | Falha ao recalcular auras`, err));
  }, 100);
  _agendado();
}

/* ─── Ações do jogador ───────────────────────────────────────────────────── */

async function ativar(item) {
  const estado = await ativarAura(item);
  if (estado) agendarRecalculo();
}

async function cancelar(fonte, itemId) {
  await desativarAura(fonte, itemId);
  agendarRecalculo();
}

/**
 * Desconta o PM de quem sustenta a aura.
 *
 * Sem PM suficiente a aura NÃO cai: o total vai a zero e o chat avisa. Quem
 * joga decide o que fazer — o módulo não encerra poder por conta própria.
 */
async function descontarPM(fonte, custo) {
  if (!(custo > 0)) return null;
  const pm = fonte?.system?.attributes?.pm;
  if (!pm || !fonte.isOwner) return null;

  const antes = Number(pm.value) || 0;
  await fonte.update({ 'system.attributes.pm.value': Math.max(0, antes - custo) });
  return { restam: Math.max(0, antes - custo), faltou: Math.max(0, custo - antes) };
}

async function manter(fonte, itemId) {
  const combate = game.combat;
  await marcarSustentada(fonte, itemId, {
    combate: combate?.id ?? null,
    rodada: Number(combate?.round) || 0
  });

  const item = fonte.items.get(itemId);
  const def = item ? definicaoDe(item) : null;
  if (!item || !def?.aura) return;

  const mod = modificadorDeCura(fonte);
  const chave = mod?.cura?.atributo ?? 'car';
  const cura = curaDaAura(mod, Number(fonte?.system?.atributos?.[chave]?.value) || 0);

  const custo = def.aura.custo ?? 0;
  const gasto = await descontarPM(fonte, custo);
  await chat.anunciarSustentacao(fonte, item, { custo, cura, gasto });
}

/** O jogador pede; o Mestre executa ao ver a flag mudar. */
async function pedirCura(fonte, itemId, mensagemId = null) {
  // A mensagem vai junto para o Mestre marcar o botão como usado depois.
  await pedir(fonte, itemId, 'cura', { mensagem: mensagemId });
}

/* ─── Execução dos pedidos (só o Mestre) ─────────────────────────────────── */

async function atenderPedidos(ator) {
  if (!souGmAtivo()) return;

  for (const aura of aurasDoAtor(ator)) {
    const pendente = pedidoPendente(aura.estado);
    if (pendente?.tipo !== 'cura') continue;

    const resultado = await aplicarCura(ator, aura);
    await concluirPedido(ator, aura.item.id, pendente.id);
    if (resultado.alvos.length) await chat.anunciarCura(ator, aura.item, resultado);
    // Quem publicou a mensagem foi o Mestre; é ele quem pode reescrevê-la
    await chat.marcarCuraAplicada(pendente.mensagem);
  }
}

/** Devolve TODO o PV que esta mensagem de cura deu. */
async function desfazerTudo(message) {
  const dados = foundry.utils.deepClone(message.getFlag(MODULE_ID, chat.FLAG_CURA));
  if (!dados?.alvos?.length) return;

  let mudou = false;
  for (const alvo of dados.alvos) {
    if (alvo.desfeito || !alvo.ganho) continue;
    if (await desfazerCuraDe(alvo.uuid, alvo.ganho)) {
      alvo.desfeito = true;
      mudou = true;
    }
  }

  if (!mudou) return ui.notifications.warn(game.i18n.localize('T20HaydGMTools.AuraCuraSemPermissao'));
  await chat.reescreverCura(message, dados);
}

async function desfazerCura(message, indice) {
  const dados = foundry.utils.deepClone(message.getFlag(MODULE_ID, chat.FLAG_CURA));
  const alvo = dados?.alvos?.[indice];
  if (!alvo || alvo.desfeito) return;

  const ok = await desfazerCuraDe(alvo.uuid, alvo.ganho);
  if (!ok) return ui.notifications.warn(game.i18n.localize('T20HaydGMTools.AuraCuraSemPermissao'));

  alvo.desfeito = true;
  await chat.reescreverCura(message, dados);
}

/* ─── Reações a eventos ──────────────────────────────────────────────────── */

/** A flag da aura mudou: recalcula e atende o que o jogador pediu. */
async function aoMudarEstado(ator) {
  await atenderPedidos(ator);
  agendarRecalculo();
}

/** Início do turno da fonte: publica o lembrete de sustentar. */
async function aoAvancarTurno(combate) {
  if (!souGmAtivo()) return;

  const atual = combate?.combatant?.actor;
  if (!atual) return;

  const contexto = { combate: combate.id ?? null, rodada: Number(combate.round) || 0 };
  for (const aura of aurasDoAtor(atual)) {
    if (!precisaAvisar(aura.estado, contexto)) continue;
    await marcarAviso(atual, aura.item.id, contexto);
    await chat.pedirSustentacao(atual, aura.item, {
      custo: aura.def.aura.custo ?? 0,
      temCura: !!modificadorDeCura(atual),
      // Token não vinculado: sem o id, o botão acharia o ator do MUNDO e
      // descontaria o PM da ficha errada.
      token: aura.estado.token ?? null
    });
  }
  agendarRecalculo();
}

/** Trocar de cena encerra auras que ficaram para trás. */
async function aoTrocarCena(cenaId) {
  limparPrevia(); // a prévia pintada era da cena anterior
  if (!souGmAtivo()) return;
  for (const ator of indiceAura.listar()) {
    for (const aura of aurasDoAtor(ator)) {
      if (aura.estado.cena && aura.estado.cena !== cenaId) {
        await limparAura(ator.id, aura.item.id);
        await desativarAura(ator, aura.item.id);
      }
    }
  }
  agendarRecalculo();
}

/** O item da aura saiu da ficha. */
async function cancelarPorItem(ator, itemId) {
  if (!estadoDaAura(ator, itemId)) return;
  await limparAura(ator.id, itemId);
  await desativarAura(ator, itemId);
}

function ligarBotoes(message, container) {
  chat.ligarBotoes(message, container, {
    manter, cancelar, pedirCura, desfazerCura, desfazerTudo
  });
}

/* ─── Consultas para a barra do cartão ───────────────────────────────────── */

/** Resumo do estado de uma aura, para o cartão do chat. */
export function resumoDaAura(item) {
  const ator = item?.actor;
  const def = definicaoDe(item);
  if (!ator || !def?.aura) return null;

  const ativa = !!estadoDaAura(ator, item.id);
  return {
    ativa,
    raio: raioDaAura(ator, def),
    valor: def.aura.valor(ator),
    custo: def.aura.custo ?? 0
  };
}

export const aura = {
  indice: indiceAura,
  existeAlguma,
  agendarRecalculo,
  recalcular,
  ativar,
  cancelar,
  manter,
  aoMudarEstado,
  aoAvancarTurno,
  aoTrocarCena,
  cancelarPorItem,
  ligarBotoes,
  aoPassarMouse,
  resumoDaAura,
  FLAG_AURAS
};
