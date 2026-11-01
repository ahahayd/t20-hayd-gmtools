/**
 * T20 Hayd GMTools | Marcador "Manobra" na janela de uso
 *
 * Efeitos de uso marcados como "É um efeito de manobra?" ficam fora da janela
 * até o marcador "Manobra", primeira linha da lista, ser ligado. Junto deles
 * entra o modificador de manobra do tamanho de quem rola.
 *
 * O efeito de tamanho não existe em nenhuma ficha: é um documento em memória,
 * entregue ao sistema na lista de efeitos aplicáveis. Assim o sistema aplica,
 * a prévia calcula e o chat mostra como qualquer outro aprimoramento.
 *
 * O sistema aplica sozinho os efeitos automáticos quando o uso pula a janela
 * (Shift ou configuração do mundo). Sem o marcador não há Manobra, então os
 * efeitos de manobra ficam fora da lista e só entram quando a janela abre.
 */

import {
  FLAG_TAMANHO, ID_EFEITO_TAMANHO, TAMANHOS, dadosDoEfeitoDeTamanho, ehEfeitoDeManobra, FLAG_MANOBRA,
  modificadorDeManobra, unicosPorId
} from './scripts/manobra.mjs';
import { ehV14, paraOSistema } from './scripts/versao.mjs';

const MODULE_ID = 't20-hayd-gmtools';
const SETTING = 'manobraUso';
const VALIDADE_MS = 15000;

const esc = (valor) => foundry.utils.escapeHTML(String(valor ?? ''));
const t = (chave, dados) => (dados
  ? game.i18n.format(`T20HaydGMTools.${chave}`, dados)
  : game.i18n.localize(`T20HaydGMTools.${chave}`));

function ativo() {
  try { return !!game.settings.get(MODULE_ID, SETTING); }
  catch { return false; }
}

/** O sistema não deve aplicar este efeito por conta própria (uso sem janela). */
export function foraDoUsoSemJanela(efeito) {
  return ativo() && ehEfeitoDeManobra(efeito);
}

/** Troca feita na janela aberta: vale na hora, antes de a flag voltar do servidor. */
const tamanhoEscolhido = new Map();

function tamanhoDeManobra(ator) {
  return tamanhoEscolhido.get(ator.uuid) ?? ator.getFlag(MODULE_ID, FLAG_TAMANHO) ?? ator.system?.tracos?.tamanho;
}

/** Efeito em memória com o modificador do tamanho do ator, ou `null`. */
function efeitoDeTamanho(item) {
  const ator = item?.actor;
  if (item?.type !== 'arma' || !ator) return null;
  const tamanho = tamanhoDeManobra(ator);
  const dados = dadosDoEfeitoDeTamanho({
    tamanho,
    nome: t('ManobraTamanho', { tamanho: CONFIG.T20.actorSizes?.[tamanho] ?? '' }),
    origem: ator.uuid
  });
  return new CONFIG.ActiveEffect.documentClass(paraOSistema(dados), { parent: ator });
}

const fontesVirtuais = [];

/** Outra função que entrega um efeito em memória para a janela de uso. */
export function registrarEfeitoVirtual(fonte) {
  fontesVirtuais.push(fonte);
}

function efeitosVirtuais(item) {
  return [ativo() ? efeitoDeTamanho(item) : null, ...fontesVirtuais.map((fonte) => fonte(item))]
    .filter(Boolean);
}

const filtrosDeEfeito = [];

/** Outra função que tira um efeito real da lista de um item. */
export function registrarFiltroDeEfeito(filtro) {
  filtrosDeEfeito.push(filtro);
}

const liberado = (efeito, item) => filtrosDeEfeito.every((filtro) => filtro(efeito, item));

/** Último uso confirmado como manobra, esperando virar cartão. */
let manobraPendente = null;

/* ─── Lista de efeitos do sistema ─────────────────────────────────────────── */

/** v13: a lista é um getter; `_t20gJanelaDeUso` diz que a janela abriu. */
function ligarListaV13(proto) {
  const descritor = Object.getOwnPropertyDescriptor(proto, 'validOnUseEffects');
  if (!descritor?.get) return () => {};

  Object.defineProperty(proto, 'validOnUseEffects', {
    ...descritor,
    get() {
      const lista = descritor.get.call(this).filter((ef) => liberado(ef, this));
      if (this._t20gJanelaDeUso) return [...lista, ...efeitosVirtuais(this)];
      return ativo() ? lista.filter((ef) => !ehEfeitoDeManobra(ef)) : lista;
    }
  });
  return (item) => { item._t20gJanelaDeUso = true; };
}

/** v14: `roll()` guarda a lista no clone antes de decidir se abre a janela. */
function ligarListaV14(proto) {
  const original = proto._allApplicableOnUseEffects;
  if (typeof original !== 'function') return () => {};

  proto._allApplicableOnUseEffects = function (...args) {
    const lista = original.apply(this, args).filter((ef) => liberado(ef, this));
    return ativo() ? lista.filter((ef) => !ehEfeitoDeManobra(ef)) : lista;
  };
  return (item) => {
    // Perícia e atributo são objetos soltos, com lista montada pelo sistema.
    if (typeof item?._allApplicableOnUseEffects !== 'function') return;
    item.applicableOnUseEffects = unicosPorId([
      ...(item.applicableOnUseEffects ?? []),
      ...original.call(item).filter((ef) => liberado(ef, item)),
      ...efeitosVirtuais(item)
    ]);
  };
}

Hooks.once('setup', () => {
  const Dialogo = game.tormenta20?.applications?.AbilityUseDialog;
  const proto = CONFIG.Item?.documentClass?.prototype;
  if (!Dialogo || !proto || Dialogo._t20gManobra) return;

  const prepararJanela = ehV14() ? ligarListaV14(proto) : ligarListaV13(proto);
  const original = Dialogo.create;
  Dialogo.create = async function (item, ...resto) {
    prepararJanela(item);
    // A prévia passa por aqui a cada tecla, sem cartão nenhum.
    const usoReal = !item?._t20gPreview;
    // Uso anterior que parou antes do cartão (sem PM, por exemplo) não conta.
    if (usoReal) manobraPendente = null;
    const configuracao = await original.call(this, item, ...resto);
    if (configuracao?.t20gManobra && usoReal) manobraPendente = { quando: Date.now(), atorId: item?.actor?.id };
    return configuracao;
  };
  Dialogo._t20gManobra = true;
});

/* ─── Janela de uso ───────────────────────────────────────────────────────── */

function idDaLinha(linha) {
  return linha.querySelector('input[name$=".aplica"]')?.name.match(/^aprs\.([^.]+)\.aplica$/)?.[1];
}

/** Sem nenhum aprimoramento o sistema nem desenha a lista. */
export function garantirLista(form, comFonte) {
  const existente = form.querySelector('.aprimoramentos-list');
  if (existente) return existente;

  const grupo = document.createElement('div');
  grupo.className = 'form-group';
  grupo.innerHTML = `<ul class="item-list effects-list aprimoramentos-list">
      <li class="items-header item flexrow">
        <h3>${esc(game.i18n.localize('T20.Apply'))}</h3>
        <h3 style="flex: 2">${esc(game.i18n.localize('T20.Name'))}</h3>
        ${comFonte ? `<h3>${esc(game.i18n.localize('T20.Source'))}</h3>` : ''}
      </li>
    </ul>`;
  form.querySelector('.total-cost')?.before(grupo);
  return grupo.querySelector('.aprimoramentos-list');
}

function montarMarcador(comFonte) {
  const linha = document.createElement('li');
  linha.className = 'item flexrow t20g-manobra';
  linha.innerHTML = `<div class="item-cost flexrow"><input type="checkbox"> -</div>
    <h4 class="item-name" style="flex: 2">${esc(t('Manobra'))}</h4>
    ${comFonte ? '<small></small>' : ''}
    <input type="hidden" name="t20gManobra" value="">`;
  return linha;
}

/** v13: o sistema só desenha efeitos reais; a linha dos virtuais é daqui. */
export function montarLinhaVirtual(efeito) {
  const linha = document.createElement('li');
  linha.className = 'item flexrow';
  linha.innerHTML = `<div class="item-cost flexrow">
      <input type="checkbox" name="aprs.${efeito.id}.aplica" value="1" ${efeito.disabled ? '' : 'checked'}> -
      <input type="hidden" name="aprs.${efeito.id}.custo" value="0">
    </div>
    <h4 class="item-name" style="flex: 2">${esc(efeito.name)}</h4>
    <small>${esc(efeito.sourceName)}</small>`;
  return linha;
}

function rotuloDoTamanho(tamanho) {
  const modificador = modificadorDeManobra(tamanho);
  const sinal = modificador > 0 ? '+' : '';
  return `${CONFIG.T20.actorSizes?.[tamanho] ?? tamanho} (${sinal}${modificador})`;
}

/** Troca o nome da linha de tamanho por um seletor; a escolha fica no ator. */
function montarSeletorDeTamanho(linha, item) {
  const ator = item.actor;
  const atual = tamanhoDeManobra(ator);
  const seletor = document.createElement('select');
  seletor.className = 't20g-manobra-tamanho';
  seletor.innerHTML = TAMANHOS.map((tamanho) =>
    `<option value="${tamanho}" ${tamanho === atual ? 'selected' : ''}>${esc(rotuloDoTamanho(tamanho))}</option>`).join('');
  seletor.addEventListener('change', () => {
    tamanhoEscolhido.set(ator.uuid, seletor.value);
    // v14: a lista é guardada no item; v13: o getter refaz o efeito.
    if (item.applicableOnUseEffects) {
      item.applicableOnUseEffects = item.applicableOnUseEffects
        .map((ef) => (ef.id === ID_EFEITO_TAMANHO ? efeitoDeTamanho(item) : ef));
    }
    if (ator.isOwner) ator.setFlag(MODULE_ID, FLAG_TAMANHO, seletor.value);
  });
  const nome = linha.querySelector('.item-name');
  nome.replaceChildren(`${t('ManobraTamanhoRotulo')} `, seletor);
}

/**
 * Liga ou desliga as linhas de manobra. Desligadas, nada delas vai no
 * formulário; religadas, voltam como o sistema as desenhou.
 */
function mostrarLinhas(linhas, mostrar) {
  for (const linha of linhas) {
    linha.classList.toggle('t20g-oculto', !mostrar);
    const entrada = linha.querySelector('input[name$=".aplica"]');
    if (!entrada) continue;
    if (entrada.type === 'checkbox') entrada.checked = mostrar && entrada.defaultChecked;
    else entrada.value = '0';
  }
}

Hooks.on('renderAbilityUseDialog', (app, html) => {
  if (!ativo()) return;
  const item = app?.item;
  const raiz = html?.[0] ?? html;
  const form = raiz?.querySelector?.('#ability-use-form') ?? raiz;
  if (!form?.querySelector || form.querySelector('.t20g-manobra')) return;

  const efeitos = item?.applicableOnUseEffects ?? item?.validOnUseEffects ?? [];
  const ids = new Set(efeitos.filter(ehEfeitoDeManobra).map((ef) => ef.id));
  ids.add(ID_EFEITO_TAMANHO);
  const linhas = [...form.querySelectorAll('.aprimoramentos-list li')]
    .filter((linha) => ids.has(idDaLinha(linha)));

  const ehArma = item?.type === 'arma';
  // Fora das armas o marcador só aparece para não deixar um efeito de manobra
  // sem caminho até a janela.
  if (!ehArma && !linhas.length) return;

  const lista = garantirLista(form, ehArma);
  if (!lista) return;

  const tamanho = efeitos.find((ef) => ef.id === ID_EFEITO_TAMANHO);
  if (tamanho && !linhas.some((linha) => idDaLinha(linha) === ID_EFEITO_TAMANHO)) {
    linhas.push(montarLinhaVirtual(tamanho));
  }

  const linhaDoTamanho = linhas.find((linha) => idDaLinha(linha) === ID_EFEITO_TAMANHO);
  if (linhaDoTamanho) montarSeletorDeTamanho(linhaDoTamanho, item);

  const marcador = montarMarcador(ehArma);
  lista.querySelector('.items-header')?.after(marcador, ...linhas);
  for (const linha of linhas) linha.classList.add('t20g-manobra-filha');
  linhas.at(-1)?.classList.add('t20g-manobra-ultima');

  // Os botões do sistema só recalculam o custo nas linhas dele.
  const comCusto = linhas.some((linha) => Number(linha.querySelector('input[type=hidden]')?.value));
  const recalcular = () => { if (comCusto) app._onInputChange?.(app.element); };

  marcador.querySelector('input').addEventListener('change', (evento) => {
    mostrarLinhas(linhas, evento.target.checked);
    marcador.querySelector('input[name=t20gManobra]').value = evento.target.checked ? '1' : '';
    recalcular();
  });

  mostrarLinhas(linhas, false);
  recalcular();
});

/* ─── Marca no chat ───────────────────────────────────────────────────────── */

Hooks.on('preCreateChatMessage', (message) => {
  if (!manobraPendente) return;
  const { quando, atorId } = manobraPendente;
  const conteudo = String(message.content ?? '');
  if (!conteudo.includes('chat-card item-card') || !conteudo.includes(`data-actor-id="${atorId}"`)) return;
  manobraPendente = null;
  if (Date.now() - quando < VALIDADE_MS) message.updateSource({ [`flags.${MODULE_ID}.${FLAG_MANOBRA}`]: true });
});

Hooks.on('renderChatMessageHTML', (message, html) => {
  if (!message.getFlag?.(MODULE_ID, FLAG_MANOBRA)) return;
  const raiz = html?.querySelector ? html : html?.[0];
  const card = raiz?.querySelector?.('.chat-card.item-card');
  if (!card || card.querySelector('.t20g-manobra-aviso')) return;
  const aviso = document.createElement('div');
  aviso.className = 't20g-manobra-aviso';
  aviso.innerHTML = `<i class="fa-solid fa-hand-fist"></i> ${esc(t('Manobra'))}`;
  const primeiraRolagem = card.querySelector('.roll');
  if (primeiraRolagem) primeiraRolagem.before(aviso);
  else card.appendChild(aviso);
});

/* ─── Ficha do efeito ─────────────────────────────────────────────────────── */

Hooks.on('renderActiveEffectConfig', (app, html) => {
  if (!ativo()) return;
  const el = html?.querySelector ? html : (html?.[0] ?? null);
  // v14: efeito de uso virou uma aba própria. v13: um bloco da aba Detalhes.
  const uso = el?.querySelector?.(ehV14()
    ? 'section.tab[data-tab="onuse"]'
    : 'section.tab[data-tab="details"] fieldset');
  if (!uso || uso.querySelector('.t20g-efeito-manobra')) return;

  const nome = `flags.${MODULE_ID}.${FLAG_MANOBRA}`;
  const id = `${app.id}-${nome}`;
  const marcado = app.document.getFlag(MODULE_ID, FLAG_MANOBRA) ? 'checked' : '';
  uso.insertAdjacentHTML('beforeend', `
    <div class="form-group t20g-efeito-manobra">
      <label for="${id}">${esc(t('ManobraEfeito'))}</label>
      <div class="form-fields"><input type="checkbox" id="${id}" name="${nome}" ${marcado}></div>
      <p class="hint">${esc(t('ManobraEfeitoDica'))}</p>
    </div>`);
});

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, SETTING, {
    name: 'T20HaydGMTools.SettingManobraName',
    hint: 'T20HaydGMTools.SettingManobraHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });
});
