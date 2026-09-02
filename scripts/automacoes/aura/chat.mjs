/**
 * Auras — mensagens de chat e seus botões.
 *
 * O padrão é o mesmo do lembrete de fim de cena: o HTML traz um botão com
 * classe própria e o listener é ligado no `renderChatMessageHTML`, checando
 * permissão na hora do clique.
 */
import { MODULE_ID, podeControlar, souGmAtivo } from '../runtime.mjs';

/** Flag na MENSAGEM de cura: o que foi curado, para o botão de desfazer. */
export const FLAG_CURA = 'auraCura';
/** Flag na MENSAGEM de lembrete: a qual aura ela pertence. */
export const FLAG_LEMBRETE = 'auraLembrete';
/** Flag na MENSAGEM de sustentação: a cura daquela rodada já saiu. */
export const FLAG_CURA_FEITA = 'auraCuraFeita';

const L = (k, d) => (d ? game.i18n.format(`T20HaydGMTools.${k}`, d) : game.i18n.localize(`T20HaydGMTools.${k}`));

function paraQuem(fonte) {
  // Aura de criatura do Mestre não precisa aparecer para a mesa toda.
  const ehDoMestre = ['npc', 'hazard', 'simple'].includes(fonte?.type);
  return ehDoMestre ? game.users.filter((u) => u.isGM).map((u) => u.id) : [];
}

/** "Aura ativada — raio, bônus e quem está dentro." */
export async function anunciarAtivacao(fonte, item, { raio, valor, total }) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: fonte }),
    whisper: paraQuem(fonte),
    content: `<div class="t20g-aura-card">
      <p><b><i class="fa-solid fa-sun"></i> ${L('AuraAtivadaTitulo', { nome: item.name })}</b></p>
      <p>${L('AuraAtivadaTexto', { raio, valor, total })}</p>
    </div>`
  });
}

/** "Aura encerrada — o bônus saiu de todo mundo." */
export async function anunciarFim(fonte, item, total) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: fonte }),
    whisper: paraQuem(fonte),
    content: `<div class="t20g-aura-card">
      <p><b><i class="fa-solid fa-ban"></i> ${L('AuraEncerradaTitulo', { nome: item.name })}</b></p>
      <p>${L('AuraEncerradaTexto', { total })}</p>
    </div>`
  });
}

/**
 * Lembrete no início do turno: manter ou cancelar.
 *
 * O texto avisa que confirmar já desconta o PM, e que não clicar mantém a
 * aura — as duas decisões da mesa que o botão sozinho não comunicaria.
 */
export async function pedirSustentacao(fonte, item, { custo, temCura, token = null }) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: fonte }),
    whisper: paraQuem(fonte),
    flags: { [MODULE_ID]: { [FLAG_LEMBRETE]: { fonte: fonte.id, item: item.id } } },
    content: `<div class="t20g-aura-card">
      <p><b><i class="fa-solid fa-hourglass-half"></i> ${L('AuraLembreteTitulo', { nome: item.name })}</b></p>
      <p>${L('AuraLembreteTexto', { custo })}</p>
      <p class="notes">${L('AuraLembreteContinua')}</p>
      <div class="t20g-aura-acoes">
        <button type="button" class="t20g-aura-btn" data-aura-acao="manter"
          data-fonte="${fonte.id}" data-token="${token ?? ''}" data-item="${item.id}"
          data-cura="${temCura ? '1' : '0'}">
          <i class="fa-solid fa-check"></i> ${L('AuraManter', { custo })}
        </button>
        <button type="button" class="t20g-aura-btn" data-aura-acao="cancelar"
          data-fonte="${fonte.id}" data-token="${token ?? ''}" data-item="${item.id}">
          <i class="fa-solid fa-ban"></i> ${L('AuraCancelar')}
        </button>
      </div>
    </div>`
  });
}

/** Como o PM foi (ou não foi) descontado — o chat precisa ser explícito. */
function linhaDoCusto({ custo, gasto }) {
  if (!custo) return '';
  if (!gasto) return L('AuraManteveSemDesconto', { custo });
  if (gasto.faltou) return L('AuraManteveSemPM', { custo, faltou: gasto.faltou });
  return L('AuraManteveTexto', { custo, restam: gasto.restam });
}

/** "Fulano manteve a aura" — e, com Aura de Cura, o botão de curar. */
export async function anunciarSustentacao(fonte, item, { custo, cura, gasto = null }) {
  const botaoCura = cura > 0
    ? `<div class="t20g-aura-acoes">
        <button type="button" class="t20g-aura-btn" data-aura-acao="curar"
          data-fonte="${fonte.id}" data-token="${fonte.token?.id ?? ''}" data-item="${item.id}">
          <i class="fa-solid fa-hand-holding-medical"></i> ${L('AuraCuraBotao', { quanto: cura })}
        </button>
      </div>`
    : '';

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: fonte }),
    whisper: paraQuem(fonte),
    content: `<div class="t20g-aura-card">
      <p><b>${L('AuraManteveTitulo', { nome: item.name })}</b></p>
      <p class="notes">${linhaDoCusto({ custo, gasto })}</p>
      ${botaoCura}
    </div>`
  });
}

/**
 * Marca o botão de curar como já usado.
 *
 * Quem publica a mensagem é o Mestre, então é ele quem a reescreve — o jogador
 * não teria permissão. Idempotente: o pedido pode ser atendido mais de uma vez.
 */
export async function marcarCuraAplicada(mensagemId) {
  const message = mensagemId ? game.messages.get(mensagemId) : null;
  if (!message || message.getFlag(MODULE_ID, FLAG_CURA_FEITA)) return;

  const conteudo = message.content.replace(
    /(<button[^>]*data-aura-acao="curar"[^>]*)(>)[\s\S]*?(<\/button>)/,
    (_todo, abre, fecha, encerra) =>
      `${abre} data-aura-feita="1"${fecha}<i class="fa-solid fa-check"></i> ${L('AuraCuraJaAplicada')}${encerra}`
  );
  await message.update({
    content: conteudo,
    [`flags.${MODULE_ID}.${FLAG_CURA_FEITA}`]: true
  });
}

/** Linhas da mensagem de cura, com o botão de desfazer por ator. */
function linhasDeCura(alvos) {
  return alvos.map((a, i) => {
    if (!a.ganho) return `<li class="t20g-aura-cheio">${a.nome} — ${L('AuraCuraNada')}</li>`;
    const risco = a.desfeito ? ' style="text-decoration:line-through;opacity:0.6"' : '';
    const botao = a.desfeito
      ? ''
      : `<button type="button" class="t20g-aura-btn t20g-aura-desfazer" data-aura-acao="desfazer"
          data-indice="${i}" data-tooltip="${L('AuraCuraDesfazer')}">
          <i class="fa-solid fa-rotate-left"></i></button>`;
    return `<li${risco}>${a.nome} <b>+${a.ganho}</b> ${botao}</li>`;
  }).join('');
}

/**
 * Marcas do trecho reescrito a cada desfazer.
 *
 * Delimitar por comentário em vez de casar `<div>`: o corpo tem div aninhada,
 * e um regex de fechamento acabaria comendo a tag errada.
 */
const MARCA = { abre: '<!--t20g-cura-->', fecha: '<!--/t20g-cura-->' };

/**
 * Corpo da mensagem de cura: a lista e o botão de reverter tudo.
 *
 * O "reverter todas" some quando não sobrou nada para desfazer — botão que não
 * faz nada é pior que botão ausente.
 */
function corpoDaCura(alvos) {
  const sobrou = alvos.some((a) => a.ganho && !a.desfeito);
  const tudo = sobrou
    ? `<div class="t20g-aura-acoes">
        <button type="button" class="t20g-aura-btn" data-aura-acao="desfazer-tudo">
          <i class="fa-solid fa-rotate-left"></i> ${L('AuraCuraDesfazerTudo')}
        </button>
      </div>`
    : '';
  return `${MARCA.abre}<ul class="t20g-aura-lista">${linhasDeCura(alvos)}</ul>${tudo}${MARCA.fecha}`;
}

/** Publica o resultado da cura, com os botões de desfazer. */
export async function anunciarCura(fonte, item, { quanto, alvos }) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: fonte }),
    whisper: paraQuem(fonte),
    flags: { [MODULE_ID]: { [FLAG_CURA]: { fonte: fonte.id, item: item.id, alvos } } },
    content: `<div class="t20g-aura-card">
      <p><b><i class="fa-solid fa-hand-holding-medical"></i> ${L('AuraCuraTitulo', { nome: item.name })}</b></p>
      <p>${L('AuraCuraTexto', { quanto })}</p>
      ${corpoDaCura(alvos)}
    </div>`
  });
}

/** Reescreve a mensagem de cura depois de um desfazer. */
export async function reescreverCura(message, dados) {
  const conteudo = message.content.replace(
    new RegExp(`${MARCA.abre}[\\s\\S]*?${MARCA.fecha}`),
    corpoDaCura(dados.alvos)
  );
  await message.update({
    content: conteudo,
    [`flags.${MODULE_ID}.${FLAG_CURA}`]: dados
  });
}

/** A cura desta sustentação já saiu? (flag na mensagem, ou marca no botão) */
function jaCurou(message, botao) {
  return botao.dataset.auraFeita === '1'
    || !!message?.getFlag?.(MODULE_ID, FLAG_CURA_FEITA);
}

/** Confirmação para curar de novo na mesma sustentação. */
function confirmarRepetir() {
  return foundry.applications.api.DialogV2.confirm({
    window: { title: L('AuraCuraRepetirTitulo') },
    content: `<p>${L('AuraCuraRepetirTexto')}</p>`,
    rejectClose: false,
    modal: true
  });
}

/**
 * Ator do botão, preferindo o token da cena.
 *
 * `game.actors.get()` devolve o ator do MUNDO: para token não vinculado esse
 * é o molde, não a ficha em jogo — descontar PM dele mexeria na ficha errada.
 */
function fonteDoBotao(botao) {
  const doToken = botao.dataset.token
    ? canvas?.tokens?.get(botao.dataset.token)?.actor
    : null;
  return doToken ?? game.actors.get(botao.dataset.fonte) ?? null;
}

/**
 * Liga os botões das mensagens de aura.
 *
 * Manter/cancelar/curar são do dono da ficha (ou do Mestre); desfazer cura é
 * só do Mestre, porque a decisão de quem não podia receber é dele.
 */
export function ligarBotoes(message, container, servicos) {
  const botoes = container?.querySelectorAll?.('.t20g-aura-btn') ?? [];
  if (!botoes.length) return;

  const curaDaMensagem = message.getFlag(MODULE_ID, FLAG_CURA);

  for (const botao of botoes) {
    const acao = botao.dataset.auraAcao;

    if (acao === 'desfazer' || acao === 'desfazer-tudo') {
      if (!game.user.isGM || !curaDaMensagem) { botao.disabled = true; continue; }
      botao.addEventListener('click', async (ev) => {
        ev.preventDefault();
        botao.disabled = true;
        try {
          if (acao === 'desfazer-tudo') await servicos.desfazerTudo(message);
          else await servicos.desfazerCura(message, Number(botao.dataset.indice));
        } catch (err) {
          console.error(`${MODULE_ID} | Falha ao desfazer cura`, err);
          botao.disabled = false;
        }
      });
      continue;
    }

    const fonte = fonteDoBotao(botao);
    if (!podeControlar(fonte)) { botao.disabled = true; continue; }

    botao.addEventListener('click', async (ev) => {
      ev.preventDefault();

      // Curar de novo é decisão consciente: o botão fica como "já aplicada" e
      // só repete depois de confirmar. Sem isto, dois cliques (ou o dono e o
      // Mestre clicando) dobrariam a cura sem ninguém perceber.
      if (acao === 'curar' && jaCurou(message, botao) && !await confirmarRepetir()) return;

      botao.disabled = true;
      try {
        if (acao === 'manter') await servicos.manter(fonte, botao.dataset.item);
        else if (acao === 'cancelar') await servicos.cancelar(fonte, botao.dataset.item);
        else if (acao === 'curar') await servicos.pedirCura(fonte, botao.dataset.item, message.id);
      } catch (err) {
        console.error(`${MODULE_ID} | Falha na ação da aura`, err);
        botao.disabled = false;
      }
    });
  }
}

/** Só o Mestre ativo publica: os hooks rodam em todos os clientes. */
export function souQuemPublica() {
  return souGmAtivo();
}
