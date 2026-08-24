/**
 * T20 Hayd GMTools — Ficha do Grupo (ex-t20-hayd-management)
 * Ficha do Grupo para Tormenta20 (pasta de atores = party), estoque
 * compartilhado, e transferência de itens/dinheiro entre membros. Fundido ao
 * GMTools; importado de t20-hayd-gmtools.mjs, não listado em module.json,
 * mesmo motivo de t20-hayd-automacoes.mjs/regua/tesouros (hot-reload sem
 * reiniciar o servidor).
 */

import { abrirGeradorTesouros } from './t20-hayd-tesouros.mjs';

// MODULE_ID continua "t20-hayd-management" — é o namespace de settings e
// flags (de ator/pasta) já salvo em mundos que usavam o módulo separado, e
// não pode mudar (o Foundry não valida namespace contra módulo instalado,
// então isso não quebra nada e evita qualquer migração de dados). Só o
// CAMINHO FÍSICO dos assets mudou com a fusão — ASSET_MODULE_ID é para isso.
const MODULE_ID = "t20-hayd-management";
const ASSET_MODULE_ID = "t20-hayd-gmtools";

/**
 * Namespace das SETTINGS. Como as flags, elas passam a viver no módulo
 * anfitrião — assim tudo aparece numa aba só nas configurações, em vez de uma
 * aba órfã "Gestão de Party".
 *
 * Não há migração em massa: o valor antigo é LIDO diretamente do documento de
 * Setting do mundo (`lerConfig`) enquanto o novo não tiver sido gravado. Isso
 * evita um problema de ordem — `partySheetEnabled` é consultado ainda no
 * `init`, antes de qualquer gravação assíncrona poder ter acontecido.
 */
const SETTINGS_NS = ASSET_MODULE_ID;

/** Valor cru de uma setting de mundo, sem exigir que ela esteja registrada. */
function settingBrutaDoMundo(id) {
  return game.settings.storage.get("world")?.getSetting?.(id)?.value;
}

/**
 * Lê uma setting do namespace novo, caindo no que o módulo separado gravou
 * enquanto o mundo ainda não tiver um valor próprio. `chaveLegada` existe
 * porque `welcomeShown` colidia com uma setting homônima do GMTools e teve de
 * ser renomeada na mudança de namespace.
 */
function lerConfig(chave, chaveLegada = chave) {
  if (settingBrutaDoMundo(`${SETTINGS_NS}.${chave}`) !== undefined) {
    return game.settings.get(SETTINGS_NS, chave);
  }
  const legado = settingBrutaDoMundo(`${MODULE_ID}.${chaveLegada}`);
  return legado !== undefined ? legado : game.settings.get(SETTINGS_NS, chave);
}

/**
 * Escopo das FLAGS. Diferente das settings, o Foundry valida o escopo de flag
 * contra os módulos ATIVOS (ClientDatabaseBackend#getFlagScopes), então manter
 * o id antigo fazia getFlag/setFlag lançarem "Flag scope ... is not valid"
 * assim que o módulo separado era desativado.
 *
 * As flags passam a ser gravadas no módulo anfitrião, que está sempre ativo. O
 * escopo antigo continua sendo LIDO por acesso direto a `flags` — leitura
 * crua não passa pela validação —, então mundos que já usavam o módulo
 * separado não perdem o estoque, e cada gravação migra o dado naturalmente.
 */
const FLAG_SCOPE = ASSET_MODULE_ID;
const FLAG_SCOPE_LEGADO = MODULE_ID;

/** Lê uma flag do escopo novo, caindo no antigo enquanto não houver gravação. */
function lerFlag(doc, chave) {
  const atual = doc?.flags?.[FLAG_SCOPE]?.[chave];
  return atual !== undefined ? atual : doc?.flags?.[FLAG_SCOPE_LEGADO]?.[chave];
}

/** Tipos de item que contam como inventário físico no Tormenta20. */
const INVENTORY_TYPES = ["arma", "equipamento", "consumivel", "tesouro"];

/** Tipos de ator que podem ser membros de party. */
const MEMBER_TYPES = ["character", "npc", "simple"];

/** Moedas do sistema (system.dinheiro.*). */
const COINS = ["tl", "to", "tp", "tc"];
const COIN_LABELS = { tl: "TL", to: "TO", tp: "TP", tc: "TC" };
const COIN_NAMES = {
  tl: "THM.CoinTL",
  to: "THM.CoinTO",
  tp: "THM.CoinTP",
  tc: "THM.CoinTC"
};

let socket = null;

const loc = (key, data) =>
  data ? game.i18n.format(key, data) : game.i18n.localize(key);

const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );

/* ============================================================
   CONFIGURAÇÕES
============================================================ */

function registerSettings() {
  // Interruptor da Ficha do Grupo (janela, botão no diretório, refresh ao
  // vivo). A transferência de dinheiro/itens NÃO depende disto — é nativa e
  // sempre ligada (ver registerTransferUiHooks). Muda registro de hooks no
  // init, por isso precisa de reload.
  game.settings.register(SETTINGS_NS, "partySheetEnabled", {
    name: "THM.SettingPartySheetEnabledName",
    hint: "THM.SettingPartySheetEnabledHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  // Registro interno das parties: { [folderId]: { stashActorId } }
  game.settings.register(SETTINGS_NS, "parties", {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(SETTINGS_NS, "visibility", {
    name: "THM.SettingVisibilityName",
    hint: "THM.SettingVisibilityHint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      values: "THM.VisibilityValues",
      percent: "THM.VisibilityPercent",
      hidden: "THM.VisibilityHidden"
    },
    default: "percent",
    onChange: () => refreshPartyApps()
  });

  game.settings.register(SETTINGS_NS, "requireConfirmation", {
    name: "THM.SettingConfirmName",
    hint: "THM.SettingConfirmHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(SETTINGS_NS, "chatMode", {
    name: "THM.SettingChatName",
    hint: "THM.SettingChatHint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      gm: "THM.ChatGM",
      all: "THM.ChatAll",
      none: "THM.ChatNone"
    },
    default: "gm"
  });

  game.settings.register(SETTINGS_NS, "lojaCompat", {
    name: "THM.SettingLojaCompatName",
    hint: "THM.SettingLojaCompatHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Controle interno: mensagem de boas-vindas já foi enviada?
  game.settings.register(SETTINGS_NS, "partyWelcomeShown", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  // A entrada de menu só aparece com a Ficha do Grupo ligada — desligada,
  // não há nada pra gerenciar (nem o botão que abriria essa configuração).
  if (lerConfig("partySheetEnabled")) {
    game.settings.registerMenu(SETTINGS_NS, "partyManager", {
      name: "THM.PartyManagerMenuName",
      label: "THM.PartyManagerMenuLabel",
      hint: "THM.PartyManagerMenuHint",
      icon: "fa-solid fa-users-gear",
      type: PartyManagerApp,
      restricted: true
    });
  }
}

/* ============================================================
   PARTIES — pasta de atores + ator-estoque
============================================================ */

function getPartiesSetting() {
  return foundry.utils.deepClone(lerConfig("parties") ?? {});
}

/** Ids de pasta de todas as parties cujas pastas ainda existem. */
function getPartyFolderIds() {
  return Object.keys(getPartiesSetting()).filter((id) => game.folders.get(id));
}

/** Ids da pasta da party + subpastas incluídas.
 *  Subpastas na lista de exclusão da party (configurável no Gerenciar
 *  Parties) ficam de fora junto com toda a sua subárvore; subpastas novas
 *  entram por padrão. */
function getFolderSubtreeIds(folderId) {
  const folder = game.folders.get(folderId);
  if (!folder) return new Set();
  // leitura direta (sem deepClone) — chamada em caminhos quentes
  const cfg = lerConfig("parties")?.[folderId];
  const excluidas = new Set(cfg?.subpastasExcluidas ?? []);
  const ids = new Set([folder.id]);
  const descer = (f) => {
    for (const sub of f.getSubfolders(false)) {
      if (excluidas.has(sub.id)) continue;
      ids.add(sub.id);
      descer(sub);
    }
  };
  descer(folder);
  return ids;
}

function isStashActor(actor) {
  return !!lerFlag(actor, "stash");
}

/** Pasta de party à qual o ator-estoque pertence. */
function stashPartyFolderId(actor) {
  return lerFlag(actor, "stash") || null;
}

/** Membros da party (atores dentro da pasta/subpastas, exceto o estoque) — versão pública. */
export function getPartyMembers(folderId) {
  return getMembers(folderId);
}

/** Membros da party (atores dentro da pasta/subpastas, exceto o estoque). */
function getMembers(folderId) {
  const ids = getFolderSubtreeIds(folderId);
  if (!ids.size) return [];
  return game.actors
    .filter(
      (a) =>
        a.folder &&
        ids.has(a.folder.id) &&
        MEMBER_TYPES.includes(a.type) &&
        !isStashActor(a)
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** Pasta de party que contém o ator (ou null). */
function getPartyFolderIdOf(actor) {
  if (!actor?.folder) return isStashActor(actor) ? stashPartyFolderId(actor) : null;
  for (const folderId of getPartyFolderIds()) {
    if (getFolderSubtreeIds(folderId).has(actor.folder.id)) return folderId;
  }
  return isStashActor(actor) ? stashPartyFolderId(actor) : null;
}

/* ------------------------------------------------------------
   ESTOQUE DA PARTY — guardado como flag na própria pasta.
   Nenhum ator é criado; os itens vivem como dados brutos e o
   dinheiro como números. Toda mutação passa pelo cliente do GM.
------------------------------------------------------------ */

/** Dados do estoque da party: { money: {tl,to,tp,tc}, items: [itemData] }. */
function getStashData(folderId) {
  const folder = game.folders.get(folderId);
  const raw = lerFlag(folder, "stash") ?? {};
  return {
    money: Object.fromEntries(COINS.map((k) => [k, Number(raw.money?.[k]) || 0])),
    items: Array.isArray(raw.items) ? foundry.utils.deepClone(raw.items) : []
  };
}

/**
 * Versão SOMENTE LEITURA do estoque: devolve os itens crus da flag SEM
 * deepClone (que copiava descrições/efeitos inteiros a cada render).
 * NUNCA mutar o retorno — para escrever, use getStashData/setStashData.
 */
function getStashDataRaw(folderId) {
  const folder = game.folders.get(folderId);
  const raw = lerFlag(folder, "stash") ?? {};
  return {
    money: Object.fromEntries(COINS.map((k) => [k, Number(raw.money?.[k]) || 0])),
    items: Array.isArray(raw.items) ? raw.items : []
  };
}

/** (GM) Persiste os dados do estoque na pasta da party. */
async function setStashData(folderId, data) {
  const folder = game.folders.get(folderId);
  if (!folder) throw new Error(loc("THM.InvalidTarget"));
  await folder.update({ [`flags.${FLAG_SCOPE}.stash`]: data });
}

const VOLATILE_ITEM_KEYS = ["qtd", "equipado", "carregado"];

function cleanSystemForMatch(sys) {
  const s = foundry.utils.deepClone(sys ?? {});
  for (const k of VOLATILE_ITEM_KEYS) delete s[k];
  return s;
}

/** Itens idênticos (mesmo tipo/nome/dados, ignorando quantidade e equipado). */
function isSameItem(aData, bData) {
  return (
    aData.type === bData.type &&
    aData.name === bData.name &&
    foundry.utils.objectsEqual(
      cleanSystemForMatch(aData.system),
      cleanSystemForMatch(bData.system)
    )
  );
}

/** Normaliza dados de item para transferência. */
function prepareTransferItemData(sourceData, qty) {
  const data = foundry.utils.deepClone(sourceData);
  delete data.folder;
  delete data.sort;
  data.system ??= {};
  data.system.qtd = qty;
  if (data.system.equipado !== undefined) data.system.equipado = false;
  if (data.system.carregado !== undefined) data.system.carregado = false;
  return data;
}

/** (GM) Adiciona um item ao estoque (empilha se houver idêntico). */
export async function stashAddItem(folderId, sourceData, qty) {
  const stash = getStashData(folderId);
  const data = prepareTransferItemData(sourceData, qty);
  const match = stash.items.find((e) => isSameItem(e, data));
  if (match) {
    match.system.qtd = (Number(match.system?.qtd) || 0) + qty;
  } else {
    data._id = foundry.utils.randomID();
    stash.items.push(data);
  }
  await setStashData(folderId, stash);
}

/** (GM) Soma moedas ao estoque (usado pela distribuição de tesouro). */
export async function stashAddMoney(folderId, coins) {
  const stash = getStashData(folderId);
  for (const k of COINS) {
    const add = Number(coins?.[k]) || 0;
    if (add) stash.money[k] = (Number(stash.money[k]) || 0) + add;
  }
  await setStashData(folderId, stash);
}

/** (GM) Remove quantidade de um item do estoque; retorna os dados do item. */
async function stashRemoveItem(folderId, entryId, qty) {
  const stash = getStashData(folderId);
  const idx = stash.items.findIndex((e) => e._id === entryId);
  if (idx < 0) throw new Error(loc("THM.ItemNotFound"));
  const entry = foundry.utils.deepClone(stash.items[idx]);
  const have = Number(stash.items[idx].system?.qtd ?? 1) || 0;
  if (qty >= have) stash.items.splice(idx, 1);
  else stash.items[idx].system.qtd = have - qty;
  await setStashData(folderId, stash);
  return entry;
}

/**
 * (GM) Migra estoques antigos (versões anteriores criavam um ator
 * "Inventário — ..." dentro da pasta): move itens e dinheiro para a
 * flag da pasta e apaga o ator.
 */
async function gmMigrateLegacyStashes() {
  const strays = game.actors.filter((a) => stashPartyFolderId(a));
  for (const actor of strays) {
    const folderId = stashPartyFolderId(actor);
    try {
      if (game.folders.get(folderId)) {
        const stash = getStashData(folderId);
        for (const item of actor.items.filter((i) => INVENTORY_TYPES.includes(i.type))) {
          const qty = Number(item.system?.qtd ?? 1) || 1;
          const data = prepareTransferItemData(item.toObject(), qty);
          const match = stash.items.find((e) => isSameItem(e, data));
          if (match) match.system.qtd = (Number(match.system?.qtd) || 0) + qty;
          else {
            data._id = foundry.utils.randomID();
            stash.items.push(data);
          }
        }
        const money = getMoney(actor);
        for (const k of COINS) stash.money[k] += money[k];
        await setStashData(folderId, stash);
      }
      await actor.delete();
      console.log(`${MODULE_ID} | estoque migrado para a pasta ${folderId}`);
    } catch (err) {
      console.error(`${MODULE_ID} | falha ao migrar estoque`, err);
    }
  }

  const parties = getPartiesSetting();
  let changed = false;
  for (const rec of Object.values(parties)) {
    if (rec.stashActorId) {
      delete rec.stashActorId;
      changed = true;
    }
  }
  if (changed) await game.settings.set(SETTINGS_NS, "parties", parties);
}

/** Parties visíveis para o usuário atual (GM vê todas). */
function getPartiesForUser(user = game.user) {
  const folderIds = getPartyFolderIds();
  if (user.isGM) return folderIds;
  return folderIds.filter((fid) =>
    getMembers(fid).some((a) => a.testUserPermission(user, "OWNER"))
  );
}

/* ============================================================
   DINHEIRO — helpers
============================================================ */

function getMoney(actor) {
  const d = actor?.system?.dinheiro ?? {};
  return Object.fromEntries(COINS.map((k) => [k, Number(d[k]) || 0]));
}

function coinsLabel(coins) {
  const parts = COINS.filter((k) => (Number(coins?.[k]) || 0) > 0).map(
    (k) => `${Number(coins[k])} ${COIN_LABELS[k]}`
  );
  return parts.join(", ");
}

function coinsTotal(coins) {
  return COINS.reduce((t, k) => t + (Number(coins?.[k]) || 0), 0);
}

/**
 * Tibar de Platina (TL) é regra opcional do sistema (flag por ator
 * "sheet.mostrarPlatina"). A party usa platina se algum membro tiver a
 * regra ativada — ou se já houver TL guardado no estoque.
 */
function partyUsesPlatina(folderId) {
  if (getStashDataRaw(folderId).money.tl > 0) return true;
  return getMembers(folderId).some(
    (a) => !!a.getFlag("tormenta20", "sheet.mostrarPlatina")
  );
}

/* ============================================================
   COMPATIBILIDADE COM t20-hayd-loja
   O t20-hayd-loja posta no chat toda alteração de system.dinheiro
   (classe CSS "t20-loja-message"), sem oferecer flag de supressão.
   Marcamos os atores envolvidos na transferência (as options do
   update são propagadas a todos os clientes) e bloqueamos a
   criação dessas mensagens numa janela curta.
============================================================ */

const lojaSuppress = new Map(); // actorId -> timestamp

function lojaCompatEnabled() {
  return (
    lerConfig("lojaCompat") &&
    (game.modules.get("t20-hayd-loja")?.active ?? false)
  );
}

function markLojaSuppress(actorId) {
  if (actorId) lojaSuppress.set(actorId, Date.now());
}

function registerLojaCompatHooks() {
  // As options do update chegam a todos os clientes no hook updateActor;
  // o t20-hayd-loja cria sua mensagem de forma assíncrona, então marcar aqui
  // ainda acontece antes do preCreateChatMessage disparar.
  Hooks.on("updateActor", (actor, data, options) => {
    if (options?.[MODULE_ID]?.suppressLoja) markLojaSuppress(actor.id);
  });

  Hooks.on("preCreateChatMessage", (doc) => {
    if (!lojaCompatEnabled()) return;
    const content = doc.content ?? "";
    if (!content.includes("t20-loja-message")) return;
    const now = Date.now();
    for (const [id, t] of lojaSuppress) {
      if (now - t > 2500) lojaSuppress.delete(id);
    }
    const speakerActor = doc.speaker?.actor;
    if (speakerActor && lojaSuppress.has(speakerActor)) return false;
  });
}

/* ============================================================
   CHAT — registro de transações
============================================================ */

function postTransferChat({ kind, sourceName, targetName, itemName, qty, coins }) {
  const mode = lerConfig("chatMode");
  if (mode === "none") return;

  const body =
    kind === "item"
      ? loc("THM.ChatItemTransfer", { source: sourceName, target: targetName, item: itemName, qty })
      : loc("THM.ChatMoneyTransfer", { source: sourceName, target: targetName, coins: coinsLabel(coins) });

  const content = `
    <div class="thm-chat-card">
      <div class="thm-chat-header"><i class="fa-solid fa-right-left"></i> ${loc("THM.ChatTransferHeader")}</div>
      <div class="thm-chat-body">${body}</div>
    </div>`;

  const messageData = {
    content,
    speaker: { alias: loc("THM.ChatTransferHeader") },
    flags: { [MODULE_ID]: { transfer: true } }
  };
  if (mode === "gm") {
    messageData.whisper = game.users.filter((u) => u.isGM).map((u) => u.id);
  }
  ChatMessage.create(messageData);
}

/* ============================================================
   MOTOR DE TRANSFERÊNCIAS (executa no cliente do GM)
============================================================ */

function activeOwnerOf(actor, { excludeUserId = null } = {}) {
  return (
    game.users.find(
      (u) =>
        u.active &&
        !u.isGM &&
        u.id !== excludeUserId &&
        actor.testUserPermission(u, "OWNER")
    ) ?? null
  );
}

async function notifyUser(userId, message, type = "info") {
  try {
    if (!userId || userId === game.user.id) {
      ui.notifications[type]?.(message);
      return;
    }
    if (socket) await socket.executeAsUser("notify", userId, message, type);
  } catch (err) {
    console.warn(`${MODULE_ID} | notifyUser`, err);
  }
}

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}

/** Executa no cliente do destinatário: diálogo de aceite. */
async function promptConfirm(data) {
  const fromUser = data.userName
    ? `<p class="thm-hint">${loc("THM.ConfirmFromUser", { user: esc(data.userName) })}</p>`
    : "";
  const content =
    data.kind === "item"
      ? loc("THM.ConfirmItemTransfer", {
          source: data.sourceName,
          target: data.targetName,
          item: data.itemName,
          qty: data.qty
        })
      : loc("THM.ConfirmMoneyTransfer", {
          source: data.sourceName,
          target: data.targetName,
          coins: data.coinsText
        });

  const result = await foundry.applications.api.DialogV2.confirm({
    window: { title: loc("THM.ConfirmTransferTitle"), icon: "fa-solid fa-right-left" },
    content: content + fromUser,
    rejectClose: false,
    modal: true,
    yes: { label: loc("THM.Accept") },
    no: { label: loc("THM.Decline") }
  });
  return result === true;
}

function resolveEndpoint(ep) {
  if (ep?.stashFolderId) {
    return {
      folder: game.folders.get(ep.stashFolderId) ?? null,
      folderId: ep.stashFolderId,
      isStash: true
    };
  }
  if (ep?.tokenUuid) {
    // Token no mapa (cobre tokens não-vinculados, cujo ator é sintético)
    const tokenDoc = fromUuidSync(ep.tokenUuid);
    return { actor: tokenDoc?.actor ?? null, isStash: false };
  }
  return { actor: game.actors.get(ep?.actorId) ?? null, isStash: false };
}

function endpointValid(ep) {
  return ep.isStash ? !!ep.folder : !!ep.actor;
}

/** Endpoint de transferência para um ator (usa o token se for sintético). */
function actorEndpoint(actor) {
  return actor.isToken && actor.token
    ? { tokenUuid: actor.token.uuid }
    : { actorId: actor.id };
}

function userCanActAsSource(user, endpoint) {
  if (user.isGM) return true;
  if (endpoint.isStash) {
    // Qualquer jogador com personagem na party pode mexer no estoque
    return getMembers(endpoint.folderId).some((a) => a.testUserPermission(user, "OWNER"));
  }
  return endpoint.actor.testUserPermission(user, "OWNER");
}

/** Junta dados de item a um ator (empilha se houver um item idêntico). */
async function addItemData(actor, sourceData, qty) {
  const data = prepareTransferItemData(sourceData, qty);
  delete data._id;

  const match = actor.items.find((i) => isSameItem(i.toObject(), data));
  if (match) {
    const current = Number(match.system.qtd ?? 0) || 0;
    await match.update({ "system.qtd": current + qty });
  } else {
    await actor.createEmbeddedDocuments("Item", [data]);
  }
}

async function removeItemQty(item, qty) {
  const have = Number(item.system.qtd ?? 1) || 0;
  if (qty >= have) await item.delete();
  else await item.update({ "system.qtd": have - qty });
}

/**
 * Executa uma transferência. Roda sempre num cliente de GM (direto ou via socket).
 * payload: {
 *   kind: "item" | "money",
 *   source / target: { actorId } | { stashFolderId },
 *   itemId, qty, coins: {tl,to,tp,tc},
 *   userId: iniciador
 * }
 */
async function gmExecuteTransfer(payload) {
  const initiator = game.users.get(payload.userId) ?? null;
  const source = resolveEndpoint(payload.source);
  const target = resolveEndpoint(payload.target);

  const sameEndpoint =
    source.isStash === target.isStash &&
    (source.isStash
      ? source.folderId === target.folderId
      : source.actor?.id === target.actor?.id);
  if (!endpointValid(source) || !endpointValid(target) || sameEndpoint) {
    await notifyUser(payload.userId, loc("THM.InvalidTarget"), "warn");
    return { ok: false, reason: "invalid" };
  }
  if (!initiator || !userCanActAsSource(initiator, source)) {
    await notifyUser(payload.userId, loc("THM.NotAuthorized"), "warn");
    return { ok: false, reason: "unauthorized" };
  }

  const sourceName = source.isStash ? loc("THM.PartyStash") : source.actor.name;
  const targetName = target.isStash ? loc("THM.PartyStash") : target.actor.name;

  // Disponibilidade na origem (reutilizado na revalidação pós-confirmação)
  const findSourceItem = () => {
    if (source.isStash) {
      const entry = getStashDataRaw(source.folderId).items.find(
        (e) => e._id === payload.itemId
      );
      return entry
        ? { name: entry.name, have: Number(entry.system?.qtd ?? 1) || 0 }
        : null;
    }
    const it = source.actor.items.get(payload.itemId);
    if (!it || !INVENTORY_TYPES.includes(it.type)) return null;
    return { name: it.name, have: Number(it.system.qtd ?? 1) || 0 };
  };
  const sourceBalance = () =>
    source.isStash ? getStashDataRaw(source.folderId).money : getMoney(source.actor);

  // ---------- Validação de disponibilidade ----------
  let qty = 0;
  let coins = null;
  let itemName = "";

  if (payload.kind === "item") {
    const info = findSourceItem();
    if (!info) {
      await notifyUser(payload.userId, loc("THM.ItemNotFound"), "warn");
      return { ok: false, reason: "item-not-found" };
    }
    itemName = info.name;
    qty = Math.floor(Number(payload.qty) || 0);
    if (qty < 1 || qty > info.have) {
      await notifyUser(
        payload.userId,
        loc("THM.NotEnoughQty", { name: sourceName, item: info.name }),
        "warn"
      );
      return { ok: false, reason: "qty" };
    }
  } else if (payload.kind === "money") {
    if (
      (!source.isStash && !source.actor.system?.dinheiro) ||
      (!target.isStash && !target.actor.system?.dinheiro)
    ) {
      await notifyUser(payload.userId, loc("THM.InvalidTarget"), "warn");
      return { ok: false, reason: "invalid" };
    }
    coins = Object.fromEntries(
      COINS.map((k) => [k, Math.max(0, Math.floor(Number(payload.coins?.[k]) || 0))])
    );
    if (coinsTotal(coins) < 1) {
      await notifyUser(payload.userId, loc("THM.NoMoneySelected"), "warn");
      return { ok: false, reason: "no-coins" };
    }
    const balance = sourceBalance();
    if (COINS.some((k) => coins[k] > balance[k])) {
      await notifyUser(payload.userId, loc("THM.NotEnoughMoney", { name: sourceName }), "warn");
      return { ok: false, reason: "funds" };
    }
  } else {
    return { ok: false, reason: "invalid-kind" };
  }

  // ---------- Confirmação do destinatário ----------
  // Alvos fora da party do remetente (ex.: NPCs no mapa) exigem aprovação
  // do GM mesmo com o modo de troca livre ativado.
  const sourcePartyId = source.isStash
    ? source.folderId
    : getPartyFolderIdOf(source.actor);
  const targetIsPartyMember =
    !target.isStash &&
    !!sourcePartyId &&
    getPartyFolderIdOf(target.actor) === sourcePartyId;

  const needsConfirm =
    !initiator.isGM &&
    !target.isStash &&
    !target.actor.testUserPermission(initiator, "OWNER") &&
    (lerConfig("requireConfirmation") || !targetIsPartyMember);

  if (needsConfirm) {
    const confirmData = {
      kind: payload.kind,
      sourceName,
      targetName,
      itemName,
      qty,
      coinsText: coins ? coinsLabel(coins) : "",
      userName: initiator.name
    };
    const approver = activeOwnerOf(target.actor, { excludeUserId: initiator.id });
    let accepted;
    if (approver) {
      accepted = await withTimeout(
        socket.executeAsUser("promptConfirm", approver.id, confirmData),
        90_000,
        false
      );
    } else {
      // Dono não conectado: o Mestre decide
      accepted = await promptConfirm(confirmData);
    }
    if (!accepted) {
      await notifyUser(
        payload.userId,
        loc("THM.TransferDeclinedBy", { name: approver?.name ?? targetName }),
        "warn"
      );
      return { ok: false, reason: "declined" };
    }

    // Revalida após a espera (o estado pode ter mudado)
    if (payload.kind === "item") {
      const info = findSourceItem();
      if (!info || qty > info.have) {
        await notifyUser(
          payload.userId,
          loc("THM.NotEnoughQty", { name: sourceName, item: itemName }),
          "warn"
        );
        return { ok: false, reason: "qty" };
      }
    } else {
      const balance = sourceBalance();
      if (COINS.some((k) => coins[k] > balance[k])) {
        await notifyUser(payload.userId, loc("THM.NotEnoughMoney", { name: sourceName }), "warn");
        return { ok: false, reason: "funds" };
      }
    }
  }

  // ---------- Execução ----------
  try {
    if (payload.kind === "item") {
      let itemData;
      if (source.isStash) {
        itemData = await stashRemoveItem(source.folderId, payload.itemId, qty);
      } else {
        const it = source.actor.items.get(payload.itemId);
        itemData = it.toObject();
        await removeItemQty(it, qty);
      }
      try {
        if (target.isStash) await stashAddItem(target.folderId, itemData, qty);
        else await addItemData(target.actor, itemData, qty);
      } catch (err) {
        // Devolve à origem se o crédito falhar
        if (source.isStash) await stashAddItem(source.folderId, itemData, qty);
        else await addItemData(source.actor, itemData, qty);
        throw err;
      }
      postTransferChat({ kind: "item", sourceName, targetName, itemName, qty });
    } else {
      const opts = { [MODULE_ID]: { suppressLoja: lojaCompatEnabled() } };
      if (lojaCompatEnabled()) {
        if (!source.isStash) markLojaSuppress(source.actor.id);
        if (!target.isStash) markLojaSuppress(target.actor.id);
      }
      const applyDelta = async (ep, sign) => {
        if (ep.isStash) {
          const stash = getStashData(ep.folderId);
          for (const k of COINS) {
            stash.money[k] = Math.max(0, stash.money[k] + sign * coins[k]);
          }
          await setStashData(ep.folderId, stash);
        } else {
          const balance = getMoney(ep.actor);
          await ep.actor.update(
            Object.fromEntries(
              COINS.map((k) => [
                `system.dinheiro.${k}`,
                Math.max(0, balance[k] + sign * coins[k])
              ])
            ),
            opts
          );
        }
      };
      await applyDelta(source, -1);
      try {
        await applyDelta(target, +1);
      } catch (err) {
        // Reembolsa a origem se o crédito falhar
        await applyDelta(source, +1);
        throw err;
      }
      postTransferChat({ kind: "money", sourceName, targetName, coins });
    }
  } catch (err) {
    console.error(`${MODULE_ID} | transfer`, err);
    await notifyUser(payload.userId, loc("THM.TransferFailed", { reason: err.message }), "error");
    return { ok: false, reason: "error" };
  }

  await notifyUser(payload.userId, loc("THM.TransferDone"), "info");
  return { ok: true };
}

/** Ponto de entrada de qualquer cliente. */
async function requestTransfer(payload) {
  payload.userId = game.user.id;
  if (game.user.isGM) return gmExecuteTransfer(payload);
  if (!game.users.activeGM) {
    ui.notifications.warn(loc("THM.NoGMOnline"));
    return { ok: false, reason: "no-gm" };
  }
  if (!socket) {
    ui.notifications.error(`${MODULE_ID}: socketlib indisponível.`);
    return { ok: false, reason: "no-socket" };
  }
  return socket.executeAsGM("gmExecuteTransfer", payload);
}

/* ============================================================
   DIÁLOGOS
============================================================ */

function memberOptionsHtml(members, { selectedId = null } = {}) {
  return members
    .map(
      (a) =>
        `<option value="a:${a.id}" ${a.id === selectedId ? "selected" : ""}>${esc(a.name)}</option>`
    )
    .join("");
}

function coinInputsHtml(max = null, { showTl = true } = {}) {
  const keys = showTl ? COINS : COINS.filter((k) => k !== "tl");
  return keys.map((k) => {
    const maxAttr = max ? `max="${max[k]}"` : "";
    const maxTxt = max ? ` <span class="thm-hint">(máx. ${max[k]})</span>` : "";
    return `
      <div class="form-group">
        <label>${loc(COIN_NAMES[k])}${maxTxt}</label>
        <input type="number" name="coin-${k}" value="0" min="0" ${maxAttr} step="1" />
      </div>`;
  }).join("");
}

function readCoinsFromForm(form) {
  return Object.fromEntries(
    COINS.map((k) => [k, Math.max(0, Math.floor(Number(form.elements[`coin-${k}`]?.value) || 0))])
  );
}

/** Pergunta a quantidade a enviar (pula o diálogo quando só há 1). */
async function promptQty(itemName, max) {
  if (max <= 1) return 1;
  const result = await foundry.applications.api.DialogV2.wait({
    window: {
      title: loc("THM.SendToTitle", { item: itemName }),
      icon: "fa-solid fa-paper-plane"
    },
    content: `
      <div class="thm-dialog">
        <div class="form-group">
          <label>${loc("THM.SendQty", { max })}</label>
          <input type="number" name="qty" value="1" min="1" max="${max}" step="1" autofocus />
        </div>
      </div>`,
    rejectClose: false,
    buttons: [
      {
        action: "send",
        icon: "fa-solid fa-paper-plane",
        label: loc("THM.Send"),
        default: true,
        callback: (event, button) =>
          Math.floor(Number(button.form.elements.qty.value) || 0)
      },
      { action: "cancel", icon: "fa-solid fa-xmark", label: loc("THM.Cancel") }
    ]
  });
  if (result === null || result === "cancel") return null;
  const qty = Number(result);
  if (!(qty >= 1) || qty > max) {
    ui.notifications.warn(loc("THM.InvalidQty"));
    return null;
  }
  return qty;
}

/**
 * Diálogo "Enviar para..." de um item.
 * Origem: { sourceActor } (ficha) OU { stashFolderId } (inventário da party).
 * item: { id, name, maxQty }
 */
async function openSendItemDialog({ sourceActor = null, stashFolderId = null, item }) {
  const fromStash = !!stashFolderId;
  const folderId = fromStash ? stashFolderId : getPartyFolderIdOf(sourceActor);
  if (!folderId) return ui.notifications.warn(loc("THM.NoPartyForUser"));

  const members = getMembers(folderId).filter((a) => a.id !== sourceActor?.id);
  if (!members.length && fromStash) return ui.notifications.warn(loc("THM.NoMembers"));

  const max = Math.max(1, Number(item.maxQty) || 1);
  const stashOption = fromStash
    ? ""
    : `<option value="stash">${loc("THM.PartyStash")}</option>`;

  const content = `
    <div class="thm-dialog">
      <div class="form-group">
        <label>${loc("THM.SendToTarget")}</label>
        <select name="target">${memberOptionsHtml(members)}${stashOption}</select>
      </div>
      <div class="form-group">
        <label>${loc("THM.SendQty", { max })}</label>
        <input type="number" name="qty" value="1" min="1" max="${max}" step="1" />
      </div>
    </div>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: loc("THM.SendToTitle", { item: item.name }), icon: "fa-solid fa-paper-plane" },
    content,
    rejectClose: false,
    buttons: [
      {
        action: "send",
        icon: "fa-solid fa-paper-plane",
        label: loc("THM.Send"),
        default: true,
        callback: (event, button) => ({
          target: button.form.elements.target.value,
          qty: Math.floor(Number(button.form.elements.qty.value) || 0)
        })
      },
      { action: "cancel", icon: "fa-solid fa-xmark", label: loc("THM.Cancel") }
    ]
  });
  if (!result || result === "cancel") return;

  if (result.qty < 1 || result.qty > max) {
    return ui.notifications.warn(
      loc("THM.NotEnoughQty", {
        name: fromStash ? loc("THM.PartyStash") : sourceActor.name,
        item: item.name
      })
    );
  }

  const source = fromStash ? { stashFolderId: folderId } : { actorId: sourceActor.id };
  const target =
    result.target === "stash"
      ? { stashFolderId: folderId }
      : { actorId: result.target.slice(2) };

  await requestTransfer({ kind: "item", source, target, itemId: item.id, qty: result.qty });
}

/** Diálogo genérico de envio de dinheiro. */
async function openMoneyDialog({
  title,
  folderId, // pasta da party (resolve a opção "stash" dos selects)
  sourceChoices = null, // atores quando a origem é selecionável
  fixedSource = null, // endpoint fixo
  targetChoices = null, // membros selecionáveis como destino
  fixedTarget = null,
  maxCoins = null
}) {
  const sourceSelect = sourceChoices
    ? `
      <div class="form-group">
        <label>${loc("THM.SourceChar")}</label>
        <select name="source">${memberOptionsHtml(sourceChoices)}</select>
      </div>`
    : "";

  const targetSelect = targetChoices
    ? `
      <div class="form-group">
        <label>${loc("THM.SendToTarget")}</label>
        <select name="target">${memberOptionsHtml(targetChoices.members)}${targetChoices.includeStash ? `<option value="stash">${loc("THM.PartyStash")}</option>` : ""}</select>
      </div>`
    : "";

  const showTl =
    partyUsesPlatina(folderId) || (Number(maxCoins?.tl) || 0) > 0;

  const content = `
    <div class="thm-dialog">
      ${sourceSelect}
      ${targetSelect}
      <p class="thm-hint">${loc("THM.MoneyHint")}</p>
      ${coinInputsHtml(maxCoins, { showTl })}
    </div>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title, icon: "fa-solid fa-coins" },
    content,
    rejectClose: false,
    buttons: [
      {
        action: "send",
        icon: "fa-solid fa-paper-plane",
        label: loc("THM.Send"),
        default: true,
        callback: (event, button) => ({
          source: button.form.elements.source?.value ?? null,
          target: button.form.elements.target?.value ?? null,
          coins: readCoinsFromForm(button.form)
        })
      },
      { action: "cancel", icon: "fa-solid fa-xmark", label: loc("THM.Cancel") }
    ]
  });
  if (!result || result === "cancel") return;

  if (coinsTotal(result.coins) < 1) {
    return ui.notifications.warn(loc("THM.NoMoneySelected"));
  }

  const parseChoice = (value) =>
    value === "stash" ? { stashFolderId: folderId } : { actorId: value.slice(2) };

  const source = fixedSource ?? parseChoice(result.source);
  const target = fixedTarget ?? parseChoice(result.target);

  // Validação local de saldo (o GM revalida na execução)
  const srcActor = source.actorId ? game.actors.get(source.actorId) : null;
  const balance = source.stashFolderId
    ? getStashDataRaw(source.stashFolderId).money
    : srcActor
      ? getMoney(srcActor)
      : null;
  if (balance && COINS.some((k) => result.coins[k] > balance[k])) {
    return ui.notifications.warn(
      loc("THM.NotEnoughMoney", {
        name: source.stashFolderId ? loc("THM.PartyStash") : srcActor.name
      })
    );
  }

  await requestTransfer({ kind: "money", source, target, coins: result.coins });
}

/** Botão da ficha: enviar dinheiro do personagem para membro ou estoque. */
async function openSendMoneyDialog(actor) {
  const folderId = getPartyFolderIdOf(actor);
  if (!folderId) return ui.notifications.warn(loc("THM.NoPartyForUser"));

  const members = getMembers(folderId).filter(
    (a) => a.id !== actor.id && a.system?.dinheiro
  );

  await openMoneyDialog({
    title: loc("THM.SendMoneyTitle", { name: actor.name }),
    folderId,
    fixedSource: { actorId: actor.id },
    targetChoices: { members, includeStash: true },
    maxCoins: getMoney(actor)
  });
}

/* ============================================================
   PARTY SHEET
============================================================ */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/* ============================================================
   ITENS DO ESTOQUE — ver, editar, quantidade, excluir
============================================================ */

/** Visualização somente leitura de um item do estoque (todos os usuários). */
function previewStashItem(folderId, entryId) {
  const entry = getStashDataRaw(folderId).items.find((e) => e._id === entryId);
  if (!entry) return;
  const data = foundry.utils.deepClone(entry);
  delete data._id;
  // Documento temporário (não persiste): serve só para renderizar a ficha
  const temp = new Item.implementation(data);
  temp.sheet.render(true);
}

/**
 * (GM) Edita um item do estoque com a ficha REAL do sistema: cria um item
 * de mundo temporário, abre a ficha e, ao fechá-la, grava as mudanças de
 * volta na entrada do estoque e apaga o temporário.
 */
async function editStashItem(folderId, entryId) {
  if (!game.user.isGM) return;
  const entry = getStashDataRaw(folderId).items.find((e) => e._id === entryId);
  if (!entry) return;

  const data = foundry.utils.deepClone(entry);
  delete data._id;
  foundry.utils.setProperty(data, `flags.${FLAG_SCOPE}.stashEdit`, { folderId, entryId });
  const temp = await Item.implementation.create(data);
  if (!temp) return;

  const hookId = Hooks.on("closeItemSheet", async (app) => {
    if (app.document?.id !== temp.id) return;
    Hooks.off("closeItemSheet", hookId);
    try {
      const updated = temp.toObject();
      delete updated._id;
      delete updated.folder;
      delete updated.sort;
      // O item temporário pode ter nascido em qualquer um dos escopos.
      delete updated.flags?.[FLAG_SCOPE]?.stashEdit;
      delete updated.flags?.[FLAG_SCOPE_LEGADO]?.stashEdit;

      const stash = getStashData(folderId);
      const idx = stash.items.findIndex((e) => e._id === entryId);
      if (idx >= 0) {
        updated._id = entryId;
        stash.items[idx] = updated;
        await setStashData(folderId, stash);
      }
    } finally {
      await temp.delete();
    }
  });
  temp.sheet.render(true);
}

/** (GM) Remove itens temporários de edição órfãos (F5 com a ficha aberta). */
async function gmCleanupStashEditItems() {
  const orfaos = game.items.filter((i) => lerFlag(i, "stashEdit"));
  for (const item of orfaos) await item.delete().catch(() => {});
}

/** (GM) Altera diretamente a quantidade de uma entrada do estoque. */
async function changeStashItemQty(folderId, entryId) {
  if (!game.user.isGM) return;
  const entry = getStashDataRaw(folderId).items.find((e) => e._id === entryId);
  if (!entry) return;
  const atual = Number(entry.system?.qtd ?? 1) || 1;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: loc("THM.ChangeQtyTitle", { item: entry.name }), icon: "fa-solid fa-hashtag" },
    content: `<div class="thm-dialog">
      <div class="form-group">
        <label>${loc("THM.Quantity")}</label>
        <input type="number" name="qty" value="${atual}" min="0" step="1" autofocus />
      </div>
      <p class="thm-hint">${loc("THM.ChangeQtyHint")}</p>
    </div>`,
    rejectClose: false,
    buttons: [
      {
        action: "save",
        icon: "fa-solid fa-check",
        label: loc("THM.Save"),
        default: true,
        callback: (event, button) =>
          Math.max(0, Math.floor(Number(button.form.elements.qty.value) || 0))
      },
      { action: "cancel", icon: "fa-solid fa-xmark", label: loc("THM.Cancel") }
    ]
  });
  if (result === null || result === "cancel") return;

  const stash = getStashData(folderId);
  const idx = stash.items.findIndex((e) => e._id === entryId);
  if (idx < 0) return;
  if (result === 0) stash.items.splice(idx, 1);
  else stash.items[idx].system.qtd = result;
  await setStashData(folderId, stash);
}

/** (GM) Exclui uma entrada do estoque (a pilha inteira), com confirmação. */
async function deleteStashItem(folderId, entryId) {
  if (!game.user.isGM) return;
  const entry = getStashDataRaw(folderId).items.find((e) => e._id === entryId);
  if (!entry) return;
  const qtd = Number(entry.system?.qtd ?? 1) || 1;

  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: loc("THM.DeleteItemTitle") },
    content: `<p>${loc("THM.DeleteItemConfirm", { qty: qtd, item: esc(entry.name) })}</p>`,
    rejectClose: false
  });
  if (!ok) return;

  const stash = getStashData(folderId);
  stash.items = stash.items.filter((e) => e._id !== entryId);
  await setStashData(folderId, stash);
}

/* ============================================================
   FERRAMENTAS DO MESTRE (aba "Mestre" da Party Sheet)
============================================================ */

/** Card de chat no estilo do sistema (mesmo template dos descansos). */
async function postGmCard(title, img, html) {
  const content = {
    item: { name: title, img },
    system: { description: { value: html } }
  };
  const rendered = await foundry.applications.handlebars.renderTemplate(
    "systems/tormenta20/templates/chat/chat-card.hbs",
    content
  );
  return ChatMessage.create({
    user: game.user.id,
    type: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: rendered
  });
}

function memberChecksHtml(members, prefix = "m") {
  return members
    .map(
      (a) => `
      <label class="thm-check">
        <input type="checkbox" name="${prefix}-${a.id}" checked />
        <img src="${esc(a.img)}" alt="" /> ${esc(a.name)}
      </label>`
    )
    .join("");
}

function readCheckedMembers(form, members, prefix = "m") {
  return members.filter((a) => form.elements[`${prefix}-${a.id}`]?.checked);
}

/** (GM) Edita manualmente o dinheiro do estoque da party. */
async function openEditStashMoneyDialog(folderId) {
  if (!game.user.isGM) return;
  const money = getStashDataRaw(folderId).money;
  const showTl = partyUsesPlatina(folderId);
  const keys = showTl ? COINS : COINS.filter((k) => k !== "tl");

  const inputs = keys
    .map(
      (k) => `
      <div class="form-group">
        <label>${loc(COIN_NAMES[k])}</label>
        <input type="number" name="coin-${k}" value="${money[k]}" min="0" step="1" />
      </div>`
    )
    .join("");

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: loc("THM.EditStashMoneyTitle"), icon: "fa-solid fa-pen" },
    position: { width: 340 },
    content: `<div class="thm-dialog">${inputs}
      <p class="thm-hint">${loc("THM.EditStashMoneyHint")}</p></div>`,
    rejectClose: false,
    buttons: [
      {
        action: "save",
        icon: "fa-solid fa-check",
        label: loc("THM.Save"),
        default: true,
        callback: (event, button) => readCoinsFromForm(button.form)
      },
      { action: "cancel", icon: "fa-solid fa-xmark", label: loc("THM.Cancel") }
    ]
  });
  if (!result || result === "cancel") return;

  const stash = getStashData(folderId);
  stash.money = { ...stash.money, ...result };
  if (!showTl) stash.money.tl = getStashData(folderId).money.tl;
  await setStashData(folderId, stash);
}

/** (GM) Distribui dinheiro para membros da party (recompensas). */
async function openDistributeMoneyDialog(folderId) {
  if (!game.user.isGM) return;
  const members = getMembers(folderId).filter((a) => a.system?.dinheiro);
  if (!members.length) return ui.notifications.warn(loc("THM.NoMembers"));
  const showTl = partyUsesPlatina(folderId);

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: loc("THM.DistributeMoneyTitle"), icon: "fa-solid fa-hand-holding-dollar" },
    position: { width: 420 },
    content: `<div class="thm-dialog">
      <p class="thm-hint">${loc("THM.DistributeMoneyHint")}</p>
      ${coinInputsHtml(null, { showTl })}
      <div class="form-group">
        <label>${loc("THM.DistributeMode")}</label>
        <select name="mode">
          <option value="igual" selected>${loc("THM.DistributeModeEqual")}</option>
          <option value="cada">${loc("THM.DistributeModeEach")}</option>
        </select>
      </div>
      <fieldset class="thm-fieldset"><legend>${loc("THM.DistributeWho")}</legend>
        <div class="thm-check-list">${memberChecksHtml(members)}</div>
      </fieldset>
    </div>`,
    rejectClose: false,
    buttons: [
      {
        action: "apply",
        icon: "fa-solid fa-check",
        label: loc("THM.Distribute"),
        default: true,
        callback: (event, button) => ({
          coins: readCoinsFromForm(button.form),
          mode: button.form.elements.mode.value,
          ids: readCheckedMembers(button.form, members).map((a) => a.id)
        })
      },
      { action: "cancel", icon: "fa-solid fa-xmark", label: loc("THM.Cancel") }
    ]
  });
  if (!result || result === "cancel") return;

  const alvo = members.filter((a) => result.ids.includes(a.id));
  if (!alvo.length) return ui.notifications.warn(loc("THM.NoneSelected"));
  if (coinsTotal(result.coins) <= 0) return ui.notifications.warn(loc("THM.NothingToGive"));

  // Modo "igual": divide o total entre os marcados; a sobra vai ao estoque.
  // Modo "cada": cada marcado recebe exatamente o valor digitado.
  let porMembro = result.coins;
  const sobra = Object.fromEntries(COINS.map((k) => [k, 0]));
  if (result.mode === "igual") {
    porMembro = {};
    for (const k of COINS) {
      porMembro[k] = Math.floor((result.coins[k] || 0) / alvo.length);
      sobra[k] = (result.coins[k] || 0) - porMembro[k] * alvo.length;
    }
  }

  for (const actor of alvo) {
    if (lojaCompatEnabled()) markLojaSuppress(actor.id);
    const atual = getMoney(actor);
    const updates = {};
    for (const k of COINS) {
      if (porMembro[k]) updates[`system.dinheiro.${k}`] = atual[k] + porMembro[k];
    }
    if (!foundry.utils.isEmpty(updates)) await actor.update(updates);
  }

  let restoTxt = "";
  if (coinsTotal(sobra) > 0) {
    const stash = getStashData(folderId);
    for (const k of COINS) stash.money[k] += sobra[k];
    await setStashData(folderId, stash);
    restoTxt = `<br><em>${loc("THM.DistributeRemainder", { coins: coinsLabel(sobra) })}</em>`;
  }

  await postGmCard(
    loc("THM.DistributeMoneyTitle"),
    "icons/svg/chest.svg",
    `<p>${loc("THM.DistributeChat", {
      coins: coinsLabel(porMembro) || "0",
      names: alvo.map((a) => esc(a.name)).join(", ")
    })}${restoTxt}</p>`
  );
}

/** Rótulos de qualidade de descanso do sistema (T20: 0.5/1/2/3 por nível). */
const REST_QUALITIES = [
  { value: 0.5, key: "THM.RestPoor" },
  { value: 1, key: "THM.RestNormal" },
  { value: 2, key: "THM.RestComfortable" },
  { value: 3, key: "THM.RestLuxurious" }
];

/** (GM) Descanso para a party, personalizável por membro. */
async function openPartyRestDialog(folderId) {
  if (!game.user.isGM) return;
  const members = getMembers(folderId).filter((a) => a.type === "character");
  if (!members.length) return ui.notifications.warn(loc("THM.NoMembers"));
  const nivelDe = (a) => Number(a.system?.attributes?.nivel?.value) || 1;

  const qualidadeOpts = (sel = 1) =>
    REST_QUALITIES.map(
      (q) => `<option value="${q.value}" ${q.value === sel ? "selected" : ""}>${loc(q.key)}</option>`
    ).join("");

  /* Os rótulos ficam DENTRO de cada campo (coluna própria), então o
   * alinhamento é automático — sem cabeçalho separado para desalinhar. */
  const campos = (id, { toolbar = false } = {}) => `
    <label class="thm-field">
      <span>${loc("THM.RestQuality")}</span>
      <select name="q-${id}">${toolbar ? `<option value="" selected>—</option>` : ""}${qualidadeOpts(toolbar ? null : 1)}</select>
    </label>
    <label class="thm-field">
      <span>${loc("THM.RestExtraPVShort")}</span>
      <input type="number" name="pv-${id}" value="${toolbar ? "" : 0}" step="1" ${toolbar ? 'placeholder="—"' : ""} />
    </label>
    <label class="thm-field">
      <span>${loc("THM.RestExtraPMShort")}</span>
      <input type="number" name="pm-${id}" value="${toolbar ? "" : 0}" step="1" ${toolbar ? 'placeholder="—"' : ""} />
    </label>`;

  const cards = members
    .map(
      (a) => `
      <div class="thm-rest-card" data-actor-id="${a.id}">
        <label class="thm-rest-who">
          <input type="checkbox" name="m-${a.id}" checked />
          <img src="${esc(a.img)}" alt="" />
          <span class="thm-rest-name">${esc(a.name)}
            <small>${loc("THM.Level")} ${nivelDe(a)}</small></span>
          <span class="thm-rest-preview" data-preview="${a.id}"></span>
        </label>
        <div class="thm-rest-line">${campos(a.id)}</div>
      </div>`
    )
    .join("");

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: loc("THM.PartyRestTitle"), icon: "fa-solid fa-bed" },
    position: { width: 540 },
    content: `<div class="thm-dialog thm-rest">
      <div class="thm-rest-toolbar">
        <span class="thm-rest-toolbar-label"><i class="fa-solid fa-wand-magic-sparkles"></i> ${loc("THM.RestApplyAll")}</span>
        <div class="thm-rest-line">${campos("all", { toolbar: true })}</div>
      </div>
      ${cards}
      <p class="thm-hint">${loc("THM.RestPreviewHint")}</p>
    </div>`,
    rejectClose: false,
    render: (event, dialog) => {
      const el = dialog.element;
      const $ = (name) => el.querySelector(`[name="${name}"]`);

      /* Prévia ao vivo — mesma fórmula do descanso do sistema:
       * floor(nível × (condição + extra)). */
      const atualizar = () => {
        for (const a of members) {
          const nivel = nivelDe(a);
          const q = parseFloat($(`q-${a.id}`).value) || 1;
          const pv = Math.floor(Number($(`pv-${a.id}`).value) || 0);
          const pm = Math.floor(Number($(`pm-${a.id}`).value) || 0);
          const rPV = Math.floor(nivel * (q + pv));
          const rPM = Math.floor(nivel * (q + pm));
          const alvo = el.querySelector(`[data-preview="${a.id}"]`);
          if (alvo) alvo.innerHTML =
            `<b class="thm-pv-txt">+${rPV} PV</b><b class="thm-pm-txt">+${rPM} PM</b>`;
        }
      };

      /* Barra "aplicar a todos": replica o campo alterado em cada card. */
      $("q-all")?.addEventListener("change", (ev) => {
        if (ev.currentTarget.value === "") return;
        members.forEach((a) => ($(`q-${a.id}`).value = ev.currentTarget.value));
        atualizar();
      });
      for (const campo of ["pv", "pm"]) {
        $(`${campo}-all`)?.addEventListener("change", (ev) => {
          if (ev.currentTarget.value === "") return;
          members.forEach((a) => ($(`${campo}-${a.id}`).value = ev.currentTarget.value));
          atualizar();
        });
      }

      el.addEventListener("change", atualizar);
      el.addEventListener("input", atualizar);
      atualizar();
    },
    buttons: [
      {
        action: "rest",
        icon: "fa-solid fa-bed",
        label: loc("THM.Rest"),
        default: true,
        callback: (event, button) => {
          const f = button.form;
          return {
            membros: readCheckedMembers(f, members).map((a) => ({
              id: a.id,
              qualidade: parseFloat(f.elements[`q-${a.id}`].value) || 1,
              modPV: Math.floor(Number(f.elements[`pv-${a.id}`].value) || 0),
              modPM: Math.floor(Number(f.elements[`pm-${a.id}`].value) || 0)
            }))
          };
        }
      },
      { action: "cancel", icon: "fa-solid fa-xmark", label: loc("THM.Cancel") }
    ]
  });
  if (!result || result === "cancel" || !result.membros?.length) return;

  /* Aplica e mede a recuperação REAL (diferença antes/depois, já
   * respeitando o máximo) para o relatório no chat. */
  const relatorio = [];
  for (const cfg of result.membros) {
    const actor = game.actors.get(cfg.id);
    if (!actor) continue;
    const antesPV = Number(actor.system.attributes.pv.value) || 0;
    const antesPM = Number(actor.system.attributes.pm.value) || 0;
    // Mesma chamada que o RestConfigDialog do sistema usa
    await actor.descanso(cfg.qualidade, cfg.modPV, cfg.modPM, false, false, false);
    const pv = actor.system.attributes.pv;
    const pm = actor.system.attributes.pm;
    const q = REST_QUALITIES.find((x) => x.value === cfg.qualidade);
    const extras = [
      q ? loc(q.key) : cfg.qualidade,
      cfg.modPV ? `+${cfg.modPV} PV/nível` : null,
      cfg.modPM ? `+${cfg.modPM} PM/nível` : null
    ].filter(Boolean).join(", ");
    relatorio.push({
      name: actor.name,
      img: actor.img,
      pv: (Number(pv.value) || 0) - antesPV,
      pm: (Number(pm.value) || 0) - antesPM,
      pvCheio: Number(pv.value) >= Number(pv.max),
      pmCheio: Number(pm.value) >= Number(pm.max),
      extras
    });
  }

  const linhasHtml = relatorio
    .map(
      (r) => `
      <tr>
        <td class="thm-rc-who"><img src="${esc(r.img)}" alt="" />
          <div>${esc(r.name)}<small>${esc(r.extras)}</small></div></td>
        <td class="thm-rc-pv">+${r.pv} PV${r.pvCheio ? " ✦" : ""}</td>
        <td class="thm-rc-pm">+${r.pm} PM${r.pmCheio ? " ✦" : ""}</td>
      </tr>`
    )
    .join("");
  await postGmCard(
    loc("THM.PartyRestTitle"),
    "icons/svg/regen.svg",
    `<table class="thm-rest-chat"><tbody>${linhasHtml}</tbody></table>
     <p class="thm-rc-note">✦ ${loc("THM.RestFullNote")}</p>`
  );
}

/** Modos de rolagem oferecidos ao pedir um teste. */
const ROLL_MODES = [
  { value: "publicroll", key: "THM.RollPublic" },
  { value: "gmroll", key: "THM.RollGm" },
  { value: "blindroll", key: "THM.RollBlind" },
  { value: "selfroll", key: "THM.RollSelf" }
];

/**
 * (Cliente do jogador) Abre a janela de rolagem da perícia pedida pelo
 * Mestre. O modo de rolagem escolhido pelo Mestre vira o padrão do
 * diálogo; a janela de configuração é forçada a abrir independentemente
 * da preferência local de UsageConfig.
 */
async function handleSkillRequest({ actorId, skill, rollMode, requester }) {
  const actor = game.actors.get(actorId);
  if (!actor?.isOwner) return;
  const label = actor.system?.pericias?.[skill]?.label ?? CONFIG.T20?.pericias?.[skill]?.label ?? skill;
  ui.notifications.info(loc("THM.SkillRequestNotify", { requester, skill: label }));

  // UsageConfig "default": diálogo abre SEM shift; invertido: abre COM shift.
  const usage = game.settings.get("tormenta20", "UsageConfig");
  const event = { shiftKey: usage !== "default" };

  const anterior = game.settings.get("core", "rollMode");
  try {
    if (rollMode) await game.settings.set("core", "rollMode", rollMode);
    await actor.rollPericia(skill, { event, message: true });
  } finally {
    await game.settings.set("core", "rollMode", anterior);
  }
}

/** (GM) Pede um teste de perícia para membros escolhidos da party. */
async function openSkillRequestDialog(folderId) {
  if (!game.user.isGM) return;
  const members = getMembers(folderId).filter((a) => a.system?.pericias);
  if (!members.length) return ui.notifications.warn(loc("THM.NoMembers"));

  const pericias = Object.entries(CONFIG.T20?.pericias ?? {})
    .map(([k, v]) => ({ key: k, label: v.label ?? k }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  const perOpts = pericias
    .map((p) => `<option value="${p.key}">${esc(p.label)}</option>`)
    .join("");
  const modeOpts = ROLL_MODES.map(
    (m) => `<option value="${m.value}">${loc(m.key)}</option>`
  ).join("");

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: loc("THM.SkillRequestTitle"), icon: "fa-solid fa-dice-d20" },
    position: { width: 420 },
    content: `<div class="thm-dialog">
      <div class="form-group">
        <label>${loc("THM.SkillRequestSkill")}</label>
        <select name="skill">${perOpts}</select>
      </div>
      <div class="form-group">
        <label>${loc("THM.SkillRequestMode")}</label>
        <select name="mode">${modeOpts}</select>
      </div>
      <fieldset class="thm-fieldset"><legend>${loc("THM.SkillRequestWho")}</legend>
        <div class="thm-check-list">${memberChecksHtml(members)}</div>
      </fieldset>
      <p class="thm-hint">${loc("THM.SkillRequestHint")}</p>
    </div>`,
    rejectClose: false,
    buttons: [
      {
        action: "ask",
        icon: "fa-solid fa-dice-d20",
        label: loc("THM.SkillRequestAsk"),
        default: true,
        callback: (event, button) => ({
          skill: button.form.elements.skill.value,
          mode: button.form.elements.mode.value,
          ids: readCheckedMembers(button.form, members).map((a) => a.id)
        })
      },
      { action: "cancel", icon: "fa-solid fa-xmark", label: loc("THM.Cancel") }
    ]
  });
  if (!result || result === "cancel") return;

  const alvo = members.filter((a) => result.ids.includes(a.id));
  if (!alvo.length) return ui.notifications.warn(loc("THM.NoneSelected"));

  const label = CONFIG.T20?.pericias?.[result.skill]?.label ?? result.skill;
  await postGmCard(
    loc("THM.SkillRequestTitle"),
    "icons/svg/dice-target.svg",
    `<p>${loc("THM.SkillRequestChat", {
      skill: esc(label),
      names: alvo.map((a) => esc(a.name)).join(", ")
    })}</p>`
  );

  for (const actor of alvo) {
    const payload = {
      actorId: actor.id,
      skill: result.skill,
      rollMode: result.mode,
      requester: game.user.name
    };
    const owner = activeOwnerOf(actor, { excludeUserId: game.user.id });
    if (owner && socket) {
      // Dispara no cliente do jogador; erros não travam os demais pedidos
      socket.executeAsUser("skillRequest", owner.id, payload).catch((err) =>
        console.warn(`${MODULE_ID} | Falha ao pedir teste para ${actor.name}`, err)
      );
    } else {
      // Sem jogador online: o próprio Mestre rola pelo personagem
      await handleSkillRequest(payload);
    }
  }
}

/* ============================================================
   CARTÃO DE MEMBRO — estatísticas derivadas (Defesa, testes, sentidos)
============================================================ */

/** Sentidos do sistema (CONFIG.T20.senses): chave → chave de tradução + ícone. */
const SENSE_META = {
  escuro: { label: "T20.SenseDarkVision", icon: "fa-moon" },
  penumbra: { label: "T20.SenseDimVision", icon: "fa-cloud-moon" },
  cegas: { label: "T20.SenseBlindSight", icon: "fa-eye-slash" },
  faro: { label: "T20.SenseScent", icon: "fa-wind" }
};

/** Valor de perícia formatado com sinal (+N / -N), para testes de resistência. */
function periciaSinal(actor, key) {
  const v = Math.round(Number(actor.system?.pericias?.[key]?.value)) || 0;
  return v >= 0 ? `+${v}` : `${v}`;
}

/** Sentidos do ator (lista de {icon, label}) — combina sentidos padrão e customizados. */
function sentidosDoMembro(actor) {
  const sentidos = actor.system?.attributes?.sentidos ?? {};
  const chaves = Array.isArray(sentidos.value) ? sentidos.value : [];
  const lista = chaves
    .filter((k) => SENSE_META[k])
    .map((k) => ({ icon: SENSE_META[k].icon, label: loc(SENSE_META[k].label) }));
  if (sentidos.custom) lista.push({ icon: "fa-star", label: sentidos.custom });
  return lista;
}

/** Ordem e rótulos dos tipos de deslocamento (mesma ordem da ficha do sistema). */
const MOVEMENT_ORDER = ["walk", "climb", "burrow", "swim", "fly"];
const MOVEMENT_LABELS = {
  climb: "T20.MovementClimb",
  burrow: "T20.MovementBurrow",
  swim: "T20.MovementSwim",
  fly: "T20.MovementFly"
};

/**
 * Deslocamentos do ator: `.maxLabel` é o maior valor com a unidade (para o
 * selo do cartão); `.linhas` lista cada deslocamento com nome, valor e
 * unidade (para o template montar a dica ao passar o mouse — cada linha é
 * escapada pelo próprio Handlebars na interpolação, sem HTML pré-montado
 * aqui). Usa `system.attributes.movement[tipo].value`, já com bônus e
 * penalidades de armadura, carga e condições aplicados pelo sistema.
 */
function movimentosDoMembro(actor) {
  const movement = actor.system?.attributes?.movement ?? {};
  const unit = movement.unit || "m";
  const linhas = [];
  let max = 0;
  let maxLabel = `0${unit}`;

  for (const tipo of MOVEMENT_ORDER) {
    const valor = Number(movement[tipo]?.value) || 0;
    if (valor <= 0) continue;
    if (valor > max) {
      max = valor;
      maxLabel = `${valor}${unit}`;
    }
    const nome = tipo === "walk" ? "" : loc(MOVEMENT_LABELS[tipo]);
    let linha = `${nome} ${valor}${unit}`.trim();
    // "(Flutuando)" é texto fixo (não localizado) no próprio sistema Tormenta20
    if (tipo === "fly" && movement.hover) linha += " (Flutuando)";
    linhas.push(linha);
  }

  return { max, maxLabel, linhas };
}

class PartySheetApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {Map<string, PartySheetApp>} */
  static instances = new Map();

  constructor(folderId, options = {}) {
    super({ ...options, id: `thm-party-${folderId}` });
    this.folderId = folderId;
    this.queueRender = foundry.utils.debounce(() => {
      if (this.rendered) this.render();
    }, 150);
    PartySheetApp.instances.set(folderId, this);
  }

  static DEFAULT_OPTIONS = {
    classes: ["thm-party-sheet"],
    window: {
      icon: "fa-solid fa-users",
      resizable: true,
      controls: [
        {
          icon: "fa-solid fa-users-gear",
          label: "THM.Config",
          action: "openConfig"
        }
      ]
    },
    position: { width: 500, height: 620 },
    actions: {
      changeTab: PartySheetApp.#onChangeTab,
      openActor: PartySheetApp.#onOpenActor,
      depositMoney: PartySheetApp.#onDepositMoney,
      withdrawMoney: PartySheetApp.#onWithdrawMoney,
      sendStashItem: PartySheetApp.#onSendStashItem,
      openConfig: PartySheetApp.#onOpenConfig,
      editStashMoney: PartySheetApp.#onEditStashMoney,
      gmDistribute: PartySheetApp.#onGmDistribute,
      gmRest: PartySheetApp.#onGmRest,
      gmSkillTest: PartySheetApp.#onGmSkillTest,
      gmTreasure: PartySheetApp.#onGmTreasure,
      editStashItem: PartySheetApp.#onEditStashItem,
      deleteStashItem: PartySheetApp.#onDeleteStashItem
    }
  };

  static PARTS = {
    body: { template: `modules/${ASSET_MODULE_ID}/templates/management/party-sheet.hbs` }
  };

  tabGroups = { primary: "members" };

  get title() {
    const folder = game.folders.get(this.folderId);
    return `${loc("THM.PartySheet")} — ${folder?.name ?? "?"}`;
  }

  _getHeaderControls() {
    const controls = super._getHeaderControls();
    return game.user.isGM ? controls : controls.filter((c) => c.action !== "openConfig");
  }

  async _prepareContext() {
    const visibility = game.user.isGM
      ? "values"
      : lerConfig("visibility");

    const memberActors = getMembers(this.folderId);
    const members = memberActors.map((a) => {
      const pv = a.system?.attributes?.pv ?? {};
      const pm = a.system?.attributes?.pm ?? {};
      const bar = (res) => {
        const value = Number(res.value) || 0;
        const max = Number(res.max) || 0;
        const pct = max > 0 ? Math.round(Math.clamp((value / max) * 100, 0, 100)) : 0;
        const label = visibility === "values" ? `${value}/${max}` : `${pct}%`;
        return { pct, label };
      };
      const carga = a.system?.attributes?.carga ?? null;
      const cargaData =
        carga && Number(carga.max) > 0
          ? {
              pct: Math.round(Math.clamp(Number(carga.pct) || 0, 0, 100)),
              encumbered: !!carga.encumbered,
              label: loc("THM.EncumbranceLabel", {
                value: Number(carga.value) || 0,
                max: Number(carga.max) || 0,
                limit: Number(carga.limit) || 0
              })
            }
          : null;
      return {
        id: a.id,
        name: a.name,
        img: a.img,
        level: a.type === "character" ? (a.system?.attributes?.nivel?.value ?? null) : null,
        pv: bar(pv),
        pm: bar(pm),
        carga: cargaData,
        defesa: Number(a.system?.attributes?.defesa?.value) || 0,
        fort: periciaSinal(a, "fort"),
        refl: periciaSinal(a, "refl"),
        vont: periciaSinal(a, "vont"),
        percepcao: periciaSinal(a, "perc"),
        iniciativa: periciaSinal(a, "inic"),
        sentidos: sentidosDoMembro(a),
        desloc: movimentosDoMembro(a)
      };
    });

    // Estoque oculto da party (flag na pasta — nenhum ator envolvido)
    const stashData = getStashDataRaw(this.folderId);
    const items = stashData.items
      .slice()
      .sort(
        (a, b) =>
          INVENTORY_TYPES.indexOf(a.type) - INVENTORY_TYPES.indexOf(b.type) ||
          a.name.localeCompare(b.name, "pt-BR")
      )
      .map((e) => ({
        id: e._id,
        name: e.name,
        img: e.img,
        qtd: Number(e.system?.qtd ?? 1) || 1,
        typeLabel: game.i18n.localize(CONFIG.Item.typeLabels[e.type] ?? e.type)
      }));

    return {
      tab: this.tabGroups.primary,
      hideBars: visibility === "hidden",
      isGM: game.user.isGM,
      members,
      items,
      money: stashData.money,
      // Mesma lógica de partyUsesPlatina, reusando os dados já obtidos —
      // a chamada refazia a varredura de atores e o clone do estoque
      showTl: stashData.money.tl > 0 ||
        memberActors.some((a) => !!a.getFlag("tormenta20", "sheet.mostrarPlatina"))
    };
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    const entryIdOf = (el) =>
      el.dataset?.itemId ?? el.closest?.("[data-item-id]")?.dataset.itemId;
    new foundry.applications.ux.ContextMenu.implementation(
      this.element,
      ".thm-inv-item",
      [
        {
          name: loc("THM.SendTo"),
          icon: '<i class="fa-solid fa-paper-plane"></i>',
          callback: (el) => this.#sendStashItem(entryIdOf(el))
        },
        {
          name: loc("THM.ViewItem"),
          icon: '<i class="fa-solid fa-eye"></i>',
          callback: (el) => previewStashItem(this.folderId, entryIdOf(el))
        },
        {
          name: loc("THM.EditItem"),
          icon: '<i class="fa-solid fa-pen"></i>',
          condition: () => game.user.isGM,
          callback: (el) => editStashItem(this.folderId, entryIdOf(el))
        },
        {
          name: loc("THM.ChangeQty"),
          icon: '<i class="fa-solid fa-hashtag"></i>',
          condition: () => game.user.isGM,
          callback: (el) => changeStashItemQty(this.folderId, entryIdOf(el))
        },
        {
          name: loc("THM.DeleteItem"),
          icon: '<i class="fa-solid fa-trash"></i>',
          condition: () => game.user.isGM,
          callback: (el) => deleteStashItem(this.folderId, entryIdOf(el))
        }
      ],
      { jQuery: false }
    );

    // Arrastar uma linha do inventário da party para fora (ficha de ator)
    this.element.addEventListener("dragstart", (ev) => {
      const row = ev.target?.closest?.(".thm-inv-item");
      if (!row) return;
      ev.dataTransfer.setData(
        "text/plain",
        JSON.stringify({
          type: "Item",
          thmStash: { folderId: this.folderId, entryId: row.dataset.itemId }
        })
      );
    });

    // Soltar um item de ficha aqui dentro = depositar no inventário da party
    this.element.addEventListener("dragover", (ev) => ev.preventDefault());
    this.element.addEventListener("drop", (ev) => this.#onDropIntoSheet(ev));
  }

  async #onDropIntoSheet(event) {
    event.preventDefault();
    const data =
      foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data?.type !== "Item" || data.thmStash || !data.uuid) return;

    // fromUuid assíncrono: resolve também itens de compêndio
    const item = await fromUuid(data.uuid);
    if (!item || !INVENTORY_TYPES.includes(item.type)) return;
    const actor = item.parent;

    /* Item de compêndio ou do diretório do mundo (sem ator dono):
     * apenas o Mestre pode criá-lo direto no inventário da party. */
    if (!(actor instanceof Actor)) {
      if (!game.user.isGM) {
        return ui.notifications.warn(loc("THM.CompendiumDropGmOnly"));
      }
      const qty = await promptFreeQty(item.name);
      if (!qty) return;
      await stashAddItem(this.folderId, item.toObject(), qty);
      return ui.notifications.info(
        loc("THM.CompendiumDropDone", { qty, item: item.name })
      );
    }

    if (!actor.isOwner) return;
    if (!game.user.isGM && getPartyFolderIdOf(actor) !== this.folderId) {
      return ui.notifications.warn(loc("THM.NoPartyForUser"));
    }

    const max = Math.max(1, Number(item.system.qtd ?? 1) || 1);
    const qty = await promptQty(item.name, max);
    if (!qty) return;

    await requestTransfer({
      kind: "item",
      source: actorEndpoint(actor),
      target: { stashFolderId: this.folderId },
      itemId: item.id,
      qty
    });
  }

  #sendStashItem(itemId) {
    const entry = getStashDataRaw(this.folderId).items.find((e) => e._id === itemId);
    if (!entry) return;
    openSendItemDialog({
      stashFolderId: this.folderId,
      item: {
        id: entry._id,
        name: entry.name,
        maxQty: Number(entry.system?.qtd ?? 1) || 1
      }
    });
  }

  static #onChangeTab(event, target) {
    this.changeTab(target.dataset.tab, target.dataset.group ?? "primary");
  }

  static #onOpenActor(event, target) {
    const actor = game.actors.get(target.dataset.actorId);
    if (!actor) return;
    if (actor.testUserPermission(game.user, "LIMITED")) actor.sheet.render(true);
  }

  static #onDepositMoney() {
    const own = getMembers(this.folderId).filter(
      (a) => a.isOwner && a.system?.dinheiro
    );
    if (!own.length) return ui.notifications.warn(loc("THM.NoPartyForUser"));
    openMoneyDialog({
      title: loc("THM.DepositMoneyTitle"),
      folderId: this.folderId,
      sourceChoices: own,
      fixedTarget: { stashFolderId: this.folderId },
      maxCoins: own.length === 1 ? getMoney(own[0]) : null
    });
  }

  static #onWithdrawMoney() {
    const members = getMembers(this.folderId).filter((a) => a.system?.dinheiro);
    if (!members.length) return ui.notifications.warn(loc("THM.NoMembers"));
    openMoneyDialog({
      title: loc("THM.WithdrawMoneyTitle"),
      folderId: this.folderId,
      fixedSource: { stashFolderId: this.folderId },
      targetChoices: { members, includeStash: false },
      maxCoins: getStashDataRaw(this.folderId).money
    });
  }

  static #onSendStashItem(event, target) {
    this.#sendStashItem(target.dataset.itemId);
  }

  static #onOpenConfig() {
    if (game.user.isGM) new PartyManagerApp().render(true);
  }

  static #onEditStashMoney() {
    openEditStashMoneyDialog(this.folderId);
  }

  static #onGmDistribute() {
    openDistributeMoneyDialog(this.folderId);
  }

  static #onGmRest() {
    openPartyRestDialog(this.folderId);
  }

  static #onGmSkillTest() {
    openSkillRequestDialog(this.folderId);
  }

  static #onGmTreasure() {
    abrirGeradorTesouros({ estoqueFolderId: this.folderId });
  }

  static #onEditStashItem(event, target) {
    editStashItem(this.folderId, target.dataset.itemId);
  }

  static #onDeleteStashItem(event, target) {
    deleteStashItem(this.folderId, target.dataset.itemId);
  }
}

/** Quantidade livre (sem máximo) para criar itens de compêndio no estoque. */
async function promptFreeQty(itemName) {
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: loc("THM.SendToTitle", { item: itemName }), icon: "fa-solid fa-boxes-stacked" },
    content: `
      <div class="thm-dialog">
        <div class="form-group">
          <label>${loc("THM.Quantity")}</label>
          <input type="number" name="qty" value="1" min="1" step="1" autofocus />
        </div>
      </div>`,
    rejectClose: false,
    buttons: [
      {
        action: "add",
        icon: "fa-solid fa-plus",
        label: loc("THM.Confirm"),
        default: true,
        callback: (event, button) =>
          Math.floor(Number(button.form.elements.qty.value) || 0)
      },
      { action: "cancel", icon: "fa-solid fa-xmark", label: loc("THM.Cancel") }
    ]
  });
  if (result === null || result === "cancel") return null;
  return Number(result) >= 1 ? Number(result) : null;
}

/** Abre a party sheet adequada ao usuário (com escolha se houver várias). */
async function openPartySheet() {
  const folderIds = getPartiesForUser();
  if (!folderIds.length) {
    return ui.notifications.warn(
      loc(game.user.isGM ? "THM.NoPartiesConfigured" : "THM.NoPartyForUser")
    );
  }

  let folderId = folderIds[0];
  if (folderIds.length > 1) {
    const options = folderIds
      .map(
        (fid) =>
          `<option value="${fid}">${esc(game.folders.get(fid)?.name ?? "?")}</option>`
      )
      .join("");
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: loc("THM.ChooseParty"), icon: "fa-solid fa-users" },
      content: `
        <div class="thm-dialog">
          <p class="thm-hint">${loc("THM.ChoosePartyHint")}</p>
          <div class="form-group">
            <select name="party">${options}</select>
          </div>
        </div>`,
      rejectClose: false,
      buttons: [
        {
          action: "open",
          icon: "fa-solid fa-users",
          label: loc("THM.OpenPartySheet"),
          default: true,
          callback: (event, button) => button.form.elements.party.value
        },
        { action: "cancel", icon: "fa-solid fa-xmark", label: loc("THM.Cancel") }
      ]
    });
    if (!choice || choice === "cancel") return;
    folderId = choice;
  }

  const app = PartySheetApp.instances.get(folderId) ?? new PartySheetApp(folderId);
  app.render(true);
}

/** Re-renderiza party sheets abertas quando algo relevante muda. */
function refreshPartyApps(relatedActor = null) {
  /* A classificação do ator (pasta de party/estoque) não depende do app:
   * computa UMA vez, e só quando existe alguma ficha renderizada — este
   * hook roda a cada updateActor/CRUD de item do mundo inteiro. */
  let fid, stashFid, classificado = false;
  for (const app of PartySheetApp.instances.values()) {
    if (!app.rendered) continue;
    if (relatedActor) {
      if (!classificado) {
        fid = getPartyFolderIdOf(relatedActor);
        stashFid = stashPartyFolderId(relatedActor);
        classificado = true;
      }
      if (fid !== app.folderId && stashFid !== app.folderId) continue;
    }
    app.queueRender();
  }
}

/* ============================================================
   GERENCIADOR DE PARTIES (menu de configurações, só GM)
============================================================ */

class PartyManagerApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "thm-party-manager",
    tag: "form",
    classes: ["thm-party-manager", "standard-form"],
    window: { title: "THM.PartyManagerTitle", icon: "fa-solid fa-users-gear" },
    position: { width: 420 },
    form: { handler: PartyManagerApp.#onSubmit, closeOnSubmit: true },
    actions: { createFolder: PartyManagerApp.#onCreateFolder }
  };

  static PARTS = {
    body: { template: `modules/${ASSET_MODULE_ID}/templates/management/party-manager.hbs` }
  };

  async _preFirstRender(context, options) {
    await super._preFirstRender(context, options);
    // O menu de configurações cria uma instância nova a cada clique;
    // fecha qualquer janela anterior com o mesmo id.
    const existing = foundry.applications.instances.get(this.id);
    if (existing && existing !== this) await existing.close();
  }

  async _prepareContext() {
    const parties = getPartiesSetting();
    const folders = [];
    // partyAncestor: party registrada mais próxima acima na árvore — suas
    // subpastas ganham o toggle de inclusão na party
    const walk = (parent, depth, partyAncestor) => {
      const children = game.folders
        .filter((f) => f.type === "Actor" && (f.folder?.id ?? null) === parent)
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name, "pt-BR"));
      for (const f of children) {
        const isParty = !!parties[f.id];
        const subDe = !isParty && partyAncestor ? partyAncestor : null;
        folders.push({
          id: f.id,
          name: f.name,
          indent: 4 + depth * 16,
          color: f.color?.css ?? "#c9a66b",
          isParty,
          subDe,
          incluida: subDe
            ? !(parties[subDe].subpastasExcluidas ?? []).includes(f.id)
            : false
        });
        walk(f.id, depth + 1, isParty ? f.id : partyAncestor);
      }
    };
    walk(null, 0, null);
    return { folders };
  }

  static async #onSubmit(event, form, formData) {
    const data = formData.object;
    const current = getPartiesSetting();
    const next = {};
    for (const [key, value] of Object.entries(data)) {
      if (!key.startsWith("party.") || !value) continue;
      const folderId = key.slice(6);
      next[folderId] = current[folderId] ?? {};
    }
    // Toggles de subpasta: desmarcada → entra na lista de exclusão da party
    const exclusoes = {};
    for (const [key, value] of Object.entries(data)) {
      if (!key.startsWith("sub.")) continue;
      const [, partyId, subId] = key.split(".");
      if (!next[partyId] || value) continue;
      (exclusoes[partyId] ??= []).push(subId);
    }
    for (const pid of Object.keys(next)) {
      if (exclusoes[pid]?.length) next[pid].subpastasExcluidas = exclusoes[pid];
      else delete next[pid].subpastasExcluidas;
    }
    await game.settings.set(SETTINGS_NS, "parties", next);
    ui.notifications.info(loc("THM.PartiesSaved"));
    refreshPartyApps();
    ui.actors?.render(); // atualiza os botões de party nas pastas
  }

  /** Cria uma nova pasta de atores e já a marca como party. */
  static async #onCreateFolder() {
    const name = await foundry.applications.api.DialogV2.prompt({
      window: { title: loc("THM.CreateFolderTitle"), icon: "fa-solid fa-folder-plus" },
      content: `
        <div class="thm-dialog">
          <div class="form-group">
            <label>${loc("THM.CreateFolderLabel")}</label>
            <input type="text" name="name" value="${esc(loc("THM.NewPartyName"))}" autofocus />
          </div>
        </div>`,
      ok: {
        label: loc("THM.Create"),
        icon: "fa-solid fa-folder-plus",
        callback: (event, button) => button.form.elements.name.value.trim()
      },
      rejectClose: false
    });
    if (!name) return;

    const folder = await Folder.create({ name, type: "Actor" });
    if (!folder) return;

    const parties = getPartiesSetting();
    parties[folder.id] = parties[folder.id] ?? {};
    await game.settings.set(SETTINGS_NS, "parties", parties);

    ui.actors?.render();
    refreshPartyApps();
    this.render(); // reflete a nova pasta marcada na lista
  }
}

/** Drop de item do inventário da party sobre uma ficha de ator. */
async function handleStashDropOnActor(actor, { folderId, entryId }) {
  const entry = getStashDataRaw(folderId).items.find((e) => e._id === entryId);
  if (!entry) return;
  const canAct =
    game.user.isGM ||
    getMembers(folderId).some((a) => a.testUserPermission(game.user, "OWNER"));
  if (!canAct) return ui.notifications.warn(loc("THM.NotAuthorized"));

  const max = Math.max(1, Number(entry.system?.qtd ?? 1) || 1);
  const qty = await promptQty(entry.name, max);
  if (!qty) return;

  await requestTransfer({
    kind: "item",
    source: { stashFolderId: folderId },
    target: actorEndpoint(actor),
    itemId: entryId,
    qty
  });
}

/** Drop de item da ficha sobre um token no mapa. */
async function handleCanvasItemDrop(sourceActor, item, token) {
  const max = Math.max(1, Number(item.system.qtd ?? 1) || 1);
  const qty = await promptQty(item.name, max);
  if (!qty) return;

  await requestTransfer({
    kind: "item",
    source: actorEndpoint(sourceActor),
    target: { tokenUuid: token.document.uuid },
    itemId: item.id,
    qty
  });
}

/* ============================================================
   INTEGRAÇÕES NA INTERFACE
============================================================ */

/**
 * Transferência de dinheiro/itens: menu de contexto, botão na ficha e drops.
 * SEMPRE registrada — é nativa do GMTools, independente da Ficha do Grupo
 * estar habilitada (ela já se restringe sozinha a atores com party, via
 * getPartyFolderIdOf, então não precisa de outro guard).
 */
function registerTransferUiHooks() {
  // "Enviar para..." no menu de contexto dos itens da ficha (hook do sistema)
  Hooks.on("tormenta20.getItemToggleContextOptions", (item, menuItems) => {
    const actor = item?.actor;
    if (!actor || !INVENTORY_TYPES.includes(item.type)) return;
    if (!actor.isOwner) return;
    if (!getPartyFolderIdOf(actor)) return;
    menuItems.push({
      name: loc("THM.SendTo"),
      icon: '<i class="fa-solid fa-paper-plane"></i>',
      callback: () =>
        openSendItemDialog({
          sourceActor: actor,
          item: {
            id: item.id,
            name: item.name,
            maxQty: Number(item.system.qtd ?? 1) || 1
          }
        })
    });
  });

  // Botão de enviar dinheiro ao lado das moedas da ficha
  Hooks.on("renderActorSheet", (app, html) => {
    const actor = app.actor;
    if (!actor?.system?.dinheiro || !actor.isOwner) return;
    if (!getPartyFolderIdOf(actor)) return;

    const root = html instanceof HTMLElement ? html : html[0];
    if (!root) return;
    for (const currency of root.querySelectorAll("ul.currency")) {
      if (currency.querySelector(".thm-send-money-btn")) continue;
      const li = document.createElement("li");
      li.className = "currency-item thm-send";
      li.innerHTML = `<a class="thm-send-money-btn" data-tooltip="${loc("THM.SendMoney")}"><i class="fa-solid fa-paper-plane"></i></a>`;
      li.querySelector("a").addEventListener("click", (ev) => {
        ev.preventDefault();
        openSendMoneyDialog(actor);
      });
      currency.appendChild(li);
    }
  });

  // Soltar uma linha do inventário da party numa ficha de ator = retirar/enviar
  Hooks.on("dropActorSheetData", (actor, sheet, data) => {
    if (!data?.thmStash) return;
    handleStashDropOnActor(actor, data.thmStash);
    return false; // impede o tratamento padrão do drop
  });

  // Soltar um item da ficha sobre um token no mapa = enviar para aquele ator
  Hooks.on("dropCanvasData", (cv, data) => {
    if (data?.type !== "Item" || !data.uuid || data.thmStash) return;
    const item = fromUuidSync(data.uuid);
    const sourceActor = item?.parent;
    if (!(sourceActor instanceof Actor)) return;
    if (!INVENTORY_TYPES.includes(item.type) || !sourceActor.isOwner) return;

    const token = cv.tokens.placeables.find(
      (t) => t.visible && t.actor && t.bounds.contains(data.x, data.y)
    );
    if (!token || token.actor.uuid === sourceActor.uuid) return;

    handleCanvasItemDrop(sourceActor, item, token);
    return false;
  });
}

/**
 * Ficha do Grupo: botão no diretório de atores + atualização ao vivo das
 * janelas abertas. Só chamada quando a configuração "partySheetEnabled"
 * está ligada — é o que faz o recurso se comportar como se não existisse
 * quando desligado.
 */
function registerPartyUiHooks() {
  // Botão "Party" no cabeçalho da pasta de cada party no diretório de atores
  Hooks.on("renderActorDirectory", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;
    for (const folderId of getPartiesForUser()) {
      const header = root.querySelector(
        `li.folder[data-folder-id="${folderId}"] > header.folder-header`
      );
      if (!header || header.querySelector(".thm-party-btn")) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "create-button thm-party-btn icon fa-solid fa-users";
      btn.setAttribute("aria-label", loc("THM.OpenPartySheet"));
      btn.setAttribute("data-tooltip", "");
      btn.addEventListener("click", (ev) => {
        // Impede que o clique também expanda/recolha a pasta
        ev.preventDefault();
        ev.stopPropagation();
        const sheet =
          PartySheetApp.instances.get(folderId) ?? new PartySheetApp(folderId);
        sheet.render(true);
      });
      header.appendChild(btn);
    }
  });

  // Atualização ao vivo das party sheets abertas
  Hooks.on("updateActor", (actor) => refreshPartyApps(actor));
  Hooks.on("createItem", (item) => {
    if (item.parent instanceof Actor) refreshPartyApps(item.parent);
  });
  Hooks.on("updateItem", (item) => {
    if (item.parent instanceof Actor) refreshPartyApps(item.parent);
  });
  Hooks.on("deleteItem", (item) => {
    if (item.parent instanceof Actor) refreshPartyApps(item.parent);
  });
  Hooks.on("createActor", () => refreshPartyApps());
  Hooks.on("deleteActor", () => refreshPartyApps());
  Hooks.on("updateFolder", () => refreshPartyApps());
}

/* ============================================================
   PRIMEIRO USO — mensagem de boas-vindas e abertura do gerenciador
============================================================ */

/** Monta e publica no chat a mensagem explicando o módulo (visível a todos). */
async function postWelcomeMessage() {
  const feature = (icon, title, desc) => `
    <li class="thm-welcome-item">
      <i class="fa-solid ${icon}"></i>
      <div><strong>${loc(title)}</strong> — ${loc(desc)}</div>
    </li>`;

  const content = `
    <div class="thm-chat-card thm-welcome">
      <div class="thm-chat-header">
        <i class="fa-solid fa-users"></i> ${loc("THM.WelcomeTitle")}
      </div>
      <div class="thm-chat-body">
        <p>${loc("THM.WelcomeIntro")}</p>
        <ul class="thm-welcome-list">
          ${feature("fa-users", "THM.WelcomePartyBtnTitle", "THM.WelcomePartyBtnDesc")}
          ${feature("fa-heart-pulse", "THM.WelcomeMembersTitle", "THM.WelcomeMembersDesc")}
          ${feature("fa-box-open", "THM.WelcomeInventoryTitle", "THM.WelcomeInventoryDesc")}
          ${feature("fa-paper-plane", "THM.WelcomeSendItemTitle", "THM.WelcomeSendItemDesc")}
          ${feature("fa-coins", "THM.WelcomeSendMoneyTitle", "THM.WelcomeSendMoneyDesc")}
          ${feature("fa-hand", "THM.WelcomeDragTitle", "THM.WelcomeDragDesc")}
          ${feature("fa-gear", "THM.WelcomeSettingsTitle", "THM.WelcomeSettingsDesc")}
        </ul>
        <p class="thm-hint">${loc("THM.WelcomeGmTip")}</p>
      </div>
    </div>`;

  await ChatMessage.create({
    content,
    speaker: { alias: loc("THM.ModuleTitle") },
    flags: { [MODULE_ID]: { welcome: true } }
  });
}

/**
 * Executado no ready pelo GM principal:
 *  - envia a mensagem de boas-vindas uma única vez;
 *  - se nenhuma pasta de party estiver configurada, abre o gerenciador
 *    (tanto no primeiro uso quanto nos seguintes).
 */
async function runFirstUseFlow() {
  // Não abre mais o gerenciador de parties sozinho quando não há nenhuma
  // configurada — fundido ao GMTools, a Ficha do Grupo precisa se comportar
  // como se não existisse até o Mestre pedir por ela.
  if (!lerConfig("partyWelcomeShown", "welcomeShown")) {
    await postWelcomeMessage();
    await game.settings.set(SETTINGS_NS, "partyWelcomeShown", true);
  }
}

/* ============================================================
   INICIALIZAÇÃO
============================================================ */

Hooks.once("socketlib.ready", () => {
  socket = socketlib.registerModule(MODULE_ID);
  socket.register("gmExecuteTransfer", gmExecuteTransfer);
  socket.register("promptConfirm", promptConfirm);
  socket.register("notify", (message, type) => ui.notifications[type]?.(message));
  socket.register("skillRequest", handleSkillRequest);
});

Hooks.once("init", () => {
  registerSettings();
  registerLojaCompatHooks();
  registerTransferUiHooks();
  if (lerConfig("partySheetEnabled")) registerPartyUiHooks();
});

Hooks.once("ready", () => {
  const api = { openPartySheet, requestTransfer, PartySheetApp, PartyManagerApp };

  // A API vive no módulo que de fato hospeda este código, junto das outras
  // (automações, tesouros). MODULE_ID continua sendo só o namespace de dados.
  const anfitriao = game.modules.get(ASSET_MODULE_ID);
  if (anfitriao) anfitriao.api = { ...(anfitriao.api ?? {}), party: api };

  // Enquanto o módulo separado ainda estiver instalado, mantém a API no lugar
  // antigo para não quebrar macros que a acessavam por lá. Sem a guarda,
  // remover o módulo antigo lançaria aqui e abortaria o resto deste hook
  // (migração de estoques, limpeza e fluxo de primeiro uso).
  const antigo = game.modules.get(MODULE_ID);
  if (antigo) antigo.api = api;

  // Migra estoques criados como ator pela versão anterior (só um GM executa)
  if (game.user.isGM && game.user === game.users.activeGM) {
    gmMigrateLegacyStashes();
    // Itens temporários de edição do estoque órfãos (recarregou com a ficha aberta)
    gmCleanupStashEditItems();
  }

  // Boas-vindas + abertura do gerenciador quando não há party (só o GM principal)
  if (game.user.isGM && game.user === game.users.activeGM) {
    runFirstUseFlow();
  }

  console.log(`${MODULE_ID} | pronto`);
});
