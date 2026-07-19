/**
 * T20 Hayd GMTools
 * Oculta modificadores de rolagens e detalhes de magias/habilidades para jogadores,
 * quando a rolagem vem de atores controlados pelo Mestre (npc, hazard, simple).
 */

const MODULE_ID = 't20-hayd-gmtools';

// Tipos de ator controlados pelo Mestre
const HIDDEN_ACTOR_TYPES = new Set(['npc', 'hazard', 'simple']);

// Flag salva na mensagem para revelar/ocultar manualmente
const FLAG_PLAYER_CAN_SEE = 'playerCanSee';

// ─── Utilitários ──────────────────────────────────────────────────────────────

/** True se o usuário atual é Jogador ou Jogador Confiável */
function isRestrictedUser() {
  const { PLAYER, TRUSTED } = CONST.USER_ROLES;
  return game.user.role === PLAYER || game.user.role === TRUSTED;
}

/**
 * Resolve o ator de uma mensagem, suportando atores globais e tokens sintéticos.
 */
function resolveMessageActor(message) {
  const { actor: actorId, token: tokenId, scene: sceneId } = message.speaker ?? {};

  if (actorId) {
    const actor = game.actors.get(actorId);
    if (actor) return actor;
  }

  if (tokenId && sceneId) {
    const token = game.scenes.get(sceneId)?.tokens.get(tokenId);
    if (token?.actor) return token.actor;
  }

  return null;
}

/** True se a mensagem veio de um ator do tipo Mestre */
function isGMActorMessage(message) {
  const actor = resolveMessageActor(message);
  return actor ? HIDDEN_ACTOR_TYPES.has(actor.type) : false;
}

/**
 * True se o usuário atual é dono ou observador do ator da mensagem.
 * Nesses casos a fórmula NÃO deve ser ocultada.
 */
function userHasActorAccess(message) {
  const actor = resolveMessageActor(message);
  if (!actor) return false;
  const level = actor.getUserLevel(game.user);
  return level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
}

/** True se a fórmula deve ser ocultada do usuário atual para esta mensagem */
function shouldHideFormula(message) {
  if (!isGMActorMessage(message)) return false;
  if (message.getFlag(MODULE_ID, FLAG_PLAYER_CAN_SEE) === true) return false;
  if (userHasActorAccess(message)) return false;
  return true;
}

/**
 * Resolve o item de um chat-card.
 * Suporta atores globais e tokens sintéticos.
 */
function resolveCardItem(chatCard, message) {
  const { actorId, itemId } = chatCard.dataset;
  if (!actorId || !itemId) return null;

  let actor = game.actors.get(actorId);

  if (!actor) {
    const { token: tokenId, scene: sceneId } = message.speaker ?? {};
    if (tokenId && sceneId) {
      actor = game.scenes.get(sceneId)?.tokens.get(tokenId)?.actor;
    }
  }

  return actor?.items.get(itemId) ?? null;
}

// ─── Manipulação de DOM ───────────────────────────────────────────────────────

/**
 * Percorre todos os .dice-roll e oculta as fórmulas.
 *
 * Regra de detecção de ataque vs dano:
 * - Dentro de .roll.ataque → ataque → mantém "Xd20+?"
 * - Dentro de .roll.dano  → dano   → exibe "?"
 * - Sem wrapper           → verifica se começa com 1d20 ou 2d20 (único caso de ataque
 *                           fora de wrapper); qualquer outro dado (ex: 6d20) → "?"
 */
function hideRollDetails(container) {
  container.querySelectorAll('.dice-roll').forEach(diceRoll => {
    const formulaEl = diceRoll.querySelector('.dice-formula');
    if (!formulaEl) return;

    const rollWrapper = diceRoll.closest('.roll');
    const isAttack = rollWrapper?.classList.contains('ataque') ?? false;
    const isDamage = rollWrapper?.classList.contains('dano') ?? false;
    const formula  = formulaEl.textContent.trim();

    // Somente 1d20 ou 2d20 (vantagem/desvantagem) são ataques
    // 3d20+, 6d20+, etc. são dados de dano e NÃO são ataques
    const isD20Attack = /^[12]d20(?:(?:kh|kl|dh|dl)\d*)?/i.test(formula);

    if (isAttack || (!isDamage && isD20Attack)) {
      const d20Match = formula.match(/(\d*d20(?:(?:kh|kl|dh|dl)\d*)?)/i);
      formulaEl.textContent = `${d20Match?.[1] ?? '1d20'}+?`;
    } else {
      formulaEl.textContent = '?';
    }

    // Remove atributos de tooltip para não vazar via hover
    formulaEl.removeAttribute('data-tooltip-html');
    formulaEl.removeAttribute('data-tooltip');
    formulaEl.removeAttribute('title');

    // Remove o breakdown de dados do DOM
    diceRoll.querySelector('.dice-tooltip')?.remove();

    // Desabilita o expand-on-click
    diceRoll.removeAttribute('data-action');
    diceRoll.style.cursor = 'default';
  });
}

/**
 * Para magias e poderes:
 * - Oculta a descrição (.card-content) e upgrades (.card-upgrades)
 * - Mascara o número da CD na linha de informações
 * - Bloqueia o clique em .item-name que o sistema usa para re-exibir a descrição
 */
function hideCardSecrets(container, message) {
  const chatCard = container.querySelector('.tormenta20.chat-card.item-card');
  if (!chatCard) return;

  const item = resolveCardItem(chatCard, message);
  if (!item) return;

  if (item.type !== 'magia' && item.type !== 'poder') return;

  // Oculta descrição e upgrades
  chatCard.querySelectorAll('.card-content, .card-upgrades').forEach(el => {
    el.style.display = 'none';
  });

  // Mascara CD (ex.: "CD 15" → "CD ?")
  chatCard.querySelectorAll('.card-item-header p').forEach(el => {
    el.innerHTML = el.innerHTML.replace(/\bCD\s+\d+/gi, 'CD ?');
  });

  // Bloqueia o clique em .item-name que dispara _onChatCardToggleContent no sistema,
  // que faz content.style.display = "block" revelando a descrição.
  // Usa capture:true para interceptar antes do listener do sistema.
  chatCard.querySelectorAll('.item-name').forEach(el => {
    el.style.cursor = 'default';
    el.addEventListener('click', e => {
      e.preventDefault();
      e.stopImmediatePropagation();
    }, { capture: true });
  });
}

// ─── Opções do menu de contexto ───────────────────────────────────────────────

/**
 * Adiciona as opções do módulo ao array de opções do context menu.
 * Usa li.dataset.messageId (DOM nativo — mesmo padrão do sistema T20).
 */
function addContextMenuOptions(options) {
  // Evita duplicar se chamado mais de uma vez
  if (options.some(o => o.name === 'T20HaydGMTools.ShowFormula')) return;

  options.push(
    {
      name: 'T20HaydGMTools.ShowFormula',
      icon: '<i class="fas fa-eye"></i>',
      condition: li => {
        const id = li.dataset?.messageId;
        if (!id) return false;
        const msg = game.messages.get(id);
        return msg && isGMActorMessage(msg) && msg.getFlag(MODULE_ID, FLAG_PLAYER_CAN_SEE) !== true;
      },
      callback: async li => {
        const msg = game.messages.get(li.dataset?.messageId);
        if (msg) await msg.setFlag(MODULE_ID, FLAG_PLAYER_CAN_SEE, true);
      }
    },
    {
      name: 'T20HaydGMTools.HideFormula',
      icon: '<i class="fas fa-eye-slash"></i>',
      condition: li => {
        const id = li.dataset?.messageId;
        if (!id) return false;
        const msg = game.messages.get(id);
        return msg && isGMActorMessage(msg) && msg.getFlag(MODULE_ID, FLAG_PLAYER_CAN_SEE) === true;
      },
      callback: async li => {
        const msg = game.messages.get(li.dataset?.messageId);
        if (msg) await msg.unsetFlag(MODULE_ID, FLAG_PLAYER_CAN_SEE);
      }
    }
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

Hooks.once('init', () => {
  console.log('T20 Hayd GMTools | Inicializado');
});

/**
 * Impede que o sistema aplique estilização de crítico/fumble para jogadores restritos.
 *
 * O método _highlightCriticalSuccessFailure() é chamado em renderHTML() da
 * ChatMessageTormenta20 APÓS o hook renderChatMessageHTML — ou seja, remover as
 * classes no hook não adianta pois o sistema as readiciona em seguida.
 * A solução é fazer monkey-patch no método para que seja no-op quando o
 * usuário não deve ver a fórmula.
 */
Hooks.once('setup', () => {
  const ChatMsgClass = CONFIG.ChatMessage?.documentClass;
  if (typeof ChatMsgClass?.prototype?._highlightCriticalSuccessFailure !== 'function') {
    console.warn('T20 Hayd GMTools | _highlightCriticalSuccessFailure não encontrado — crítico ainda visível');
    return;
  }

  const original = ChatMsgClass.prototype._highlightCriticalSuccessFailure;
  ChatMsgClass.prototype._highlightCriticalSuccessFailure = function (html) {
    if (isRestrictedUser() && shouldHideFormula(this)) return;
    return original.call(this, html);
  };

  console.log('T20 Hayd GMTools | Highlight de crítico/fumble interceptado');
});

/**
 * Após renderização da mensagem, aplica ocultações para jogadores restritos.
 */
Hooks.on('renderChatMessageHTML', (message, html) => {
  if (!isRestrictedUser()) return;
  if (!shouldHideFormula(message)) return;

  const container = html?.querySelector ? html : (html?.[0] ?? null);
  if (!container) return;

  hideRollDetails(container);
  hideCardSecrets(container, message);
});

/**
 * Injeta as opções do módulo no menu de contexto do chat.
 *
 * O Foundry v13 usa _getEntryContextOptions() em vez do hook getChatLogEntryContext.
 * Por isso fazemos monkey-patch no protótipo do ChatLog após o ready.
 * O método é chamado a cada abertura do menu, então o patch é efetivo mesmo feito aqui.
 */
Hooks.once('ready', () => {
  if (!game.user.isGM) return;

  const chatLog = ui.chat;
  if (!chatLog) return;

  const proto = Object.getPrototypeOf(chatLog);
  const original = proto._getEntryContextOptions;
  if (typeof original !== 'function') {
    console.warn('T20 Hayd GMTools | _getEntryContextOptions não encontrado no ChatLog');
    return;
  }

  proto._getEntryContextOptions = function () {
    const options = original.call(this);
    addContextMenuOptions(options);
    return options;
  };

  console.log('T20 Hayd GMTools | Context menu do chat estendido');
});

// ─── Integração Dice So Nice ──────────────────────────────────────────────────

/**
 * Integração com o módulo Dice So Nice.
 *
 * Arquitetura: o DSN dispara createChatMessage em TODOS os clientes com sync=false,
 * ou seja, cada cliente chama showForRoll de forma independente para a mesma mensagem.
 *
 * Estratégia: no cliente do jogador, intercepta showForRoll() e retorna imediatamente
 * (Promise.resolve) quando a mensagem pertence a um ator do Mestre sem acesso do
 * jogador — a animação simplesmente não ocorre. O GM vê os dados normalmente.
 */
Hooks.once('diceSoNiceReady', () => {
  if (!game.dice3d) return;
  if (!isRestrictedUser()) return;

  const originalShowForRoll = game.dice3d.showForRoll.bind(game.dice3d);
  game.dice3d.showForRoll = function (roll, user, sync, recipients, blind, messageId, speaker, opts) {
    // Caminho principal: mensagem já está no cache quando createChatMessage dispara
    const msg = messageId ? game.messages.get(messageId) : null;
    if (msg && shouldHideFormula(msg)) return Promise.resolve(true);

    // Fallback para quando messageId não está disponível: resolve pelo speaker
    if (!msg && speaker) {
      const { actor: actorId, token: tokenId, scene: sceneId } = speaker;
      let actor = actorId ? game.actors.get(actorId) : null;
      if (!actor && tokenId && sceneId) {
        actor = game.scenes.get(sceneId)?.tokens.get(tokenId)?.actor;
      }
      if (actor && HIDDEN_ACTOR_TYPES.has(actor.type)) return Promise.resolve(true);
    }

    return originalShowForRoll(roll, user, sync, recipients, blind, messageId, speaker, opts);
  };

  console.log('T20 Hayd GMTools | Integração Dice So Nice inicializada');
});
