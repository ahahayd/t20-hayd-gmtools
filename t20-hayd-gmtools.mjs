/**
 * T20 Hayd GMTools
 * Oculta modificadores de rolagens e detalhes de magias/habilidades para jogadores,
 * quando a rolagem vem de atores controlados pelo Mestre (npc, hazard, simple).
 */

// Automações de itens (registra os próprios hooks). Importado daqui, e não
// listado em esmodules, para que novas versões carreguem sem reiniciar o servidor.
import './t20-hayd-automacoes.mjs';
// Régua opcional para efeitos (ignora diagonais). Mesmo motivo do import acima.
import './t20-hayd-regua.mjs';
// Gerador de Tesouros (Tabela 8-1 e associadas). Mesmo motivo do import acima.
import './t20-hayd-tesouros.mjs';
// Ficha do Grupo, estoque compartilhado e transferências (ex-t20-hayd-management).
// Mesmo motivo do import acima.
import './t20-hayd-management.mjs';

const MODULE_ID = 't20-hayd-gmtools';

// Tipos de ator controlados pelo Mestre
const HIDDEN_ACTOR_TYPES = new Set(['npc', 'hazard', 'simple']);

// Flag salva na mensagem para revelar/ocultar manualmente
const FLAG_PLAYER_CAN_SEE = 'playerCanSee';

// Flag na mensagem: o Mestre revelou a identidade da magia/poder deste card
const FLAG_ITEM_REVELADO = 'itemRevelado';

// Flag no ActiveEffect: 'sim' | 'nao' | '' (herda o padrão da criatura)
const FLAG_EFEITO_IDENTIFICADO = 'identificado';

// Flag no Ator: true/false força o padrão da criatura; ausente herda o metagame
const FLAG_ATOR_OCULTAR = 'ocultarSegredos';

// Ícone "?" exibido no lugar do ícone real de magias, poderes e efeitos ocultos
const ICONE_DESCONHECIDO = `modules/${MODULE_ID}/assets/desconhecido.svg`;

// ─── Nível de metagame ────────────────────────────────────────────────────────

/**
 * Cada chave é uma informação que o módulo pode esconder dos jogadores.
 * `ativo` é a chave-mestra: desligada, nada é escondido.
 */
const METAGAME_CHAVES = ['ataque', 'dano', 'cd', 'descricao', 'nomeMagia', 'efeitos', 'critico', 'dados3d'];

/** Chaves introduzidas depois do 1.6.0 — entram desligadas em mundos antigos. */
const METAGAME_CHAVES_NOVAS = ['nomeMagia', 'efeitos'];

/** Padrão: comportamento das versões anteriores (esconde tudo). */
const METAGAME_PADRAO = Object.fromEntries([['ativo', true], ...METAGAME_CHAVES.map(k => [k, true])]);

/** Todas as informações visíveis (nenhuma chave ligada). */
const METAGAME_NADA = Object.fromEntries(METAGAME_CHAVES.map(k => [k, false]));

/** Atalhos do editor: níveis prontos de metagame. */
const METAGAME_PRESETS = {
  tudo:     { ativo: true,  ...Object.fromEntries(METAGAME_CHAVES.map(k => [k, true])) },
  rolagens: { ativo: true,  ...METAGAME_NADA, ataque: true, dano: true, critico: true, dados3d: true },
  nada:     { ativo: false, ...METAGAME_NADA }
};

/** Configuração crua salva no mundo, completada com o padrão. */
function configMetagame() {
  let cfg = null;
  try { cfg = game.settings.get(MODULE_ID, 'metagame'); } catch { /* antes do init */ }
  return { ...METAGAME_PADRAO, ...(cfg ?? {}) };
}

/**
 * Opções EFETIVAS de ocultação. Com a chave-mestra desligada devolve tudo
 * visível, então quem consome não precisa checar `ativo` separadamente.
 *
 * Memorizado: `prepareDerivedData` dos efeitos consulta isto a cada preparação
 * de ator. O cache só começa depois que a configuração existe de fato, para
 * não congelar o padrão usado antes do `init`, e é limpo no `onChange`.
 */
let metagameCache = null;
function invalidarMetagame() { metagameCache = null; }

function opcoesMetagame() {
  if (metagameCache) return metagameCache;
  const cfg = configMetagame();
  const efetivo = cfg.ativo ? cfg : { ativo: false, ...METAGAME_NADA };
  if (game.settings?.settings?.has(`${MODULE_ID}.metagame`)) metagameCache = efetivo;
  return efetivo;
}

/** True se ao menos uma informação está sendo escondida dos jogadores. */
function metagameOcultaAlgo() {
  const o = opcoesMetagame();
  return METAGAME_CHAVES.some(k => o[k]);
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

/** True se o usuário atual é Jogador ou Jogador Confiável */
function isRestrictedUser() {
  // Pode ser chamada durante a preparação de dados, antes de haver usuário.
  const role = game.user?.role;
  if (role === undefined) return false;
  const { PLAYER, TRUSTED } = CONST.USER_ROLES;
  return role === PLAYER || role === TRUSTED;
}

/**
 * Resolve o ator de uma mensagem, suportando atores globais e tokens sintéticos.
 *
 * O TOKEN vem primeiro de propósito. Num token não vinculado, o ator sintético
 * é quem carrega o ActorDelta — os itens e flags próprios daquele token — e ele
 * compartilha o `id` com o ator do mundo (`speaker.actor` guarda esse id). Ou
 * seja: procurar por id devolveria o ator do mundo, sem os itens e sem as
 * marcações feitas no token, que é onde o Mestre de fato mexe.
 */
function resolveMessageActor(message) {
  const { actor: actorId, token: tokenId, scene: sceneId } = message.speaker ?? {};

  if (tokenId && sceneId) {
    const token = game.scenes.get(sceneId)?.tokens.get(tokenId);
    if (token?.actor) return token.actor;
  }

  if (actorId) {
    const actor = game.actors.get(actorId);
    if (actor) return actor;
  }

  return null;
}

/**
 * True se `actor` é uma criatura do Mestre cujos segredos o usuário atual não
 * pode ver. Dono/observador enxerga tudo, como no resto do módulo.
 */
function atorComSegredos(actor) {
  if (!actor || !HIDDEN_ACTOR_TYPES.has(actor.type)) return false;
  if (!game.user) return false;
  return actor.getUserLevel(game.user) < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
}

/**
 * Padrão da criatura. O Mestre pode marcar no HUD do token que aquela criatura
 * sempre (ou nunca) esconde magias e efeitos; sem marcação vale `padrao`, que
 * vem do nível de metagame.
 */
function criaturaOculta(actor, padrao) {
  const flag = actor?.getFlag?.(MODULE_ID, FLAG_ATOR_OCULTAR);
  return typeof flag === 'boolean' ? flag : padrao;
}

/**
 * True se este efeito ativo deve aparecer como "?" para o usuário atual.
 *
 * Hierarquia: chave-mestra do metagame (portão duro) → marcação do próprio
 * efeito → condições do sistema → padrão da criatura, que por sua vez cai na
 * chave "Efeitos ativos nas criaturas".
 */
function efeitoNaoIdentificado(effect) {
  if (!isRestrictedUser()) return false;
  if (!opcoesMetagame().ativo) return false;

  const actor = effect?.parent;
  if (actor?.documentName !== 'Actor' || !atorComSegredos(actor)) return false;

  const explicito = effect.getFlag(MODULE_ID, FLAG_EFEITO_IDENTIFICADO);
  if (explicito === 'sim') return false;
  if (explicito === 'nao') return true;

  // Condições (caído, cego, abalado…) são informação pública — o personagem vê
  // o inimigo no chão. Só buffs próprios de magias e poderes viram "?" por
  // padrão; o Mestre ainda pode forçar pelo campo da ficha do efeito.
  if (effect.statuses?.size) return false;

  return criaturaOculta(actor, opcoesMetagame().efeitos);
}

/**
 * True se a identidade da magia/poder desta mensagem é mascarável — ou seja, se
 * faz sentido oferecer "Revelar"/"Ocultar" ao Mestre, independentemente de já
 * estar revelada.
 */
function identidadePodeSerOculta(message, opts) {
  if (!opts.ativo) return false;
  return criaturaOculta(resolveMessageActor(message), opts.nomeMagia);
}

/** True se o nome e o ícone da magia ou poder devem ser mascarados agora. */
function identidadeOculta(message, opts) {
  if (message.getFlag(MODULE_ID, FLAG_ITEM_REVELADO) === true) return false;
  return identidadePodeSerOculta(message, opts);
}

/** Rótulo de substituição conforme o tipo do item. */
function rotuloNaoIdentificado(tipo) {
  return game.i18n.localize(tipo === 'poder'
    ? 'T20HaydGMTools.MetaPoderDesconhecido'
    : 'T20HaydGMTools.MetaMagiaDesconhecida');
}

/** True se a mensagem veio de um ator do tipo Mestre */
function isGMActorMessage(message) {
  const actor = resolveMessageActor(message);
  return actor ? HIDDEN_ACTOR_TYPES.has(actor.type) : false;
}

/** True se a fórmula deve ser ocultada do usuário atual para esta mensagem.
 * Resolve o ator UMA vez (antes: até duas resoluções por chamada, e a
 * função roda duas vezes por mensagem — hook + patch de highlight). */
function shouldHideFormula(message) {
  if (!metagameOcultaAlgo()) return false;
  const actor = resolveMessageActor(message);
  if (!actor || !HIDDEN_ACTOR_TYPES.has(actor.type)) return false;
  if (message.getFlag(MODULE_ID, FLAG_PLAYER_CAN_SEE) === true) return false;
  // Dono/observador do ator vê a fórmula normalmente
  if (actor.getUserLevel(game.user) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) return false;
  return true;
}

/**
 * Resolve o item de um chat-card.
 *
 * Testa cada candidato até achar um que REALMENTE tenha o item, em vez de
 * parar no primeiro ator encontrado: uma magia largada direto no token existe
 * só no ActorDelta, e o ator do mundo — que tem o mesmo id — não a conhece.
 */
function resolveCardItem(chatCard, message) {
  const { actorId, itemId } = chatCard.dataset;
  if (!itemId) return null;

  const { token: tokenId, scene: sceneId } = message.speaker ?? {};
  const candidatos = [
    tokenId && sceneId ? game.scenes.get(sceneId)?.tokens.get(tokenId)?.actor : null,
    actorId ? game.actors.get(actorId) : null,
    resolveMessageActor(message)
  ];

  for (const actor of candidatos) {
    const item = actor?.items?.get(itemId);
    if (item) return item;
  }
  return null;
}

/**
 * Tipo do item do card. Prefere o documento; quando ele não está acessível,
 * deduz pelo DOM — o sistema só monta `.card-item-header` para magia e poder,
 * e o `<h4>` de tipo/nível/escola só para magia. Assim um card de criatura do
 * Mestre continua sendo mascarado mesmo se o item sumir (item apagado, token
 * removido da cena), em vez de vazar o nome por não achar o documento.
 */
function tipoDoCard(chatCard, item) {
  if (item) return item.type;
  const header = chatCard.querySelector('.card-item-header');
  if (!header) return null;
  return header.querySelector('h4') ? 'magia' : 'poder';
}

// ─── Manipulação de DOM ───────────────────────────────────────────────────────

/**
 * Percorre todos os .dice-roll e oculta as fórmulas das rolagens cujo tipo
 * está marcado no nível de metagame (`opts.ataque` / `opts.dano`).
 *
 * Regra de detecção de ataque vs dano:
 * - Dentro de .roll.ataque → ataque → mantém "Xd20+?"
 * - Dentro de .roll.dano  → dano   → exibe "?"
 * - Sem wrapper           → verifica se começa com 1d20 ou 2d20 (único caso de ataque
 *                           fora de wrapper); qualquer outro dado (ex: 6d20) → "?"
 */
function hideRollDetails(container, opts) {
  if (!opts.ataque && !opts.dano) return;

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

    const ehAtaque = isAttack || (!isDamage && isD20Attack);

    // Cada tipo tem a sua chave no nível de metagame; o que não está marcado
    // fica intacto (fórmula, breakdown e expand-on-click continuam funcionando).
    if (ehAtaque ? !opts.ataque : !opts.dano) return;

    if (ehAtaque) {
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
 * Para magias e poderes, conforme o nível de metagame:
 * - identidade: nome, ícone, escola e nível viram "não identificado" (ver
 *   `identidadeOculta`, que também respeita o padrão da criatura)
 * - `opts.cd`: mascara o número da CD na linha de informações
 * - `opts.descricao`: oculta a descrição (.card-content) e upgrades (.card-upgrades),
 *   e bloqueia o clique em .item-name que o sistema usa para re-exibir a descrição
 */
function hideCardSecrets(container, message, opts) {
  if (!opts.ativo) return;

  const chatCard = container.querySelector('.tormenta20.chat-card.item-card');
  if (!chatCard) return;

  const item = resolveCardItem(chatCard, message);
  const tipo = tipoDoCard(chatCard, item);
  if (tipo !== 'magia' && tipo !== 'poder') return;

  if (identidadeOculta(message, opts)) hideCardIdentity(container, chatCard, tipo, item?.name);

  // Mascara CD (ex.: "CD 15" → "CD ?"). Só reescreve o innerHTML quando
  // há CD de fato — a escrita força re-parse do HTML e destrói listeners
  // dos filhos, mesmo quando o texto não mudaria.
  if (opts.cd) {
    chatCard.querySelectorAll('.card-item-header p').forEach(el => {
      const html = el.innerHTML;
      if (/\bCD\s+\d+/i.test(html)) el.innerHTML = html.replace(/\bCD\s+\d+/gi, 'CD ?');
    });
  }

  if (!opts.descricao) return;

  // Oculta descrição e upgrades
  chatCard.querySelectorAll('.card-content, .card-upgrades').forEach(el => {
    el.style.display = 'none';
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

/**
 * Troca nome, ícone e rótulos de escola/nível do card por "Magia (ou Poder)
 * não identificado", para que os jogadores não descubram o que a criatura
 * conjurou. O Mestre revela caso a caso pelo menu de contexto do chat.
 */
function hideCardIdentity(container, chatCard, tipo, nomeReal) {
  const rotulo = rotuloNaoIdentificado(tipo);

  // Ícone do cabeçalho (o title do <img> também carrega o nome real)
  chatCard.querySelectorAll('.card-header img').forEach(img => {
    img.src = ICONE_DESCONHECIDO;
    img.title = rotulo;
    img.classList.add('t20g-nao-identificado');
  });

  // Nome — o sistema envolve o texto num <div> dentro do <h3.item-name>
  const nome = chatCard.querySelector('.item-name');
  if (nome) {
    (nome.querySelector('div') ?? nome).textContent = rotulo;
    nome.classList.add('t20g-nao-identificado');
  }

  // Tipo/nível/escola entregam a magia mesmo sem o nome
  chatCard.querySelectorAll('.card-item-header h4').forEach(el => { el.style.display = 'none'; });

  // Botões de aplicar efeito no rodapé mostram nome e ícone de cada efeito.
  // Reescreve só os filhos: o listener do sistema está no próprio botão.
  const rotuloEfeito = game.i18n.localize('T20HaydGMTools.MetaEfeitoDesconhecido');
  chatCard.querySelectorAll('.card-item-effects .chat-apply-ae').forEach(btn => {
    btn.innerHTML = `<img src="${ICONE_DESCONHECIDO}"> ${foundry.utils.escapeHTML(rotuloEfeito)}`;
  });

  // O flavor do cabeçalho da mensagem repete o nome do item em alguns cards
  const flavor = container.querySelector('.flavor-text');
  if (flavor && nomeReal && flavor.textContent.includes(nomeReal)) flavor.textContent = rotulo;
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
      // Destaque de crítico/falha (verde/vermelho) no total, como o sistema.
      const dt = novoBloco.querySelector('.dice-total');
      if (dt) {
        dt.classList.remove('success', 'critical', 'failure', 'fumble');
        if (sub.classesTotal?.length) dt.classList.add(...sub.classesTotal);
      }
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
  const card = div.querySelector('[data-item-id]');
  const itemId = card?.dataset?.itemId;
  if (!itemId) return null;

  // Tenta várias origens de ator (resolvedor robusto, ator do mundo, token, speaker).
  const candidatos = [resolveMessageActor(message)];
  if (card.dataset.actorId) candidatos.push(game.actors.get(card.dataset.actorId));
  const { token, scene, actor: speakerActor } = message.speaker ?? {};
  if (token && scene) candidatos.push(game.scenes.get(scene)?.tokens.get(token)?.actor);
  if (speakerActor) candidatos.push(game.actors.get(speakerActor));
  for (const a of candidatos) {
    const it = a?.items?.get(itemId);
    if (it) return it;
  }
  return null;
}

/**
 * Margem de crítico da rolagem. A rolagem pode perder `dice[0].options.critical`
 * (o `clone()` da rerolagem re-parseia a fórmula e descarta as options do dado),
 * então o valor confiável vem do flag `tormenta20.itemData.criticoM`, gravado
 * pela arma no momento do teste. Ordem: options do dado → flag → 20.
 */
function margemCritico(message, roll) {
  return Number(roll?.dice?.[0]?.options?.critical)
    || Number(message?.getFlag?.('tormenta20', 'itemData')?.criticoM)
    || 20;
}

/**
 * Classes de destaque do sistema para o total de um ataque (verde no crítico,
 * vermelho na falha), usando as mesmas classes do sistema base. Retorna [] para
 * rolagens que não são ataque.
 */
function classesDeDestaqueAtaque(message, roll) {
  const d = roll?.dice?.[0];
  if (roll?.options?.type !== 'attack' || d?.faces !== 20) return [];
  const total = Number(d.total);
  const crit = margemCritico(message, roll);
  const fumble = Number(d.options?.fumble) || 1;
  if (total >= crit) return ['success', 'critical'];
  if (total <= fumble) return ['failure', 'fumble'];
  return [];
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
      .map(r => foundry.dice.Roll.fromData(JSON.parse(JSON.stringify(r))));
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
  // Margem de crítico confiável (options do dado ou flag da arma na mensagem).
  const critM = margemCritico(message, novaAtaque);
  const antesCrit = (Number(ataqueOriginal?.dice?.[0]?.total) || 0) >= critM;
  const agoraCrit = (Number(novaAtaque?.dice?.[0]?.total) || 0) >= critM;
  if (index !== cls.ataque || cls.dano === -1) return [];
  if (antesCrit === agoraCrit) return [];

  const item = resolverItemDaMensagem(message);
  if (item?.type !== 'arma') return [];

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
    indicador: { icone: 'fa-rotate', dica: game.i18n.localize('T20HaydGMTools.TipRerolled') },
    classesTotal: classesDeDestaqueAtaque(message, nova)
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
  // Cópia PROFUNDA e independente: fromData(toJSON()) reaproveita as referências
  // dos arrays de resultados, então sem o round-trip JSON alterar `nova` também
  // alteraria `original` (corrompendo a detecção de crítico antes/depois).
  const nova = foundry.dice.Roll.fromData(JSON.parse(JSON.stringify(original)));
  dados.forEach((d, i) => {
    const res = nova.dice?.[d.di]?.results?.[d.ri];
    const alvo = Number(valores[i]);
    if (res && Number.isFinite(alvo)) res.result = Math.clamp(Math.round(alvo), 1, d.faces);
  });
  nova._total = nova._evaluateTotal();

  const subs = [{
    index, nova, totalAnterior, animar: false,
    indicador: { icone: 'fa-hand-pointer', dica: game.i18n.localize('T20HaydGMTools.TipManual') },
    classesTotal: classesDeDestaqueAtaque(message, nova)
  }];
  // Se o ataque virou/deixou de ser crítico, recalcula o dano automaticamente.
  subs.push(...await substituicoesDeDanoPorCritico(message, index, nova, original));
  await aplicarNovasRolagens(message, subs);
}

/** True se a mensagem é um card de magia/poder de uma criatura do Mestre. */
function cardDeMagiaOuPoder(message) {
  if (!isGMActorMessage(message)) return false;

  const div = document.createElement('div');
  div.innerHTML = message.content;
  const chatCard = div.querySelector('.tormenta20.chat-card.item-card');
  if (!chatCard) return false;

  const tipo = tipoDoCard(chatCard, resolveCardItem(chatCard, message));
  return tipo === 'magia' || tipo === 'poder';
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
        if (!game.user.isGM || !metagameOcultaAlgo()) return false;
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
        if (!game.user.isGM || !metagameOcultaAlgo()) return false;
        const msg = msgDo(li);
        return msg && isGMActorMessage(msg) && msg.getFlag(MODULE_ID, FLAG_PLAYER_CAN_SEE) === true;
      },
      callback: async li => {
        const msg = msgDo(li);
        if (msg) await msg.unsetFlag(MODULE_ID, FLAG_PLAYER_CAN_SEE);
      }
    },
    // Revelar/ocultar a identidade da magia ou poder — apenas Mestre.
    {
      name: 'T20HaydGMTools.RevealItem',
      icon: '<i class="fas fa-wand-magic-sparkles"></i>',
      condition: li => {
        if (!game.user.isGM) return false;
        const msg = msgDo(li);
        if (!msg || msg.getFlag(MODULE_ID, FLAG_ITEM_REVELADO) === true) return false;
        return identidadePodeSerOculta(msg, opcoesMetagame()) && cardDeMagiaOuPoder(msg);
      },
      callback: async li => {
        const msg = msgDo(li);
        if (msg) await msg.setFlag(MODULE_ID, FLAG_ITEM_REVELADO, true);
      }
    },
    {
      name: 'T20HaydGMTools.HideItem',
      icon: '<i class="fas fa-wand-magic"></i>',
      condition: li => {
        if (!game.user.isGM) return false;
        const msg = msgDo(li);
        if (msg?.getFlag(MODULE_ID, FLAG_ITEM_REVELADO) !== true) return false;
        return cardDeMagiaOuPoder(msg);
      },
      callback: async li => {
        const msg = msgDo(li);
        if (msg) await msg.unsetFlag(MODULE_ID, FLAG_ITEM_REVELADO);
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

/**
 * Re-renderiza as mensagens já presentes no chat para aplicar (ou desfazer) a
 * ocultação na hora, sem recarregar. O módulo só mexe no DOM renderizado — o
 * conteúdo salvo da mensagem continua intacto —, então basta pedir ao ChatLog
 * que refaça cada `li` visível.
 */
function rerenderizarChat() {
  const chat = ui.chat;
  const el = chat?.element;
  if (!el || typeof chat.updateMessage !== 'function') return;
  for (const li of el.querySelectorAll('[data-message-id]')) {
    const msg = game.messages.get(li.dataset.messageId);
    if (msg) chat.updateMessage(msg, { notify: false });
  }
}

// ─── Identificação de efeitos ativos ──────────────────────────────────────────

/**
 * Redesenha os ícones de efeito nos tokens de um ator. Necessário depois de
 * mudar o que está identificado, porque o PIXI guarda as texturas já montadas.
 */
function redesenharEfeitos(actor) {
  if (!canvas?.ready || !actor?.getActiveTokens) return;
  for (const token of actor.getActiveTokens()) token.drawEffects?.();
}

/** Caminho do flag de identificação dentro de um diff de atualização. */
const CAMINHO_IDENTIFICADO = `flags.${MODULE_ID}.${FLAG_EFEITO_IDENTIFICADO}`;

/**
 * A atualização mexeu em algo que muda a decisão de mascarar?
 *
 * Só o flag `identificado` e `statuses` entram em `efeitoNaoIdentificado`; o
 * resto (name, img, changes, disabled, duration…) já é re-preparado e
 * redesenhado pelo próprio Foundry. Sem esta guarda, cada efeito de uso que as
 * automações sincronizam custava um `prepareData` do ator inteiro mais um
 * redesenho por token, em todos os clientes.
 *
 * Cobre as três formas que um diff pode ter: expandido (setFlag), em notação
 * de ponto (update manual) e com o prefixo de deleção (unsetFlag).
 */
function mudouIdentificacao(changed) {
  if (!changed) return false;
  if ('statuses' in changed) return true;
  if (CAMINHO_IDENTIFICADO in changed) return true;

  const flags = changed.flags?.[MODULE_ID];
  return !!flags && (
    FLAG_EFEITO_IDENTIFICADO in flags ||
    `-=${FLAG_EFEITO_IDENTIFICADO}` in flags
  );
}

/** Reprepara o ator e redesenha os tokens dele. */
function reavaliarEfeitos(actor) {
  if (!actor) return;
  // reset() reinicia a partir da fonte e só então reprepara.
  //
  // prepareData() sozinho NÃO desfaz a preparação anterior: ele reaplica todos
  // os efeitos ativos por cima de dados que já os continham. Um bônus somado
  // entrava duas vezes e, em campos de lista (como
  // system.modificadores.pericias.ataque), o valor era anexado de novo — uma
  // penalidade de −4 chegava na rolagem como −8.
  actor.reset?.();
  redesenharEfeitos(actor);
}

/**
 * Alterna o padrão de ocultação da criatura pelo HUD do token: clique esquerdo
 * força esconder/mostrar as magias e efeitos dela, clique direito volta a
 * seguir o nível de metagame do mundo.
 */
function adicionarBotaoHUD(hud, el) {
  const actor = hud?.document?.actor ?? hud?.object?.actor;
  if (!actor || !HIDDEN_ACTOR_TYPES.has(actor.type)) return;

  const coluna = el.querySelector('.col.left');
  if (!coluna || coluna.querySelector('.t20g-hud-segredos')) return;

  const opts = opcoesMetagame();
  const padrao = opts.nomeMagia || opts.efeitos;
  const flag = actor.getFlag(MODULE_ID, FLAG_ATOR_OCULTAR);
  const explicito = typeof flag === 'boolean';
  const oculto = explicito ? flag : padrao;

  const estado = explicito
    ? game.i18n.localize(oculto ? 'T20HaydGMTools.MetaHudSempre' : 'T20HaydGMTools.MetaHudNunca')
    : game.i18n.localize(oculto ? 'T20HaydGMTools.MetaHudPadraoOculto' : 'T20HaydGMTools.MetaHudPadraoVisivel');

  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = `control-icon t20g-hud-segredos${oculto ? ' active' : ''}`;
  botao.innerHTML = `<i class="fa-solid ${oculto ? 'fa-mask' : 'fa-eye'}" inert></i>`;
  botao.dataset.tooltip = `${game.i18n.localize('T20HaydGMTools.MetaHudTitulo')} — ${estado}`;

  botao.addEventListener('click', async ev => {
    ev.preventDefault();
    ev.stopPropagation();
    await actor.setFlag(MODULE_ID, FLAG_ATOR_OCULTAR, !oculto);
    hud.render();
  });
  botao.addEventListener('contextmenu', async ev => {
    ev.preventDefault();
    ev.stopPropagation();
    await actor.unsetFlag(MODULE_ID, FLAG_ATOR_OCULTAR);
    hud.render();
  });

  coluna.appendChild(botao);
}

/**
 * Campo "Efeito identificado" na aba Detalhes da ficha do efeito ativo. O
 * `name` aponta direto para o flag, então o próprio formulário do Foundry salva.
 */
function adicionarCampoIdentificado(app, el) {
  const detalhes = el.querySelector('section.tab[data-tab="details"]');
  if (!detalhes || detalhes.querySelector('.t20g-efeito-identificado')) return;

  const L = k => game.i18n.localize(`T20HaydGMTools.${k}`);
  const atual = app.document.getFlag(MODULE_ID, FLAG_EFEITO_IDENTIFICADO) ?? '';
  const opcao = (valor, chave) =>
    `<option value="${valor}"${atual === valor ? ' selected' : ''}>${L(chave)}</option>`;

  detalhes.insertAdjacentHTML('beforeend', `
    <div class="form-group t20g-efeito-identificado">
      <label>${L('MetaEfeitoIdentificado')}</label>
      <div class="form-fields">
        <select name="flags.${MODULE_ID}.${FLAG_EFEITO_IDENTIFICADO}">
          ${opcao('', 'MetaEfeitoHerda')}${opcao('sim', 'MetaEfeitoSim')}${opcao('nao', 'MetaEfeitoNao')}
        </select>
      </div>
      <p class="hint">${L('MetaEfeitoIdentificadoDica')}</p>
    </div>`);
}

/**
 * Mundos que já rodavam o módulo antes desta versão continuam com o
 * comportamento antigo: as chaves novas entram desligadas, e o Mestre liga o
 * que quiser na caixa de metagame. Mundos novos usam o padrão (tudo oculto).
 */
async function migrarMetagame(mundoAntigo) {
  if (game.settings.get(MODULE_ID, 'metagameMigrado')) return;
  if (mundoAntigo) {
    const cfg = configMetagame();
    for (const chave of METAGAME_CHAVES_NOVAS) cfg[chave] = false;
    await game.settings.set(MODULE_ID, 'metagame', cfg);
  }
  await game.settings.set(MODULE_ID, 'metagameMigrado', true);
}

// ─── Editor do nível de metagame ──────────────────────────────────────────────

/** "Meta" + chave capitalizada → chave de tradução (ex.: 'cd' → 'MetaCd'). */
function chaveI18nMetagame(chave) {
  return `Meta${chave.charAt(0).toUpperCase()}${chave.slice(1)}`;
}

/**
 * Caixa de configuração "Nível de metagame": o Mestre marca, uma a uma, quais
 * informações das criaturas dele ficam ocultas para os jogadores — ou desliga
 * a chave-mestra e não esconde nada.
 */
async function abrirEditorMetagame() {
  if (!game.user.isGM) return;

  const L = k => game.i18n.localize(`T20HaydGMTools.${k}`);
  const atual = configMetagame();

  const linha = chave => `
    <label class="t20g-meta-linha">
      <input type="checkbox" name="${chave}" ${atual[chave] ? 'checked' : ''}>
      <span class="t20g-meta-rotulo">
        <b>${L(chaveI18nMetagame(chave))}</b>
        <span class="t20g-meta-dica">${L(`${chaveI18nMetagame(chave)}Dica`)}</span>
      </span>
    </label>`;

  const resultado = await foundry.applications.api.DialogV2.wait({
    window: { title: L('MetaTitulo'), icon: 'fa-solid fa-mask' },
    position: { width: 460 },
    content: `
      <p class="notes">${L('MetaIntro')}</p>
      <div class="t20g-meta">
        <label class="t20g-meta-linha t20g-meta-mestre">
          <input type="checkbox" name="ativo" ${atual.ativo ? 'checked' : ''}>
          <span class="t20g-meta-rotulo">
            <b>${L('MetaAtivo')}</b>
            <span class="t20g-meta-dica">${L('MetaAtivoDica')}</span>
          </span>
        </label>
        <div class="t20g-meta-opcoes">${METAGAME_CHAVES.map(linha).join('')}</div>
        <div class="t20g-meta-acoes">
          <button type="button" data-preset="tudo"><i class="fa-solid fa-eye-slash"></i> ${L('MetaPresetTudo')}</button>
          <button type="button" data-preset="rolagens"><i class="fa-solid fa-dice-d20"></i> ${L('MetaPresetRolagens')}</button>
          <button type="button" data-preset="nada"><i class="fa-solid fa-eye"></i> ${L('MetaPresetNada')}</button>
        </div>
      </div>`,
    buttons: [
      {
        action: 'salvar', label: L('MetaSalvar'), icon: 'fa-solid fa-check', default: true,
        callback: (ev, btn) => {
          const out = {};
          for (const chave of ['ativo', ...METAGAME_CHAVES]) {
            out[chave] = !!btn.form.querySelector(`[name="${chave}"]`)?.checked;
          }
          return out;
        }
      },
      { action: 'cancelar', label: L('MetaCancelar') }
    ],
    render: (ev, dialog) => {
      const el = dialog.element;
      const mestre = el.querySelector('[name="ativo"]');
      const opcoes = el.querySelector('.t20g-meta-opcoes');
      // Com a chave-mestra desligada as opções ficam apagadas: nada é escondido,
      // mas as marcações continuam salvas para quando o Mestre religar.
      const sincronizar = () => opcoes.classList.toggle('t20g-meta-off', !mestre.checked);
      mestre.addEventListener('change', sincronizar);
      el.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
        const preset = METAGAME_PRESETS[b.dataset.preset];
        mestre.checked = preset.ativo;
        METAGAME_CHAVES.forEach(k => {
          const inp = el.querySelector(`[name="${k}"]`);
          if (inp) inp.checked = !!preset[k];
        });
        sincronizar();
      }));
      sincronizar();
    },
    rejectClose: false
  });

  if (!resultado || resultado === 'cancelar') return;
  await game.settings.set(MODULE_ID, 'metagame', resultado);
  ui.notifications?.info(game.i18n.localize('T20HaydGMTools.MetaSalvo'));
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

Hooks.once('init', () => {
  // Nível de metagame: objeto com a chave-mestra + uma chave por informação.
  game.settings.register(MODULE_ID, 'metagame', {
    scope: 'world', config: false, type: Object, default: METAGAME_PADRAO,
    // Reaplica a ocultação nas mensagens já no chat, em todos os clientes.
    onChange: () => {
      invalidarMetagame();
      rerenderizarChat();
      for (const actor of game.actors ?? []) reavaliarEfeitos(actor);
      for (const token of canvas?.tokens?.placeables ?? []) {
        if (!token.document.actorLink) reavaliarEfeitos(token.actor);
      }
    }
  });
  game.settings.registerMenu(MODULE_ID, 'metagameMenu', {
    name: 'T20HaydGMTools.MetaMenuNome',
    label: 'T20HaydGMTools.MetaMenuBotao',
    hint: 'T20HaydGMTools.MetaMenuDica',
    icon: 'fa-solid fa-mask',
    restricted: true,
    // O Foundry faz `new type()` e chama render(): basta interceptar o render.
    type: class extends foundry.appv1.api.FormApplication {
      async render() { await abrirEditorMetagame(); return this; }
      async _updateObject() {}
    }
  });

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
  // Controle interno: as chaves novas de metagame já foram migradas?
  game.settings.register(MODULE_ID, 'metagameMigrado', {
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

  // "welcomeShown" marca um mundo em que o módulo já rodou: serve de sinal
  // para a migração antes de o próprio aviso ligá-lo.
  const mundoAntigo = game.settings.get(MODULE_ID, 'welcomeShown');
  await migrarMetagame(mundoAntigo);
  if (mundoAntigo) return;

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
 * Enquanto o t20-hayd-management antigo continuar ativo junto do GMTools,
 * avisa o Mestre nesta sessão: os dados dele (settings/flags) continuam
 * intactos e funcionando via GMTools, então dá para desativá-lo com
 * segurança. Não é um evento único — a condição pode voltar a ficar falsa
 * a qualquer momento (quando o Mestre desativar o módulo antigo), então
 * roda de novo em toda sessão em vez de usar uma flag "já mostrado".
 */
Hooks.once('ready', async () => {
  if (!game.user.isGM || game.user !== game.users.activeGM) return;
  if (!game.modules.get('t20-hayd-management')?.active) return;

  const content = `
    <div class="t20g-welcome">
      <p><strong><i class="fas fa-code-merge"></i> ${game.i18n.localize('T20HaydGMTools.UnificacaoTitle')}</strong></p>
      <p>${game.i18n.localize('T20HaydGMTools.UnificacaoBody')}</p>
    </div>`;

  await ChatMessage.create({
    content,
    whisper: game.users.filter(u => u.isGM).map(u => u.id),
    speaker: { alias: 'T20 Hayd GMTools' }
  });
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
    if (isRestrictedUser() && opcoesMetagame().critico && shouldHideFormula(this)) return;
    return original.call(this, html);
  };

  console.log('T20 Hayd GMTools | Highlight de crítico/fumble interceptado');
});

/**
 * Máscara dos efeitos ativos das criaturas do Mestre.
 *
 * Feita em `prepareDerivedData` — e não no desenho do token — porque assim o
 * nome e o ícone já saem trocados em TODO lugar que lê o documento preparado:
 * ícones sobre o token, texto flutuante "+(Velocidade)" do
 * `_displayScrollingStatus`, rastreador de combate e tooltips. O `_source`
 * continua intacto, então o Mestre (que não é usuário restrito) vê o original.
 */
Hooks.once('setup', () => {
  const AEClass = CONFIG.ActiveEffect?.documentClass;
  if (!AEClass) {
    console.warn('T20 Hayd GMTools | ActiveEffect não encontrado — efeitos seguem identificados');
    return;
  }

  const originalPrepare = AEClass.prototype.prepareDerivedData;
  AEClass.prototype.prepareDerivedData = function () {
    originalPrepare?.call(this);
    if (!efeitoNaoIdentificado(this)) return;
    this.name = game.i18n.localize('T20HaydGMTools.MetaEfeitoDesconhecido');
    this.img = ICONE_DESCONHECIDO;
    this.description = '';
  };

  console.log('T20 Hayd GMTools | Identificação de efeitos ativa');
});

/**
 * Marcar/desmarcar "Efeito identificado" precisa redesenhar os tokens.
 *
 * Rede de segurança, não o caminho principal: o Foundry já re-prepara o efeito
 * (updateSource → _initialize → prepareDerivedData, onde a máscara é aplicada)
 * e já agenda o redesenho do token (_onRelatedUpdate → redrawEffects). A guarda
 * mantém isso fora do caminho quente das automações, que atualizam efeitos com
 * frequência sem nunca tocar na identificação.
 */
Hooks.on('updateActiveEffect', (effect, changed) => {
  if (effect?.parent?.documentName !== 'Actor') return;
  if (!mudouIdentificacao(changed)) return;
  reavaliarEfeitos(effect.parent);
});

/** O padrão da criatura muda o que os jogadores veem — vale para ator e delta. */
function aoMudarFlagDoAtor(actor, changed) {
  if (!foundry.utils.hasProperty(changed, `flags.${MODULE_ID}.${FLAG_ATOR_OCULTAR}`)) return;
  reavaliarEfeitos(actor);
  rerenderizarChat();
}
Hooks.on('updateActor', (actor, changed) => aoMudarFlagDoAtor(actor, changed));
Hooks.on('updateActorDelta', (delta, changed) => aoMudarFlagDoAtor(delta.parent?.actor, changed));

/** Botão de padrão da criatura no HUD do token (só Mestre). */
Hooks.on('renderTokenHUD', (hud, html) => {
  if (!game.user.isGM) return;
  const el = html?.querySelector ? html : (html?.[0] ?? null);
  if (el) adicionarBotaoHUD(hud, el);
});

/** Campo "Efeito identificado" na ficha do efeito ativo (só Mestre). */
Hooks.on('renderActiveEffectConfig', (app, html) => {
  if (!game.user.isGM) return;
  const el = html?.querySelector ? html : (html?.[0] ?? null);
  if (el) adicionarCampoIdentificado(app, el);
});

/**
 * Após renderização da mensagem, aplica ocultações para jogadores restritos.
 */
Hooks.on('renderChatMessageHTML', (message, html) => {
  if (!isRestrictedUser()) return;
  if (!shouldHideFormula(message)) return;

  const container = html?.querySelector ? html : (html?.[0] ?? null);
  if (!container) return;

  const opts = opcoesMetagame();
  hideRollDetails(container, opts);
  hideCardSecrets(container, message, opts);
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

// ─── Organização das configurações ────────────────────────────────────────────

/**
 * O Foundry agrupa as configurações por PACOTE e não oferece subdivisão: com
 * a fusão, tudo do GMTools cai numa lista só, longa e sem separação temática.
 * Estas categorias são aplicadas depois do render, movendo cada `.form-group`
 * para baixo de um título. É puramente visual — não muda registro nem valor.
 *
 * Toda configuração visível precisa estar em alguma categoria; o que ficar de
 * fora permanece no topo, solto (ver `organizarConfiguracoes`).
 */
const CATEGORIAS_CONFIG = [
  { rotulo: 'CatMetagame',    icone: 'fa-mask',           chaves: ['metagameMenu'] },
  { rotulo: 'CatRolagens',    icone: 'fa-dice-d20',       chaves: ['jogadoresReroll', 'jogadoresManual'] },
  { rotulo: 'CatAutomacoes',  icone: 'fa-wand-sparkles',  chaves: ['automacoesEnabled', 'abrirDiarioAutomacoes'] },
  { rotulo: 'CatTesouros',    icone: 'fa-sack-dollar',    chaves: ['tesourosVinculosMenu', 'tesourosLivrosMenu', 'tesourosHomebrewMenu'] },
  { rotulo: 'CatParty',       icone: 'fa-users',          chaves: ['partySheetEnabled', 'visibility', 'requireConfirmation', 'chatMode', 'lojaCompat'] },
  { rotulo: 'CatAtributos',   icone: 'fa-dice-d6',        chaves: ['atributosMetodoPadrao', 'atributosPontos', 'atributosMultiNegativos', 'atributosCustosMenu', 'atributosConversaoMenu'] },
  { rotulo: 'CatFerramentas', icone: 'fa-ruler-combined', chaves: ['reguaEfeitos'] }
];

/**
 * Encontra o `.form-group` de uma configuração nossa. Campos comuns são
 * localizados pelo `name` do input e submenus pelo `data-key` do botão —
 * ambos usam o id completo "namespace.chave".
 */
function grupoDaConfiguracao(root, chave) {
  const id = CSS.escape(`${MODULE_ID}.${chave}`);
  const alvo = root.querySelector(`[name="${id}"], button[data-key="${id}"]`);
  return alvo?.closest('.form-group') ?? null;
}

/** Move as configurações do módulo para baixo de títulos de categoria. */
function organizarConfiguracoes(root) {
  // Já organizado neste render (o Foundry re-renderiza ao trocar de aba).
  if (root.querySelector('.t20g-cfg-titulo')) return;

  let container = null;
  const grupos = [];
  for (const cat of CATEGORIAS_CONFIG) {
    const itens = cat.chaves.map(c => grupoDaConfiguracao(root, c)).filter(Boolean);
    if (!itens.length) continue;
    container ??= itens[0].parentElement;
    grupos.push({ cat, itens });
  }
  if (!container) return;

  for (const { cat, itens } of grupos) {
    const titulo = document.createElement('h3');
    titulo.className = 't20g-cfg-titulo';
    titulo.innerHTML = `<i class="fa-solid ${cat.icone}"></i> ${foundry.utils.escapeHTML(game.i18n.localize(`T20HaydGMTools.${cat.rotulo}`))}`;
    container.appendChild(titulo);
    // appendChild MOVE o nó existente: agrupa e reordena numa passada só.
    for (const item of itens) container.appendChild(item);
  }
}

Hooks.on('renderSettingsConfig', (app, html) => {
  const root = html?.querySelector ? html : (html?.[0] ?? null);
  if (root) organizarConfiguracoes(root);
});

// ─── Integração Dice So Nice ──────────────────────────────────────────────────

/**
 * Integração com o módulo Dice So Nice.
 *
 * Arquitetura: o DSN dispara createChatMessage em TODOS os clientes com sync=false,
 * ou seja, cada cliente chama showForRoll de forma independente para a mesma
 * mensagem, e só libera o resultado no chat quando a promessa devolvida por
 * showForRoll resolve.
 *
 * Estratégia: no cliente do jogador a animação não acontece (o dado revelaria o
 * resultado natural), mas a promessa NÃO resolve na hora — ela espera o cliente
 * de quem rolou avisar que o dado parou. Sem isso o jogador via o total no chat
 * instantaneamente, enquanto o Mestre ainda estava vendo o dado rolar.
 */

/** Canal de sincronização (nativo do Foundry, sem depender do socketlib). */
const SOCKET = `module.${MODULE_ID}`;
const DSN_PRONTO = 'dsnPronto';

/**
 * Rede de segurança: se o aviso não chegar (Mestre saiu, socket perdido, DSN
 * travado), o resultado aparece assim mesmo depois deste tempo. Cobre com folga
 * uma animação normal do DSN sem deixar a mensagem pendurada.
 */
const DSN_LIMITE_MS = 5000;

// messageIds cuja animação já terminou na origem. O aviso pode chegar antes de
// este cliente registrar a espera, então guardamos os concluídos.
const dsnConcluidos = new Set();
const dsnEsperando = new Map();

/** Marca a animação como concluída e solta quem estava esperando por ela. */
function dsnResolver(messageId) {
  if (!messageId) return;
  dsnConcluidos.add(messageId);

  // Sessão longa não deve acumular ids para sempre; os antigos já resolveram.
  if (dsnConcluidos.size > 500) {
    const antigos = dsnConcluidos.values();
    for (let i = 0; i < 100; i++) dsnConcluidos.delete(antigos.next().value);
  }

  const espera = dsnEsperando.get(messageId);
  if (!espera) return;
  dsnEsperando.delete(messageId);
  for (const resolve of espera) resolve();
}

/** Espera o dado parar na tela de quem rolou — ou o tempo limite. */
function dsnEsperarOrigem(messageId) {
  if (!messageId) return new Promise(r => setTimeout(r, DSN_LIMITE_MS));
  if (dsnConcluidos.has(messageId)) return Promise.resolve();

  return new Promise(resolve => {
    const lista = dsnEsperando.get(messageId) ?? [];
    lista.push(resolve);
    dsnEsperando.set(messageId, lista);

    setTimeout(() => {
      const atual = dsnEsperando.get(messageId);
      if (!atual?.includes(resolve)) return;
      const restantes = atual.filter(r => r !== resolve);
      if (restantes.length) dsnEsperando.set(messageId, restantes);
      else dsnEsperando.delete(messageId);
      resolve();
    }, DSN_LIMITE_MS);
  });
}

/** Ator por trás de um speaker do DSN (token antes do ator do mundo). */
function atorDoSpeaker(speaker) {
  if (!speaker) return null;
  const { actor: actorId, token: tokenId, scene: sceneId } = speaker;
  if (tokenId && sceneId) {
    const actor = game.scenes.get(sceneId)?.tokens.get(tokenId)?.actor;
    if (actor) return actor;
  }
  return actorId ? game.actors.get(actorId) ?? null : null;
}

/** A animação desta rolagem deve ser suprimida para o usuário atual? */
function dsnDeveOcultar(messageId, speaker) {
  const msg = messageId ? game.messages.get(messageId) : null;
  if (msg) return shouldHideFormula(msg);

  // Fallback para quando a mensagem ainda não está no cache local
  const actor = atorDoSpeaker(speaker);
  return actor ? HIDDEN_ACTOR_TYPES.has(actor.type) : false;
}

/** A rolagem é de criatura do Mestre? Só essas precisam de sincronização. */
function dsnPrecisaSincronizar(messageId, speaker) {
  const actor = (messageId ? resolveMessageActor(game.messages.get(messageId)) : null)
    ?? atorDoSpeaker(speaker);
  return actor ? HIDDEN_ACTOR_TYPES.has(actor.type) : false;
}

Hooks.once('diceSoNiceReady', () => {
  if (!game.dice3d) return;

  const originalShowForRoll = game.dice3d.showForRoll.bind(game.dice3d);

  game.dice3d.showForRoll = function (roll, user, sync, recipients, blind, messageId, speaker, opts) {
    const animar = () => Promise.resolve(
      originalShowForRoll(roll, user, sync, recipients, blind, messageId, speaker, opts)
    );

    // Quem enxerga o dado (Mestre e donos da criatura) anima normalmente e, ao
    // fim, avisa os demais para que o chat de todo mundo revele junto.
    if (!isRestrictedUser() || !opcoesMetagame().dados3d || !dsnDeveOcultar(messageId, speaker)) {
      if (!messageId || !dsnPrecisaSincronizar(messageId, speaker)) return animar();
      return animar().then(resultado => {
        game.socket.emit(SOCKET, { tipo: DSN_PRONTO, messageId });
        dsnResolver(messageId);
        return resultado;
      });
    }

    // Jogador restrito: sem animação, mas o resultado no chat só é liberado
    // quando o dado para na tela de quem rolou.
    return dsnEsperarOrigem(messageId).then(() => true);
  };

  game.socket.on(SOCKET, dados => {
    if (dados?.tipo === DSN_PRONTO) dsnResolver(dados.messageId);
  });

  console.log('T20 Hayd GMTools | Integração Dice So Nice inicializada');
});
