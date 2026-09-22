/**
 * T20 Hayd GMTools | Mensagens de dano, cura e mana
 *
 * O sistema manda um cartão a cada mudança de PV/PM feita pelos botões do chat
 * (dano, cura, PV/PM temporários) e pelo gasto de mana. Aqui ele vira um log
 * de uma linha — retrato, quem, quanto — com um botão de Desfazer/Refazer.
 *
 * O cartão nativo não guarda quanto mudou de fato, então os recursos do ator
 * são fotografados ANTES da mudança (em volta de `applyDamageV2` e
 * `spendMana`) e comparados com os de DEPOIS no `preCreateChatMessage` — que
 * roda no mesmo cliente, com o `update` do ator já concluído.
 */

import {
  aplicarDiferenca,
  diferenca,
  lerRecursos,
  linhasDoResultado,
  temAlteracao
} from './scripts/mensagens-dano.mjs';

const MODULE_ID = 't20-hayd-gmtools';
const SETTING = 'mensagensDano';
const FLAG = 'mensagemDano';
// Uma foto que não virou mensagem (erro no meio do caminho) não pode ser
// casada com o próximo dano do mesmo ator.
const VALIDADE_MS = 10000;

const TIPOS = {
  dano: { chave: 'DanoLogDano', icone: 'fa-heart-crack' },
  cura: { chave: 'DanoLogCura', icone: 'fa-heart-pulse' },
  pvTemp: { chave: 'DanoLogPvTemp', icone: 'fa-shield-heart' },
  mana: { chave: 'DanoLogMana', icone: 'fa-droplet' },
  manaGanha: { chave: 'DanoLogManaGanha', icone: 'fa-hand-holding-droplet' },
  pmTemp: { chave: 'DanoLogPmTemp', icone: 'fa-wand-sparkles' },
  anulado: { chave: 'DanoLogAnulado', icone: 'fa-shield-halved' },
  nada: { chave: 'DanoLogNada', icone: 'fa-equals' }
};

/** Fotos aguardando a mensagem, por uuid do ator (fila: o mais antigo sai primeiro). */
const pendentes = new Map();

const esc = (valor) => foundry.utils.escapeHTML(String(valor ?? ''));
const t = (chave, dados) => (dados
  ? game.i18n.format(`T20HaydGMTools.${chave}`, dados)
  : game.i18n.localize(`T20HaydGMTools.${chave}`));
const recursosDo = (ator) => lerRecursos(ator?.system?.attributes);

function ativo() {
  try { return !!game.settings.get(MODULE_ID, SETTING); }
  catch { return false; }
}

function cartoesDoSistemaLigados() {
  try { return game.settings.get('tormenta20', 'showDamageCards') !== 'none'; }
  catch { return true; }
}

function fotografar(ator) {
  if (!ativo() || !ator?.uuid || !cartoesDoSistemaLigados()) return;
  const agora = Date.now();
  const fila = (pendentes.get(ator.uuid) ?? []).filter((e) => agora - e.quando < VALIDADE_MS);
  fila.push({ antes: recursosDo(ator), quando: agora, partes: [], multiplicador: 1 });
  pendentes.set(ator.uuid, fila);
}

function descartarUltima(ator) {
  const fila = pendentes.get(ator?.uuid);
  fila?.pop();
  if (fila && !fila.length) pendentes.delete(ator.uuid);
}

/** Guarda os tipos de dano da rolagem na foto que acabou de ser tirada. */
function anotarCartao(ator, partes, multiplicador) {
  const ultima = pendentes.get(ator?.uuid)?.at(-1);
  if (!ultima) return;
  ultima.partes = Object.entries(partes ?? {})
    .map(([tipo, parte]) => ({ tipo, valor: Number(parte?.value) || 0 }))
    .filter((parte) => parte.valor);
  ultima.multiplicador = Number(multiplicador) || 1;
}

function consumir(message) {
  const ator = ChatMessage.getSpeakerActor(message.speaker);
  let chave = ator?.uuid;
  // Speaker de token sem ator resolvido: casa pelo id do ator no fim do uuid
  if (!pendentes.has(chave) && message.speaker?.actor) {
    chave = [...pendentes.keys()].find((k) => k.endsWith(`Actor.${message.speaker.actor}`));
  }
  const fila = pendentes.get(chave);
  const entrada = fila?.shift();
  if (fila && !fila.length) pendentes.delete(chave);
  if (!entrada || Date.now() - entrada.quando >= VALIDADE_MS) return null;
  const alvo = ator?.uuid === chave ? ator : fromUuidSync(chave);
  return alvo ? { ator: alvo, entrada } : null;
}

/* ─── Cartão ──────────────────────────────────────────────────────────────── */

function montarCartao(message, dados) {
  const delta = diferenca(dados.antes, dados.depois);
  let linhas = linhasDoResultado(delta);
  if (!linhas.length) {
    const houveDano = dados.partes?.length && Number(dados.multiplicador) > 0;
    linhas = [{ tipo: houveDano ? 'anulado' : 'nada', valor: 0 }];
  }
  const principal = linhas[0].tipo;
  const ator = fromUuidSync(dados.actorUuid);
  const podeMexer = !!ator && temAlteracao(delta)
    && (game.user.isGM || (message.isAuthor && ator.isOwner));
  const nome = `<b>${esc(dados.nome ?? ator?.name ?? message.alias)}</b>`;
  const retrato = dados.img ?? ator?.img;

  const htmlLinhas = linhas.map((linha) => {
    const tipo = TIPOS[linha.tipo];
    const valor = `<b class="t20g-dano-valor">${Math.abs(linha.valor)}</b>`;
    return `<p class="t20g-dano-linha" data-tipo="${linha.tipo}">
      <i class="fa-solid ${tipo.icone}"></i>
      <span>${t(tipo.chave, { nome, valor })}</span>
    </p>`;
  }).join('');

  const autorDesfazer = dados.desfeitoPor ? game.users.get(dados.desfeitoPor)?.name : null;
  const aviso = dados.desfeito
    ? `<p class="t20g-dano-aviso"><i class="fa-solid fa-rotate-left"></i> ${esc(autorDesfazer
      ? t('DanoDesfeitoPor', { nome: autorDesfazer })
      : t('DanoDesfeito'))}</p>`
    : '';
  const botao = podeMexer
    ? `<button type="button" class="t20g-dano-acao" data-t20g-dano-acao>
        <i class="fa-solid ${dados.desfeito ? 'fa-rotate-right' : 'fa-rotate-left'}"></i>
        ${esc(t(dados.desfeito ? 'DanoRefazer' : 'DanoDesfazer'))}</button>`
    : '';

  return `<div class="t20g-dano${dados.desfeito ? ' t20g-dano-desfeito' : ''}" data-tipo="${principal}">
    <div class="t20g-dano-log">
      ${retrato ? `<img class="t20g-dano-retrato" src="${esc(retrato)}" alt="">` : ''}
      <div class="t20g-dano-linhas">${htmlLinhas}</div>
    </div>
    ${aviso}${botao}
  </div>`;
}

/* ─── Desfazer / refazer ──────────────────────────────────────────────────── */

async function alternar(message) {
  const dados = message.getFlag(MODULE_ID, FLAG);
  if (!dados) return;
  const ator = await fromUuid(dados.actorUuid);
  if (!ator) return ui.notifications.warn(t('DanoSemAtor'));
  if (!ator.isOwner) return ui.notifications.warn(t('DanoSemPermissao', { nome: ator.name }));

  const { pv, pm } = ator.system.attributes;
  const novo = aplicarDiferenca(
    recursosDo(ator),
    diferenca(dados.antes, dados.depois),
    { pvMin: pv?.min, pvMax: pv?.max, pmMin: pm?.min, pmMax: pm?.max },
    dados.desfeito ? 1 : -1
  );
  await ator.update({
    'system.attributes.pv.value': novo.pv,
    'system.attributes.pv.temp': novo.pvTemp,
    'system.attributes.pm.value': novo.pm,
    'system.attributes.pm.temp': novo.pmTemp
  });
  await message.update({
    [`flags.${MODULE_ID}.${FLAG}.desfeito`]: !dados.desfeito,
    [`flags.${MODULE_ID}.${FLAG}.desfeitoPor`]: dados.desfeito ? null : game.user.id
  });
}

/* ─── Integração ──────────────────────────────────────────────────────────── */

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, SETTING, {
    name: 'T20HaydGMTools.SettingMensagensDanoName',
    hint: 'T20HaydGMTools.SettingMensagensDanoHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    onChange: () => ui.chat?.render?.()
  });
});

Hooks.once('setup', () => {
  const proto = CONFIG.Actor?.documentClass?.prototype;
  if (!proto || proto._t20gMensagensDano) return;
  if (typeof proto.displayDamageCard !== 'function') {
    console.warn(`${MODULE_ID} | displayDamageCard não encontrado — mensagens de dano seguem nativas`);
    return;
  }

  for (const metodo of ['applyDamageV2', 'spendMana']) {
    const original = proto[metodo];
    if (typeof original !== 'function') continue;
    proto[metodo] = async function (...args) {
      fotografar(this);
      try { return await original.apply(this, args); }
      catch (err) { descartarUltima(this); throw err; }
    };
  }

  const originalCartao = proto.displayDamageCard;
  proto.displayDamageCard = function (partes, final, multiplicador = 1, ...resto) {
    anotarCartao(this, partes, multiplicador);
    return originalCartao.call(this, partes, final, multiplicador, ...resto);
  };
  proto._t20gMensagensDano = true;
});

Hooks.on('preCreateChatMessage', (message) => {
  if (!ativo()) return;
  if (!String(message.flags?.tormenta20?.cssClass ?? '').includes('damage-card')) return;
  const achado = consumir(message);
  if (!achado) return;
  const { ator, entrada } = achado;
  message.updateSource({
    [`flags.${MODULE_ID}.${FLAG}`]: {
      actorUuid: ator.uuid,
      nome: ator.name,
      img: ator.img ?? '',
      antes: entrada.antes,
      depois: recursosDo(ator),
      partes: entrada.partes,
      multiplicador: entrada.multiplicador,
      desfeito: false
    }
  });
});

Hooks.on('renderChatMessageHTML', (message, html) => {
  if (!ativo()) return;
  const dados = message.getFlag?.(MODULE_ID, FLAG);
  if (!dados) return;
  const root = html?.querySelector ? html : html?.[0];
  const conteudo = root?.querySelector?.('.message-content');
  if (!conteudo) return;

  root.classList.add('t20g-dano-msg');
  conteudo.classList.add('t20g-dano-conteudo');
  conteudo.innerHTML = montarCartao(message, dados);

  conteudo.querySelector('[data-t20g-dano-acao]')?.addEventListener('click', async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const botao = ev.currentTarget;
    botao.disabled = true;
    try { await alternar(message); }
    catch (err) {
      console.error(`${MODULE_ID} | Falha ao desfazer mensagem de dano`, err);
      ui.notifications.error(t('DanoErro'));
    } finally {
      if (botao.isConnected) botao.disabled = false;
    }
  });
});
