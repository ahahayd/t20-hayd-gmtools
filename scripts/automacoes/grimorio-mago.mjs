import { MODULE_ID, podeControlar } from './runtime.mjs';
import { definicaoDe } from './estado.mjs';
import { normalizarNome } from './sugestao.mjs';
import { temEscriba, abrirEscriba } from './escriba-arcano.mjs';

/*
 * Caminho do Arcanista: Mago — magias memorizadas.
 *
 * O mago só lança as magias que memorizou estudando o grimório: metade das
 * que conhece. A janela do Grimório separa as magias de mago das que vêm de
 * outras fontes (Escriba Arcano conta como mago; uma magia de raça ou de
 * item, não), mostra a metade e deixa ajustar o limite para os poderes que o
 * aumentam ou diminuem.
 *
 * Nada é bloqueado: lançar uma magia de mago não preparada funciona, só que o
 * cartão no chat ganha um aviso vermelho. Em combate, preparar ou esquecer
 * uma magia vai para o chat.
 *
 * Preparar usa o suporte do próprio sistema: o sol da lista de magias, que
 * grava `system.preparada` e só aparece com a ficha marcada como mago
 * (`flags.tormenta20.mago`, ligada sozinha junto com a automação). O módulo
 * acrescenta o limite (o sol não passa dele), esconde o sol nas magias de
 * outras fontes e anuncia as trocas em combate.
 *
 * Estado:
 *   - na magia, `flags.<mod>.grimorio` = { mago: bool }. Sem a marca, a magia
 *     conta como de mago; preparada é `system.preparada`;
 *   - no poder, `flags.<mod>.grimorio` = { ajuste: número, novasDeMago: bool }.
 */

const FLAG = 'grimorio';
const FLAG_NAO_PREPARADA = 'magiaNaoPreparada';

/* ─── Regras (funções puras) ─────────────────────────────────────────────── */

/** Metade das magias de mago, arredondada para baixo (7 → 3). */
export function metade(total) {
  return Math.floor(Math.max(0, Number(total) || 0) / 2);
}

/** Limite de magias memorizadas: a metade mais o ajuste dos poderes, nunca negativo. */
export function limiteDe(total, ajuste) {
  return Math.max(0, metade(total) + (Math.trunc(Number(ajuste)) || 0));
}

/* ─── Ator ───────────────────────────────────────────────────────────────── */

export function poderDoMago(ator) {
  return ator?.items?.find((i) => definicaoDe(i)?.grimorio) ?? null;
}

export function temGrimorio(ator) {
  return !!poderDoMago(ator);
}

function configDoPoder(poder) {
  const f = poder?.getFlag?.(MODULE_ID, FLAG) ?? {};
  return { ajuste: Math.trunc(Number(f.ajuste)) || 0, novasDeMago: f.novasDeMago !== false };
}

export function estadoDaMagia(magia) {
  const f = magia?.getFlag?.(MODULE_ID, FLAG) ?? {};
  const mago = f.mago !== false;
  return { mago, preparada: mago && !!magia?.system?.preparada };
}

const magiasDe = (ator) => (ator?.items ?? []).filter((i) => i.type === 'magia');

/** Contagem que a janela, a ficha e o cartão do poder mostram. */
export function resumo(ator) {
  const poder = poderDoMago(ator);
  if (!poder) return null;
  const { ajuste, novasDeMago } = configDoPoder(poder);
  const estados = magiasDe(ator).map(estadoDaMagia);
  const total = estados.filter((e) => e.mago).length;
  return {
    total,
    metade: metade(total),
    ajuste,
    limite: limiteDe(total, ajuste),
    preparadas: estados.filter((e) => e.preparada).length,
    outras: estados.length - total,
    novasDeMago
  };
}

/** A magia é de mago e está fora das memorizadas? */
export function naoPreparada(ator, magia) {
  if (!magia || magia.type !== 'magia' || !temGrimorio(ator)) return false;
  const e = estadoDaMagia(magia);
  return e.mago && !e.preparada;
}

/* ─── Chat ───────────────────────────────────────────────────────────────── */

const esc = (t) => foundry.utils.escapeHTML(String(t ?? ''));

function emCombate(ator) {
  // Qualquer combate iniciado: o que está à vista pode ser o de outra cena
  return (game.combats ?? []).some((combate) => combate.started
    && combate.combatants.some((c) => c.actor?.id === ator.id || c.actorId === ator.id));
}

/** Em combate, cada troca no grimório custa tempo: a mesa fica sabendo. */
async function anunciarTrocas(ator, trocas) {
  if (!trocas.length || !emCombate(ator)) return;
  const linhas = trocas.map(({ magia, preparada }) => `<li class="t20g-gri-chat-linha">
      <img src="${esc(magia.img)}" alt="">
      <span><b>${esc(ator.name)}</b> ${preparada ? 'preparou' : 'esqueceu'} a magia
        @UUID[${magia.uuid}]{${esc(magia.name)}}</span>
    </li>`).join('');
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: ator }),
    content: `<div class="t20g-auto-chat t20g-gri-chat"><ul>${linhas}</ul></div>`
  });
}

const _pendentes = new Map();

/**
 * O sol (da ficha do sistema, da Ficha Hayd ou da janela) mudou uma magia de
 * mago. Só o cliente que fez a mudança anuncia, e trocas em sequência ("Esquecer
 * todas") saem numa única mensagem.
 */
export function aoMudarMagia(item, mudancas, userId) {
  if (userId !== game.user.id || item?.type !== 'magia') return;
  if (!foundry.utils.hasProperty(mudancas, 'system.preparada')) return;
  const ator = item.parent;
  if (!temGrimorio(ator) || !estadoDaMagia(item).mago || !emCombate(ator)) return;
  const fila = _pendentes.get(ator.id) ?? { trocas: [] };
  fila.trocas = fila.trocas.filter((t) => t.magia.id !== item.id);
  fila.trocas.push({ magia: item, preparada: !!item.system.preparada });
  clearTimeout(fila.espera);
  fila.espera = setTimeout(() => {
    _pendentes.delete(ator.id);
    anunciarTrocas(ator, fila.trocas).catch((err) =>
      console.error(`${MODULE_ID} | Grimório: falha ao anunciar no chat`, err));
  }, 250);
  _pendentes.set(ator.id, fila);
}

/**
 * Preparar além do limite é barrado, venha o clique de onde vier. Retorna
 * `false` para o hook cancelar a atualização.
 */
export function antesDeMudarMagia(item, mudancas) {
  if (item?.type !== 'magia' || foundry.utils.getProperty(mudancas, 'system.preparada') !== true) return true;
  const ator = item.parent;
  if (!temGrimorio(ator) || item.system?.preparada) return true;
  if (!estadoDaMagia(item).mago) {
    ui.notifications.warn(`${item.name} não é magia de mago: não precisa ser preparada.`);
    return false;
  }
  const r = resumo(ator);
  if (r.preparadas < r.limite) return true;
  ui.notifications.warn(`O limite de ${r.limite} magia(s) memorizada(s) já foi atingido.`);
  return false;
}

/** Liga o "mago" do sistema para o sol de preparar aparecer nas fichas. */
export async function garantirPreparo(ator) {
  if (!temGrimorio(ator) || !ator.isOwner || ator.getFlag('tormenta20', 'mago')) return;
  await ator.setFlag('tormenta20', 'mago', true);
}

/**
 * Ficha do sistema: some o sol das magias de outras fontes e o contador de
 * memorizadas entra ao lado da CD de magias.
 */
export function injetarNaFichaDoSistema(app, html) {
  const ator = app?.actor ?? app?.document;
  const r = ator?.type === 'character' ? resumo(ator) : null;
  const raiz = html?.querySelector ? html : html?.[0];
  if (!r || !raiz) return;
  // Ficha padrão: magias em `.list-spells`; ficha com abas: em `.tab.spells`
  const LISTA = ':is(.list-spells, .tab.spells)';
  for (const linha of raiz.querySelectorAll(`${LISTA} li.item[data-item-id]`)) {
    const magia = ator.items.get(linha.dataset.itemId);
    if (magia?.type === 'magia' && !estadoDaMagia(magia).mago) {
      linha.querySelector('.preparation-toggle')?.closest('.item-toggles')?.style.setProperty('visibility', 'hidden');
    }
  }
  const cd = [...raiz.querySelectorAll(`${LISTA} .item-header label`)]
    .find((l) => /^(CD|DC)\b/.test(l.textContent.trim()));
  const alvo = cd?.parentElement;
  if (!alvo || alvo.querySelector('.t20g-gri-faixa')) return;
  const progresso = r.limite ? Math.min(100, Math.round((r.preparadas / r.limite) * 100)) : (r.preparadas ? 100 : 0);
  const faixa = document.createElement('span');
  faixa.className = `t20g-gri-faixa ${r.preparadas > r.limite ? 'excedeu' : ''}`;
  faixa.innerHTML = `<span class="t20g-gri-contador"
      data-tooltip="${r.total} magias de mago · metade ${r.metade}${r.ajuste ? ` · ajuste ${r.ajuste > 0 ? '+' : ''}${r.ajuste}` : ''}">
      <i class="fa-solid fa-book-skull"></i> Preparadas <b>${r.preparadas}/${r.limite}</b>
      <span class="t20g-gri-mini-barra"><span style="width: ${progresso}%"></span></span>
    </span>
    <button type="button" class="t20g-gri-abrir"><i class="fa-solid fa-book-open"></i> Grimório</button>`;
  faixa.querySelector('.t20g-gri-abrir').addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    abrirGrimorio(ator);
  });
  alvo.appendChild(faixa);
}

/**
 * Antes de gravar o cartão de uma magia, anota se ela saiu sem estar
 * preparada. O aviso reflete o grimório na hora do lançamento, e não o de
 * quando a mensagem é redesenhada mais tarde.
 */
export function marcarMagiaNaoPreparada(message) {
  const conteudo = String(message?._source?.content ?? '');
  if (!conteudo.includes('chat-card')) return;
  const itemId = conteudo.match(/data-item-id="([^"]+)"/)?.[1];
  if (!itemId) return;
  const ator = ChatMessage.getSpeakerActor(message.speaker)
    ?? game.actors.get(conteudo.match(/data-actor-id="([^"]+)"/)?.[1]);
  if (!naoPreparada(ator, ator?.items?.get(itemId))) return;
  message.updateSource({ [`flags.${MODULE_ID}.${FLAG_NAO_PREPARADA}`]: true });
}

/** Faixa vermelha no topo do cartão da magia lançada sem estar memorizada. */
export function injetarAvisoNaoPreparada(message, container) {
  if (!message?.getFlag?.(MODULE_ID, FLAG_NAO_PREPARADA)) return;
  const card = container?.querySelector?.('.chat-card.item-card');
  if (!card || card.querySelector('.t20g-gri-aviso')) return;
  const aviso = document.createElement('div');
  aviso.className = 't20g-gri-aviso';
  aviso.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Magia não preparada';
  aviso.dataset.tooltip = 'Esta magia de mago não estava entre as memorizadas quando foi lançada.';
  card.prepend(aviso);
}

/* ─── Gravação ───────────────────────────────────────────────────────────── */

/** Grava o estado de várias magias de uma vez e anuncia as trocas em combate. */
async function gravar(ator, mudancas) {
  const atualizacoes = [];
  for (const { magia, mago, preparada } of mudancas) {
    const antes = estadoDaMagia(magia);
    const depois = {
      mago: mago ?? antes.mago,
      preparada: (mago ?? antes.mago) ? (preparada ?? antes.preparada) : false
    };
    if (depois.mago === antes.mago && depois.preparada === antes.preparada) continue;
    const dados = { _id: magia.id };
    if (depois.mago !== antes.mago) dados[`flags.${MODULE_ID}.${FLAG}.mago`] = depois.mago;
    if (depois.preparada !== antes.preparada) dados['system.preparada'] = depois.preparada;
    atualizacoes.push(dados);
  }
  if (!atualizacoes.length) return;
  await ator.updateEmbeddedDocuments('Item', atualizacoes);
}

async function gravarPoder(poder, dados) {
  await poder.update({ [`flags.${MODULE_ID}.${FLAG}`]: { ...configDoPoder(poder), ...dados } });
}

/**
 * Magia nova na ficha de um mago entra como de mago (ou não) conforme a
 * escolha no grimório. Roda só no cliente que cria o item.
 */
export function marcarMagiaNova(item) {
  if (item?.type !== 'magia' || item.getFlag?.(MODULE_ID, FLAG)) return;
  const poder = poderDoMago(item.parent);
  if (!poder) return;
  item.updateSource({
    [`flags.${MODULE_ID}.${FLAG}`]: { mago: configDoPoder(poder).novasDeMago },
    'system.preparada': false
  });
}

/* ─── Janela ─────────────────────────────────────────────────────────────── */

function filtros(raiz) {
  const campo = (nome) => raiz.querySelector(`[data-gri-filtro="${nome}"]`);
  return {
    busca: normalizarNome(campo('busca')?.value ?? ''),
    origem: campo('origem')?.value ?? '',
    preparo: campo('preparo')?.value ?? '',
    tipo: campo('tipo')?.value ?? '',
    circulo: campo('circulo')?.value ?? '',
    escola: campo('escola')?.value ?? ''
  };
}

/** Todos os filtros valem juntos: cada um só corta o que os outros deixaram. */
function passaNoFiltro(magia, estado, f) {
  const sys = magia.system ?? {};
  if (f.busca && !normalizarNome(magia.name).includes(f.busca)) return false;
  if (f.origem === 'mago' && !estado.mago) return false;
  if (f.origem === 'outras' && estado.mago) return false;
  if (f.preparo === 'sim' && !estado.preparada) return false;
  if (f.preparo === 'nao' && (estado.preparada || !estado.mago)) return false;
  if (f.tipo && sys.tipo !== f.tipo) return false;
  if (f.circulo && Number(sys.circulo) !== Number(f.circulo)) return false;
  if (f.escola && sys.escola !== f.escola) return false;
  return true;
}

const rotulo = (mapa, chave) => {
  const r = CONFIG.T20?.[mapa]?.[chave];
  return r ? game.i18n.localize(r) : '';
};

function linhaMagia(magia, estado, { cheio, controlar }) {
  const detalhes = [rotulo('spellType', magia.system?.tipo), rotulo('spellSchools', magia.system?.escola)]
    .filter(Boolean).join(' · ');
  const travada = !controlar || !estado.mago || (cheio && !estado.preparada);
  const dicaPreparar = !estado.mago
    ? 'Só magias de mago são memorizadas'
    : estado.preparada ? 'Esquecer a magia'
      : cheio ? 'O limite de magias memorizadas já foi atingido' : 'Preparar a magia';
  return `<article class="t20g-gri-item ${estado.preparada ? 'preparada' : ''} ${estado.mago ? '' : 'outra-fonte'}"
      data-item-id="${magia.id}">
    <img class="t20g-miniatura" src="${esc(magia.img)}" alt="">
    <div class="t20g-esc-info">
      <div class="t20g-esc-nome"><a data-gri-acao="ver" data-tooltip="Abrir a magia">${esc(magia.name)}</a>
        ${estado.mago ? '' : '<span class="t20g-chip">Outra fonte</span>'}</div>
      <small>${esc(detalhes)}</small>
    </div>
    <label class="t20g-esc-check" data-tooltip="Magia aprendida como mago (conta para a metade)">
      <input type="checkbox" data-gri-acao="mago" ${estado.mago ? 'checked' : ''} ${controlar ? '' : 'disabled'}> De mago</label>
    <button type="button" class="t20g-btn t20g-btn--pequeno t20g-gri-preparar" data-gri-acao="preparar"
      ${travada ? 'disabled' : ''} data-tooltip="${dicaPreparar}">
      <i class="fa-solid ${estado.preparada ? 'fa-book-open' : 'fa-book'}"></i>
      ${estado.preparada ? 'Preparada' : 'Preparar'}</button>
  </article>`;
}

function conteudo(ator) {
  // Com o Escriba Arcano, aprender magias novas fica a um clique daqui
  const escriba = temEscriba(ator) && podeControlar(ator)
    ? `<button type="button" class="t20g-btn t20g-btn--pequeno" data-gri-acao="escriba"
        data-tooltip="Escriba Arcano: aprender magias copiando pergaminhos e grimórios">
        <i class="fa-solid fa-feather-pointed"></i> Aprender magias</button>`
    : '';
  const opcoes = (mapa) => Object.entries(CONFIG.T20?.[mapa] ?? {})
    .map(([v, r]) => `<option value="${v}">${esc(game.i18n.localize(r))}</option>`).join('');
  return `<div class="t20g-esc-janela t20g-gri-janela">
    ${escriba ? `<div class="t20g-gri-topo">${escriba}</div>` : ''}
    <div class="t20g-gri-placar"></div>
    <div class="t20g-barra t20g-esc-filtros t20g-gri-filtros">
      <input type="search" class="t20g-cresce" data-gri-filtro="busca" placeholder="Buscar magia…">
      <select data-gri-filtro="origem" data-tooltip="Origem">
        <option value="">Todas as origens</option>
        <option value="mago">Só de mago</option>
        <option value="outras">Só não de mago</option>
      </select>
      <select data-gri-filtro="preparo" data-tooltip="Preparo">
        <option value="">Preparadas ou não</option>
        <option value="sim">Preparadas</option>
        <option value="nao">Não preparadas</option>
      </select>
    </div>
    <div class="t20g-barra t20g-esc-filtros t20g-gri-filtros">
      <select data-gri-filtro="tipo" data-tooltip="Tipo"><option value="">Todos os tipos</option>${opcoes('spellType')}</select>
      <select data-gri-filtro="circulo" data-tooltip="Círculo">
        <option value="">Todos os círculos</option>
        ${[1, 2, 3, 4, 5].map((c) => `<option value="${c}">${c}º círculo</option>`).join('')}
      </select>
      <select data-gri-filtro="escola" data-tooltip="Escola"><option value="">Todas as escolas</option>${opcoes('spellSchools')}</select>
      <button type="button" class="t20g-btn t20g-btn--pequeno t20g-btn--fantasma" data-gri-acao="limpar-filtros"
        data-tooltip="Limpar os filtros"><i class="fa-solid fa-filter-circle-xmark"></i></button>
    </div>
    <div class="t20g-barra t20g-gri-massa">
      <span class="t20g-gri-massa-rotulo">Nas magias da lista:</span>
      <button type="button" class="t20g-btn t20g-btn--pequeno t20g-btn--fantasma" data-gri-acao="todas-mago">
        <i class="fa-solid fa-check-double"></i> Todas de mago</button>
      <button type="button" class="t20g-btn t20g-btn--pequeno t20g-btn--fantasma" data-gri-acao="nenhuma-mago">
        <i class="fa-regular fa-square"></i> Nenhuma de mago</button>
      <button type="button" class="t20g-btn t20g-btn--pequeno t20g-btn--fantasma" data-gri-acao="esquecer-todas">
        <i class="fa-solid fa-eraser"></i> Esquecer todas</button>
    </div>
    <div class="t20g-esc-lista t20g-rola"></div>
  </div>`;
}

function placar(r, controlar) {
  const excedeu = r.preparadas > r.limite;
  const ajuste = r.ajuste ? ` (metade ${r.ajuste > 0 ? '+' : '−'} ${Math.abs(r.ajuste)})` : '';
  return `<div class="t20g-gri-numeros">
      <span><small>Magias de mago</small><b>${r.total}</b></span>
      <span><small>Metade</small><b>${r.metade}</b></span>
      <span data-tooltip="Limite de magias memorizadas${ajuste}. Alguns poderes aumentam ou diminuem esse número.">
        <small>Limite${r.ajuste && controlar ? ' <a data-gri-acao="limite-padrao" data-tooltip="Voltar para a metade"><i class="fa-solid fa-rotate-left"></i></a>' : ''}</small>
        <span class="t20g-stepper">
          <button type="button" data-gri-acao="limite-menos" ${controlar && r.limite > 0 ? '' : 'disabled'}
            data-tooltip="Diminuir o limite"><i class="fa-solid fa-minus"></i></button>
          <span class="t20g-stepper__valor">${r.limite}</span>
          <button type="button" data-gri-acao="limite-mais" ${controlar ? '' : 'disabled'}
            data-tooltip="Aumentar o limite"><i class="fa-solid fa-plus"></i></button>
        </span>
      </span>
      <span class="${excedeu ? 't20g-esc-falta' : ''}"><small>Preparadas</small><b>${r.preparadas} / ${r.limite}</b></span>
    </div>
    <label class="t20g-esc-check" data-tooltip="Magias adicionadas à ficha daqui em diante já entram marcadas assim">
      <input type="checkbox" data-gri-acao="novas-mago" ${r.novasDeMago ? 'checked' : ''} ${controlar ? '' : 'disabled'}>
      Magias novas entram como de mago</label>`;
}

function ligar(raiz, ator) {
  const lista = raiz.querySelector('.t20g-esc-lista');
  const controlar = podeControlar(ator);

  const visiveis = () => {
    const f = filtros(raiz);
    return magiasDe(ator).filter((m) => passaNoFiltro(m, estadoDaMagia(m), f));
  };

  const desenhar = () => {
    const r = resumo(ator);
    if (!r) return;
    raiz.querySelector('.t20g-gri-placar').innerHTML = placar(r, controlar);
    raiz.querySelector('.t20g-gri-massa').hidden = !controlar;
    const magias = visiveis()
      .sort((a, b) => (Number(a.system?.circulo) || 0) - (Number(b.system?.circulo) || 0)
        || a.name.localeCompare(b.name, 'pt-BR'));
    const rolagem = lista.scrollTop;
    if (!magias.length) {
      lista.innerHTML = `<p class="t20g-vazio">${magiasDe(ator).length
        ? 'Nenhuma magia com esses filtros.' : 'A ficha ainda não tem magias.'}</p>`;
      return;
    }
    const cheio = r.preparadas >= r.limite;
    const grupos = new Map();
    for (const m of magias) {
      const c = Number(m.system?.circulo) || 0;
      if (!grupos.has(c)) grupos.set(c, []);
      grupos.get(c).push(m);
    }
    lista.innerHTML = [...grupos].map(([circulo, doCirculo]) => `<section class="t20g-esc-circulo">
      <h3 class="t20g-titulo">${circulo ? `${circulo}º círculo` : 'Sem círculo'} <small>${doCirculo.length}</small></h3>
      <div class="t20g-esc-grupo">${doCirculo.map((m) => linhaMagia(m, estadoDaMagia(m), { cheio, controlar })).join('')}</div>
    </section>`).join('');
    lista.scrollTop = rolagem;
  };

  const executar = async (alvo, tarefa) => {
    alvo.disabled = true;
    try { await tarefa(); }
    catch (err) { console.error(`${MODULE_ID} | Grimório: falha ao gravar`, err); }
    finally { if (alvo.isConnected) alvo.disabled = false; }
  };

  let espera;
  raiz.addEventListener('input', (ev) => {
    if (!ev.target.closest('.t20g-gri-filtros')) return;
    clearTimeout(espera);
    if (ev.target.type === 'search') espera = setTimeout(desenhar, 150);
    else desenhar();
  });

  raiz.addEventListener('change', (ev) => {
    const alvo = ev.target.closest('[data-gri-acao]');
    if (!alvo || !controlar) return;
    const poder = poderDoMago(ator);
    if (alvo.dataset.griAcao === 'novas-mago' && poder) {
      executar(alvo, () => gravarPoder(poder, { novasDeMago: alvo.checked }));
    } else if (alvo.dataset.griAcao === 'mago') {
      const magia = ator.items.get(alvo.closest('[data-item-id]')?.dataset.itemId);
      if (magia) executar(alvo, () => gravar(ator, [{ magia, mago: alvo.checked }]));
    }
  });

  raiz.addEventListener('click', async (ev) => {
    const alvo = ev.target.closest('[data-gri-acao]');
    if (!alvo || alvo.disabled || alvo.type === 'checkbox' || alvo.tagName === 'LABEL') return;
    ev.preventDefault();
    const magia = ator.items.get(alvo.closest('[data-item-id]')?.dataset.itemId);
    const poder = poderDoMago(ator);
    const r = resumo(ator);
    switch (alvo.dataset.griAcao) {
      case 'escriba':
        abrirEscriba(ator);
        break;
      case 'ver':
        magia?.sheet?.render(true);
        break;
      case 'limpar-filtros':
        for (const campo of raiz.querySelectorAll('[data-gri-filtro]')) campo.value = '';
        desenhar();
        break;
      case 'preparar': {
        const e = estadoDaMagia(magia);
        if (!e.preparada && r.preparadas >= r.limite) {
          ui.notifications.warn(`O limite de ${r.limite} magia(s) memorizada(s) já foi atingido.`);
          break;
        }
        await executar(alvo, () => gravar(ator, [{ magia, preparada: !e.preparada }]));
        break;
      }
      case 'limite-mais':
        await executar(alvo, () => gravarPoder(poder, { ajuste: r.ajuste + 1 }));
        break;
      case 'limite-menos':
        await executar(alvo, () => gravarPoder(poder, { ajuste: r.ajuste - 1 }));
        break;
      case 'limite-padrao':
        await gravarPoder(poder, { ajuste: 0 });
        break;
      case 'todas-mago':
        await executar(alvo, () => gravar(ator, visiveis().map((m) => ({ magia: m, mago: true }))));
        break;
      case 'nenhuma-mago':
        await executar(alvo, () => gravar(ator, visiveis().map((m) => ({ magia: m, mago: false }))));
        break;
      case 'esquecer-todas':
        await executar(alvo, () => gravar(ator, visiveis().map((m) => ({ magia: m, preparada: false }))));
        break;
    }
  });

  // Mudanças na ficha (inclusive de outro cliente) redesenham no lugar
  const daFicha = (item) => item?.parent?.id === ator.id
    && (item.type === 'magia' || definicaoDe(item)?.grimorio);
  const ganchos = ['createItem', 'updateItem', 'deleteItem'].map((nome) => [nome, Hooks.on(nome, (item) => {
    if (!raiz.isConnected) {
      for (const [n, id] of ganchos) Hooks.off(n, id);
      return;
    }
    if (daFicha(item)) desenhar();
  })]);

  desenhar();
}

export async function abrirGrimorio(ator) {
  if (!ator || !temGrimorio(ator)) return;
  garantirPreparo(ator).catch(() => {});
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Grimório — ${ator.name}`, icon: 'fa-solid fa-book-skull' },
    position: { width: 760 },
    content: conteudo(ator),
    rejectClose: false,
    buttons: [{ action: 'fechar', label: 'Fechar', icon: 'fa-solid fa-xmark', default: true }],
    render: (_evento, dialogo) => ligar(dialogo.element, ator)
  });
}

/** Prepara ou esquece uma magia (fichas de terceiros usam isto na linha da magia). */
export async function alternarPreparo(ator, magia) {
  if (!magia || !podeControlar(ator)) return false;
  const e = estadoDaMagia(magia);
  if (!e.mago) return false;
  const r = resumo(ator);
  if (!e.preparada && r && r.preparadas >= r.limite) {
    ui.notifications.warn(`O limite de ${r.limite} magia(s) memorizada(s) já foi atingido.`);
    return false;
  }
  await gravar(ator, [{ magia, preparada: !e.preparada }]);
  return true;
}

export const grimorio = {
  temGrimorio, abrir: abrirGrimorio, resumo, naoPreparada, estadoDaMagia, alternar: alternarPreparo
};
