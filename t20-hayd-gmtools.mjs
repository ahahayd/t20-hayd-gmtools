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

// ─── Rerolagem de resultados ──────────────────────────────────────────────────

/**
 * Classifica as rolagens de uma mensagem em ataque (baseada em d20) e dano
 * (qualquer outro dado). Retorna os índices na ordem de `message.rolls`, que é
 * a mesma ordem dos blocos `.dice-roll` no conteúdo renderizado.
 */
function classificarRolagens(message) {
  const rolls = message?.rolls ?? [];
  let ataque = -1, dano = -1;
  rolls.forEach((r, i) => {
    const ehAtaque = r?.options?.type === 'attack' || r?.dice?.[0]?.faces === 20;
    if (ehAtaque) { if (ataque === -1) ataque = i; }
    else if (dano === -1) dano = i;
  });
  return { total: rolls.length, ataque, dano };
}

/**
 * Injeta o indicador num bloco `.dice-roll`: um símbolo e os totais anteriores
 * riscados/apagados, logo ao lado do novo total. `anteriores` vem do mais
 * recente para o mais antigo; `icone`/`dica` definem o símbolo (rerolagem vs
 * inserção manual usam ícones diferentes).
 */
function injetarIndicador(diceRoll, anteriores, { icone, dica }) {
  const total = diceRoll?.querySelector('.dice-total');
  if (!total) return;
  total.classList.add('t20g-rerolled');
  total.querySelectorAll('.t20g-reroll-prev, .t20g-reroll-icon').forEach(e => e.remove());
  for (const t of anteriores) {
    const span = document.createElement('span');
    span.className = 't20g-reroll-prev';
    span.innerHTML = `<del>${t}</del>`;
    total.appendChild(span);
  }
  const icon = document.createElement('i');
  icon.className = `fas ${icone} t20g-reroll-icon`;
  icon.setAttribute('data-tooltip', dica);
  total.appendChild(icon);
}

/**
 * Aplica uma rolagem substituta `nova` no índice `index` da mensagem: acumula o
 * total anterior no histórico, (opcionalmente) anima os dados, substitui apenas
 * o bloco `.dice-roll` correspondente injetando o indicador, e persiste tudo no
 * conteúdo/flags da mensagem.
 */
async function aplicarNovasRolagens(message, substituicoes) {
  if (!substituicoes?.length) return;
  const rolls = [...message.rolls];
  const historico = foundry.utils.deepClone(message.getFlag(MODULE_ID, 'rerolls') ?? {});

  const wrapper = document.createElement('div');
  wrapper.innerHTML = message.content;
  const blocos = wrapper.querySelectorAll('.dice-roll');

  for (const sub of substituicoes) {
    const anteriores = [sub.totalAnterior, ...(historico[sub.index] ?? [])];
    historico[sub.index] = anteriores;
    rolls[sub.index] = sub.nova;

    if (sub.animar !== false && game.dice3d) {
      try {
        await game.dice3d.showForRoll(sub.nova, game.user, true, null, false, message.id, message.speaker);
      } catch (err) {
        console.warn('T20 Hayd GMTools | Dice So Nice falhou', err);
      }
    }

    if (blocos[sub.index]) {
      const temp = document.createElement('div');
      temp.innerHTML = await sub.nova.render();
      const novoBloco = temp.firstElementChild;
      injetarIndicador(novoBloco, anteriores, sub.indicador);
      blocos[sub.index].replaceWith(novoBloco);
    }
  }

  const update = {
    rolls: rolls.map(r => JSON.stringify(r)),
    content: wrapper.innerHTML,
    [`flags.${MODULE_ID}.rerolls`]: historico
  };
  // Card de perícia/atributo guarda o total da rolagem 0 num flag; mantém-no coerente.
  const rol0 = substituicoes.find(s => s.index === 0);
  if (rol0 && foundry.utils.getProperty(message, 'flags.tormenta20.rollTotal') !== undefined) {
    update['flags.tormenta20.rollTotal'] = rol0.nova.total;
  }
  await message.update(update);
}

// ─── Recálculo automático do dano por crítico ──────────────────────────────────

/** Resolve o item (arma) de um card de rolagem a partir do conteúdo da mensagem. */
function resolverItemDaMensagem(message) {
  const div = document.createElement('div');
  div.innerHTML = message.content;
  const card = div.querySelector('.chat-card[data-item-id]');
  const itemId = card?.dataset?.itemId;
  if (!itemId) return null;
  let actor = card.dataset.actorId ? game.actors.get(card.dataset.actorId) : null;
  if (!actor) {
    const { token, scene } = message.speaker ?? {};
    if (token && scene) actor = game.scenes.get(scene)?.tokens.get(token)?.actor;
  }
  return actor?.items.get(itemId) ?? null;
}

/**
 * Rola o dano do item com o estado de crítico forçado, usando o próprio
 * `rollDamage` do sistema (que aplica a multiplicação de dados do crítico, os
 * bônus e os termos de dano crítico corretamente). Retorna os rolls de dano.
 */
async function rolarDanoDoItem(item, critical) {
  const rolledAnterior = item.system.rolled;
  item.system.rolled = { Ataque: { _critical: critical } };
  try {
    await item.rollDamage({ critical });
    return Object.values(item.system.rolled)
      .filter(r => r && r.options?.type === 'damage')
      .map(r => foundry.dice.Roll.fromData(r.toJSON()));
  } catch (err) {
    console.warn('T20 Hayd GMTools | Falha ao recalcular dano do crítico', err);
    return [];
  } finally {
    item.system.rolled = rolledAnterior;
  }
}

/**
 * Se a rolagem modificada foi o ATAQUE de uma arma e o estado de crítico mudou
 * (virou crítico ou deixou de ser), rola o dano de novo com o novo estado e
 * devolve as substituições correspondentes (com o valor de dano antigo riscado).
 */
async function substituicoesDeDanoPorCritico(message, index, novaAtaque, ataqueOriginal) {
  const cls = classificarRolagens(message);
  if (index !== cls.ataque || cls.dano === -1) return [];

  const item = resolverItemDaMensagem(message);
  if (item?.type !== 'arma') return [];

  const criticoM = Number(item.system.criticoM) || 20;
  const antesCrit = (ataqueOriginal.terms?.[0]?.total ?? 0) >= criticoM;
  const agoraCrit = (novaAtaque.terms?.[0]?.total ?? 0) >= criticoM;
  if (antesCrit === agoraCrit) return [];

  const danoRolls = await rolarDanoDoItem(item, agoraCrit);
  if (!danoRolls.length) return [];

  const indicesDano = [];
  message.rolls.forEach((r, i) => {
    const ehAtaque = r?.options?.type === 'attack' || r?.dice?.[0]?.faces === 20;
    if (!ehAtaque) indicesDano.push(i);
  });

  const dica = agoraCrit
    ? game.i18n.localize('T20HaydGMTools.TipCritDamage')
    : game.i18n.localize('T20HaydGMTools.TipNormalDamage');
  return indicesDano.map((idx, k) => {
    const novoDano = danoRolls[k] ?? danoRolls[0];
    return novoDano ? {
      index: idx,
      nova: novoDano,
      totalAnterior: message.rolls[idx].total,
      indicador: { icone: agoraCrit ? 'fa-burst' : 'fa-rotate', dica },
      animar: true
    } : null;
  }).filter(Boolean);
}

/**
 * Rerola a rolagem de índice `index`: mesma fórmula e bônus, dados novos, sem
 * gastar mana novamente. Símbolo de rerolagem (⟳).
 */
async function rerolarResultado(message, index) {
  const original = message?.rolls?.[index];
  if (!original || typeof original.reroll !== 'function') return;
  const totalAnterior = original.total;
  const nova = await original.reroll();
  const subs = [{
    index, nova, totalAnterior, animar: true,
    indicador: { icone: 'fa-rotate', dica: game.i18n.localize('T20HaydGMTools.TipRerolled') }
  }];
  // Se o ataque virou/deixou de ser crítico, recalcula o dano automaticamente.
  subs.push(...await substituicoesDeDanoPorCritico(message, index, nova, original));
  await aplicarNovasRolagens(message, subs);
}

/**
 * Define manualmente o resultado natural de cada dado da rolagem `index`
 * (dentro da faixa 1..faces), mantendo bônus e modificadores. Recalcula o total
 * e marca com um símbolo próprio (mão apontando) — para poderes que escolhem a
 * rolagem por uma condição especial.
 */
async function inserirResultadoManual(message, index) {
  const original = message?.rolls?.[index];
  if (!original) return;

  // Um campo por dado individual, com a faixa válida e o valor atual.
  const dados = [];
  (original.dice ?? []).forEach((die, di) => {
    (die.results ?? []).forEach((res, ri) => {
      dados.push({ di, ri, faces: die.faces, atual: res.result });
    });
  });
  if (!dados.length) return ui.notifications?.warn(game.i18n.localize('T20HaydGMTools.InsertNoDice'));

  const campos = dados.map((d, i) =>
    `<div class="t20g-inserir-campo">
       <label>d${d.faces}${dados.length > 1 ? ` #${i + 1}` : ''}</label>
       <input type="number" data-i="${i}" value="${d.atual}" min="1" max="${d.faces}" step="1">
     </div>`).join('');

  const valores = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize('T20HaydGMTools.InsertTitle'), icon: 'fa-hand-pointer' },
    content: `<p class="notes">${game.i18n.localize('T20HaydGMTools.InsertHelp')}</p>
      <div class="t20g-inserir">${campos}</div>`,
    ok: {
      label: game.i18n.localize('T20HaydGMTools.InsertApply'),
      icon: 'fa-check',
      callback: (ev, btn) => {
        const out = {};
        btn.form.querySelectorAll('input[data-i]').forEach(inp => { out[inp.dataset.i] = Number(inp.value); });
        return out;
      }
    }
  }).catch(() => null);
  if (!valores) return;

  const totalAnterior = original.total;
  // Trabalha numa cópia avaliada (preserva a classe RollT20 e os resultados).
  const nova = foundry.dice.Roll.fromData(original.toJSON());
  dados.forEach((d, i) => {
    const res = nova.dice?.[d.di]?.results?.[d.ri];
    const alvo = Number(valores[i]);
    if (res && Number.isFinite(alvo)) res.result = Math.clamp(Math.round(alvo), 1, d.faces);
  });
  nova._total = nova._evaluateTotal();

  const subs = [{
    index, nova, totalAnterior, animar: false,
    indicador: { icone: 'fa-hand-pointer', dica: game.i18n.localize('T20HaydGMTools.TipManual') }
  }];
  // Se o ataque virou/deixou de ser crítico, recalcula o dano automaticamente.
  subs.push(...await substituicoesDeDanoPorCritico(message, index, nova, original));
  await aplicarNovasRolagens(message, subs);
}

// ─── Permissões ────────────────────────────────────────────────────────────────

/** O usuário pode modificar (rerolar/inserir) esta mensagem de rolagem? */
function podeModificarRolagem(message) {
  // Precisa poder atualizar a mensagem: GM (qualquer) ou autor (a própria).
  return !!message && (game.user.isGM || message.isAuthor);
}
function podeRerolar(message) {
  if (!podeModificarRolagem(message)) return false;
  return game.user.isGM || game.settings.get(MODULE_ID, 'jogadoresReroll');
}
function podeInserir(message) {
  if (!podeModificarRolagem(message)) return false;
  return game.user.isGM || game.settings.get(MODULE_ID, 'jogadoresManual');
}

// ─── Opções do menu de contexto ───────────────────────────────────────────────

/**
 * Adiciona as opções do módulo ao array de opções do context menu.
 * Usa li.dataset.messageId (DOM nativo — mesmo padrão do sistema T20).
 */
function addContextMenuOptions(options) {
  // Evita duplicar se chamado mais de uma vez
  if (options.some(o => o.name === 'T20HaydGMTools.ShowFormula')) return;

  const msgDo = li => game.messages.get(li.dataset?.messageId);

  options.push(
    // Mostrar/esconder fórmula — apenas Mestre, em rolagens de criaturas do GM.
    {
      name: 'T20HaydGMTools.ShowFormula',
      icon: '<i class="fas fa-eye"></i>',
      condition: li => {
        if (!game.user.isGM) return false;
        const msg = msgDo(li);
        return msg && isGMActorMessage(msg) && msg.getFlag(MODULE_ID, FLAG_PLAYER_CAN_SEE) !== true;
      },
      callback: async li => {
        const msg = msgDo(li);
        if (msg) await msg.setFlag(MODULE_ID, FLAG_PLAYER_CAN_SEE, true);
      }
    },
    {
      name: 'T20HaydGMTools.HideFormula',
      icon: '<i class="fas fa-eye-slash"></i>',
      condition: li => {
        if (!game.user.isGM) return false;
        const msg = msgDo(li);
        return msg && isGMActorMessage(msg) && msg.getFlag(MODULE_ID, FLAG_PLAYER_CAN_SEE) === true;
      },
      callback: async li => {
        const msg = msgDo(li);
        if (msg) await msg.unsetFlag(MODULE_ID, FLAG_PLAYER_CAN_SEE);
      }
    },
    // Rerolar resultado — mensagens com uma única rolagem (perícia, atributo…).
    {
      name: 'T20HaydGMTools.RerollResult',
      icon: '<i class="fas fa-rotate"></i>',
      condition: li => {
        const msg = msgDo(li);
        return podeRerolar(msg) && classificarRolagens(msg).total === 1;
      },
      callback: li => {
        const msg = msgDo(li);
        if (msg) rerolarResultado(msg, 0);
      }
    },
    // Rerolar ataque — cards com ataque + dano (armas): rerola só o ataque.
    {
      name: 'T20HaydGMTools.RerollAttack',
      icon: '<i class="fas fa-rotate"></i>',
      condition: li => {
        const msg = msgDo(li);
        if (!podeRerolar(msg)) return false;
        const { total, ataque } = classificarRolagens(msg);
        return total > 1 && ataque !== -1;
      },
      callback: li => {
        const msg = msgDo(li);
        if (!msg) return;
        const { ataque } = classificarRolagens(msg);
        if (ataque !== -1) rerolarResultado(msg, ataque);
      }
    },
    // Rerolar dano — cards com ataque + dano (armas): rerola só o dano.
    {
      name: 'T20HaydGMTools.RerollDamage',
      icon: '<i class="fas fa-rotate"></i>',
      condition: li => {
        const msg = msgDo(li);
        if (!podeRerolar(msg)) return false;
        const { total, dano } = classificarRolagens(msg);
        return total > 1 && dano !== -1;
      },
      callback: li => {
        const msg = msgDo(li);
        if (!msg) return;
        const { dano } = classificarRolagens(msg);
        if (dano !== -1) rerolarResultado(msg, dano);
      }
    },
    // Inserir resultado — define manualmente o dado (poderes que escolhem a rolagem).
    {
      name: 'T20HaydGMTools.InsertResult',
      icon: '<i class="fas fa-hand-pointer"></i>',
      condition: li => {
        const msg = msgDo(li);
        return podeInserir(msg) && classificarRolagens(msg).total === 1;
      },
      callback: li => {
        const msg = msgDo(li);
        if (msg) inserirResultadoManual(msg, 0);
      }
    },
    // Inserir resultado do ataque (armas).
    {
      name: 'T20HaydGMTools.InsertAttack',
      icon: '<i class="fas fa-hand-pointer"></i>',
      condition: li => {
        const msg = msgDo(li);
        if (!podeInserir(msg)) return false;
        const { total, ataque } = classificarRolagens(msg);
        return total > 1 && ataque !== -1;
      },
      callback: li => {
        const msg = msgDo(li);
        if (!msg) return;
        const { ataque } = classificarRolagens(msg);
        if (ataque !== -1) inserirResultadoManual(msg, ataque);
      }
    },
    // Inserir resultado do dano (armas).
    {
      name: 'T20HaydGMTools.InsertDamage',
      icon: '<i class="fas fa-hand-pointer"></i>',
      condition: li => {
        const msg = msgDo(li);
        if (!podeInserir(msg)) return false;
        const { total, dano } = classificarRolagens(msg);
        return total > 1 && dano !== -1;
      },
      callback: li => {
        const msg = msgDo(li);
        if (!msg) return;
        const { dano } = classificarRolagens(msg);
        if (dano !== -1) inserirResultadoManual(msg, dano);
      }
    }
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, 'jogadoresReroll', {
    name: 'T20HaydGMTools.SettingRerollName',
    hint: 'T20HaydGMTools.SettingRerollHint',
    scope: 'world', config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, 'jogadoresManual', {
    name: 'T20HaydGMTools.SettingManualName',
    hint: 'T20HaydGMTools.SettingManualHint',
    scope: 'world', config: true, type: Boolean, default: true
  });
  // Controle interno: aviso de boas-vindas já foi enviado?
  game.settings.register(MODULE_ID, 'welcomeShown', {
    scope: 'world', config: false, type: Boolean, default: false
  });
  console.log('T20 Hayd GMTools | Inicializado');
});

/**
 * No primeiro uso, avisa o Mestre (por sussurro) sobre as ações do menu de
 * contexto das mensagens de rolagem. Enviado uma única vez pelo GM principal.
 */
Hooks.once('ready', async () => {
  if (!game.user.isGM || game.user !== game.users.activeGM) return;
  if (game.settings.get(MODULE_ID, 'welcomeShown')) return;

  const content = `
    <div class="t20g-welcome">
      <p><strong><i class="fas fa-rotate"></i> ${game.i18n.localize('T20HaydGMTools.WelcomeTitle')}</strong></p>
      <p>${game.i18n.localize('T20HaydGMTools.WelcomeBody')}</p>
    </div>`;

  await ChatMessage.create({
    content,
    whisper: game.users.filter(u => u.isGM).map(u => u.id),
    speaker: { alias: 'T20 Hayd GMTools' }
  });

  await game.settings.set(MODULE_ID, 'welcomeShown', true);
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
 * Injeta as opções do módulo no menu de contexto das mensagens do chat.
 *
 * O Foundry v13 monta o menu no PRIMEIRO render do ChatLog (`_onFirstRender`,
 * que ocorre ANTES do hook "ready") e dispara o hook oficial
 * `getChatMessageContextOptions` com `(chatLog, opcoes)`, onde `opcoes` é o
 * array mutável de entradas. Registramos o listener no carregamento do módulo
 * para que ele já exista quando o menu é construído — um monkey-patch feito em
 * "ready" chegaria tarde demais (a lista já teria sido capturada).
 */
Hooks.on('getChatMessageContextOptions', (...args) => {
  if (!game.user.isGM) return;
  const options = args.find(a => Array.isArray(a));
  if (options) addContextMenuOptions(options);
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
