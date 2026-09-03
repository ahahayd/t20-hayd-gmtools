import {
  MODULE_ID,
  automacoesAtivas,
  podeControlar,
  souResponsavelPeloAtor
} from '../runtime.mjs';
import { APARATOS, nomeAparato } from './catalogo.mjs';
import {
  bonusPorDado,
  calcularCD,
  corrigirFalhaParaSucesso,
  corrigirSucessoParaFalha,
  custoAprimoramentos,
  custoPadraoDoCirculo,
  dadoExtraDaFormula,
  depoisDaTentativa,
  modificadorAparatos,
  normalizarEstado,
  resetarDia,
  temAparato
} from './regras.mjs';

const FLAG = 'engenhoca';
const FLAG_DESCANSO = 'engenhocasDescanso';
const FLAG_ATIVACAO = 'engenhocaAtivacao';
const AUTOMACAO = 'engenhoqueiro';
const atrasos = new Map();
const descansosPendentes = new Map();
const conjuracoesEmCurso = new Map();
// Uma segunda ativação da MESMA engenhoca enquanto a primeira ainda está
// rolando (perícia + teste) faria duas execuções lerem e gravarem o mesmo
// item ao mesmo tempo.
const ativacoesEmAndamento = new Set();
let timerDescanso = null;

const esc = (valor) => foundry.utils.escapeHTML(String(valor ?? ''));

export function poderEngenhoqueiro(ator) {
  return ator?.items?.find((item) => item.type === 'poder'
    && item.getFlag(MODULE_ID, 'automacao') === AUTOMACAO) ?? null;
}

export function temEngenhoqueiro(ator) {
  return !!poderEngenhoqueiro(ator);
}

export function ehEngenhoca(item, { exigirPoder = true } = {}) {
  return item?.type === 'magia' && item.system?.tipo === 'eng'
    && (!exigirPoder || temEngenhoqueiro(item.actor));
}

function estadoBruto(item) {
  return item?.getFlag?.(MODULE_ID, FLAG) ?? null;
}

export function estadoDaEngenhoca(item) {
  const bruto = estadoBruto(item);
  const custoAtual = Number(item?.system?.ativacao?.custo) || 0;
  return normalizarEstado(bruto, {
    custoBase: bruto?.custoBase ?? (custoAtual || custoPadraoDoCirculo(item?.system?.circulo)),
    atributoCD: bruto?.atributoCDOriginal ?? item?.system?.resistencia?.atributo ?? ''
  });
}

/**
 * O item real por trás de um clone de `Item.roll()`.
 *
 * O roll() nativo do T20 faz `this.clone({ keepId: true })` — só que
 * `clone(dados, contexto)` recebe DOIS parâmetros, e o sistema passa
 * `{keepId:true}` como DADO (o primeiro), não como CONTEXTO (o segundo, onde
 * `keepId` é de fato lido). `keepId` nunca chega a valer `true`, e o clone
 * SEMPRE perde o `_id` — bug do próprio sistema, reproduzível em qualquer
 * `Item.roll()`, não só engenhoca. Por isso nunca dá para achar o item real
 * fazendo `ator.items.get(clone.id)`: `clone.id` é sempre `undefined`.
 *
 * `ligarFluxo()` guarda o item real aqui, pela mesma chave de `chaveItem`,
 * no instante em que ainda o tem (antes do roll() nativo criar o clone).
 */
const itensReaisPendentes = new Map();

function itemReal(item) {
  return itensReaisPendentes.get(chaveItem(item)) ?? item;
}

async function gravarEstado(item, estado) {
  const real = itemReal(item);
  // `.update()`/`.setFlag()` gravam `_id: this.id` sem checar o valor; um
  // item sem `.id` (referência perdida, item apagado no meio da ativação)
  // vira o erro nativo "You must provide an _id...". Falhar aqui em vez de
  // deixar chegar lá evita que o resto do fluxo de ativação seja abortado.
  if (!real?.id) {
    console.error(`${MODULE_ID} | Engenhoca sem referência válida ao gravar estado`,
      { item: item?.name, actor: item?.actor?.name });
    return;
  }
  await real.setFlag(MODULE_ID, FLAG, normalizarEstado(estado, {
    custoBase: estado?.custoBase,
    atributoCD: estado?.atributoCDOriginal
  }));
  atualizarBarras(real);
  atualizarPaineis(real.actor);
}

function cdAtual(item, estado = estadoDaEngenhoca(item)) {
  return calcularCD({
    custoBase: estado.custoBase,
    usosDia: estado.usosDia,
    aparatos: estado.aparatos,
    resfriada: estado.resfriada
  });
}

/**
 * Chave estável para uma engenhoca — ator + NOME, nunca `.id`.
 *
 * `.id` é exatamente o que o clone de `Item.roll()` não tem (ver itemReal
 * acima) — uma chave baseada nele juntaria toda ativação-via-clone sob a
 * mesma entrada `"ator:undefined"`. O nome não muda no meio de uma ativação
 * e é o que sobra confiável tanto no clone quanto no item real.
 */
function chaveItem(item) {
  return `${item?.actor?.uuid ?? item?.actor?.id ?? ''}::${item?.name ?? ''}`;
}

function igual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Zera custo base e força Inteligência sem perder os valores originais. */
export async function sincronizarAtor(ator) {
  if (!ator?.items || !ator.isOwner) return;
  const ativo = automacoesAtivas() && temEngenhoqueiro(ator);
  const updates = [];

  for (const item of ator.items) {
    if (item.type !== 'magia') continue;
    const bruto = estadoBruto(item);
    const gerenciada = item.system?.tipo === 'eng' && ativo;
    if (!gerenciada && !bruto) continue;

    if (!gerenciada) {
      const estado = estadoDaEngenhoca(item);
      const dados = { _id: item.id };
      if (Number(item.system?.ativacao?.custo) !== estado.custoBase) {
        dados['system.ativacao.custo'] = estado.custoBase;
      }
      const original = estado.atributoCDOriginal;
      if (item.system?.resistencia?.atributo !== original) {
        dados['system.resistencia.atributo'] = original;
      }
      if (Object.keys(dados).length > 1) updates.push(dados);
      continue;
    }

    const custoVisivel = Number(item.system?.ativacao?.custo) || 0;
    const custoInicial = bruto?.custoBase
      ?? (custoVisivel || custoPadraoDoCirculo(item.system?.circulo));
    const estado = normalizarEstado(bruto, {
      custoBase: custoInicial,
      atributoCD: item.system?.resistencia?.atributo ?? ''
    });
    const dados = { _id: item.id };
    if (custoVisivel !== 0) dados['system.ativacao.custo'] = 0;
    if (item.system?.resistencia?.atributo !== 'int') {
      dados['system.resistencia.atributo'] = 'int';
    }
    if (!igual(bruto, estado)) dados[`flags.${MODULE_ID}.${FLAG}`] = estado;
    if (Object.keys(dados).length > 1) updates.push(dados);
  }

  if (updates.length) await ator.updateEmbeddedDocuments('Item', updates);
}

export function agendarSincronizacao(ator) {
  if (!ator || !souResponsavelPeloAtor(ator)) return;
  const chave = ator.uuid ?? ator.id;
  clearTimeout(atrasos.get(chave));
  atrasos.set(chave, setTimeout(() => {
    atrasos.delete(chave);
    sincronizarAtor(ator).catch((err) =>
      console.error(`${MODULE_ID} | Falha ao sincronizar engenhocas`, err));
  }, 50));
}

export function aoMudarItem(item, mudancas = {}) {
  const ator = item?.actor;
  if (!ator || !souResponsavelPeloAtor(ator)) return;

  // Editar o custo enquanto a engenhoca está gerenciada redefine seu custo
  // original; a sincronização volta a mostrar zero logo depois.
  const mudouCusto = foundry.utils.hasProperty(mudancas, 'system.ativacao.custo')
    || Object.hasOwn(mudancas, 'system.ativacao.custo');
  const novoCusto = Number(foundry.utils.getProperty(mudancas, 'system.ativacao.custo')
    ?? mudancas['system.ativacao.custo']);
  if (ehEngenhoca(item) && mudouCusto && novoCusto > 0) {
    const estado = estadoDaEngenhoca(item);
    item.setFlag(MODULE_ID, FLAG, { ...estado, custoBase: novoCusto }).catch((err) =>
      console.error(`${MODULE_ID} | Falha ao guardar custo da engenhoca`, err));
  }
  agendarSincronizacao(ator);
}

export function resumoPoder(item) {
  const ator = item?.actor;
  const total = ator?.items?.filter((i) => i.type === 'magia' && i.system?.tipo === 'eng').length ?? 0;
  const inteligencia = Number(ator?.system?.atributos?.int?.value) || 0;
  return { total, inteligencia };
}

function aplicabilidade(item, aparato) {
  if (aparato.aplicacao === 'cura') {
    return item.system?.rolls?.some((r) => r.parts?.some((p) => p[1] === 'curapv'));
  }
  if (aparato.aplicacao === 'dano') {
    return item.system?.rolls?.some((r) => r.type === 'dano'
      && !r.parts?.some((p) => ['curapv', 'curatpv', 'curapm', 'curatpm'].includes(p[1])));
  }
  if (aparato.aplicacao === 'acao-padrao') return item.system?.ativacao?.execucao === 'action';
  return true;
}

/** Configura os dois espaços de aparatos da magia. */
export async function abrirAparatos(item) {
  item = itemReal(item);
  if (!ehEngenhoca(item) || !podeControlar(item.actor)) return;
  const estado = estadoDaEngenhoca(item);
  const quantidade = (id) => estado.aparatos.filter((a) => a === id).length;
  const linhas = Object.entries(APARATOS).map(([id, aparato]) => {
    const serve = aplicabilidade(item, aparato);
    const controle = aparato.repetivel
      ? `<input type="number" name="aparato-${id}" min="0" max="2" step="1" value="${quantidade(id)}">`
      : `<input type="checkbox" name="aparato-${id}" ${quantidade(id) ? 'checked' : ''}>`;
    return `<label class="t20g-eng-aparato ${serve ? '' : 't20g-eng-inaplicavel'}">
      ${controle}<i class="${aparato.icone}"></i><span><b>${aparato.nome}</b>
      <small>${aparato.automacao}${serve ? '' : ' Não se aplica naturalmente a esta magia.'}</small></span>
      <em>${aparato.manual ? 'lembrete' : 'automático'}</em>
    </label>`;
  }).join('');

  const escolha = await foundry.applications.api.DialogV2.wait({
    window: { title: `Aparatos — ${item.name}`, icon: 'fa-solid fa-gears' },
    position: { width: 620 },
    content: `<div class="t20g-eng-dialogo">
      <p class="notes">Até dois aparatos — um soma +2 à CD, dois somam +5 (só Espera para Melhorias repete).</p>
      <div class="t20g-eng-lista">${linhas}</div></div>`,
    rejectClose: false,
    buttons: [
      {
        action: 'salvar', label: 'Salvar', icon: 'fa-solid fa-check', default: true,
        callback: (_ev, botao) => {
          const aparatos = [];
          for (const [id, aparato] of Object.entries(APARATOS)) {
            const campo = botao.form.elements[`aparato-${id}`];
            const n = aparato.repetivel ? Math.max(0, Math.min(2, Number(campo?.value) || 0))
              : campo?.checked ? 1 : 0;
            for (let i = 0; i < n; i += 1) aparatos.push(id);
          }
          return aparatos;
        }
      },
      { action: 'cancelar', label: 'Cancelar', icon: 'fa-solid fa-xmark' }
    ]
  });
  if (!Array.isArray(escolha)) return;
  if (escolha.length > 2) {
    ui.notifications.warn('Uma engenhoca pode ter no máximo dois aparatos.');
    return abrirAparatos(item);
  }
  if (escolha.includes('engenho-automacao') && !escolha.includes('conversor-alimentador')) {
    ui.notifications.warn('Engenho de Automação exige Conversor-Alimentador.');
    return abrirAparatos(item);
  }

  const novo = { ...estado, aparatos: escolha };
  if (!escolha.includes('gatilho-corda')) novo.gatilhoPronto = true;
  await gravarEstado(item, novo);
  ui.notifications.info(`Aparatos de ${item.name} atualizados.`);
}

function engenhocasDoAtor(ator) {
  return [...(ator?.items ?? [])]
    .filter((item) => ehEngenhoca(item))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function linhaPainel(item, controlar) {
  const estado = estadoDaEngenhoca(item);
  const aparatos = estado.aparatos.map(nomeAparato).join(', ') || 'Sem aparatos';
  const situacao = estado.enguicada
    ? '<span class="t20g-eng-painel-alerta"><i class="fa-solid fa-triangle-exclamation"></i> Enguiçada</span>'
    : estado.resfriada
      ? '<span><i class="fa-solid fa-snowflake"></i> Resfriada</span>'
      : '';
  // Enguiçada substitui Ativar por Consertar — nunca os dois juntos, senão o
  // botão de ativar continua clicável (e o roll() só bloqueia DEPOIS, com um
  // aviso que passa despercebido se a janela tiver sido fechada e reaberta).
  const acaoPrincipal = estado.enguicada
    ? `<button type="button" class="t20g-eng-painel-consertar" data-eng-painel-acao="consertar"
        data-item-id="${item.id}"><i class="fa-solid fa-wrench"></i> Consertar engenhoca</button>`
    : `<button type="button" class="t20g-eng-painel-ativar" data-eng-painel-acao="ativar"
        data-item-id="${item.id}"><i class="fa-solid fa-play"></i> Ativar</button>`;
  const controles = controlar ? `<div class="t20g-eng-painel-controles">
      ${acaoPrincipal}
      <button type="button" data-eng-painel-acao="diminuir" data-item-id="${item.id}"
        data-tooltip="Diminuir um uso diário (−5 na CD)" ${estado.usosDia <= 0 ? 'disabled' : ''}>
        <i class="fa-solid fa-minus"></i></button>
      <span>${estado.usosDia} uso(s)</span>
      <button type="button" data-eng-painel-acao="aumentar" data-item-id="${item.id}"
        data-tooltip="Aumentar um uso diário (+5 na CD)"><i class="fa-solid fa-plus"></i></button>
      <button type="button" class="t20g-eng-painel-aparatos" data-eng-painel-acao="aparatos"
        data-item-id="${item.id}"><i class="fa-solid fa-gears"></i> Aparatos</button>
    </div>` : `<span class="t20g-eng-painel-leitura">${estado.usosDia} uso(s)</span>`;
  return `<article class="t20g-eng-painel-item" data-item-id="${item.id}">
    <img src="${esc(item.img)}" alt="">
    <div class="t20g-eng-painel-info">
      <div><b>${esc(item.name)}</b>${situacao}</div>
      <small>${esc(aparatos)}</small>
    </div>
    <div class="t20g-eng-painel-cd"><small>CD atual</small><b>${cdAtual(item, estado)}</b></div>
    ${controles}
  </article>`;
}

function conteudoPainel(ator) {
  const controlar = podeControlar(ator);
  const grupos = new Map();
  for (const item of engenhocasDoAtor(ator)) {
    const circulo = Math.max(0, Number(item.system?.circulo) || 0);
    if (!grupos.has(circulo)) grupos.set(circulo, []);
    grupos.get(circulo).push(item);
  }
  const circulos = [...grupos.keys()].sort((a, b) => a - b);
  const corpo = circulos.map((circulo) => `<section class="t20g-eng-painel-circulo">
    <h3>${circulo}º círculo</h3>
    ${grupos.get(circulo).map((item) => linhaPainel(item, controlar)).join('')}
  </section>`).join('');
  return `<div class="t20g-eng-painel-janela" data-actor-uuid="${ator.uuid}">
    <div class="t20g-eng-painel-janela-topo">
      <p class="notes">As CDs abaixo não incluem aprimoramentos escolhidos na próxima ativação.</p>
      ${controlar ? `<button type="button" data-eng-painel-acao="resetar">
        <i class="fa-solid fa-sun"></i> Resetar engenhocas</button>` : ''}
    </div>
    ${corpo || '<p class="notes">Nenhuma magia do tipo Engenhoca na ficha.</p>'}
  </div>`;
}

async function acaoPainel(ator, botao) {
  const acao = botao.dataset.engPainelAcao;
  if (!podeControlar(ator)) return;
  if (acao === 'resetar') return resetarEngenhocas([ator]);
  const item = ator.items.get(botao.dataset.itemId);
  if (!item || !ehEngenhoca(item)) return;
  if (acao === 'ativar') return item.roll();
  if (acao === 'aparatos') return abrirAparatos(item);
  const estado = estadoDaEngenhoca(item);
  if (acao === 'consertar') {
    await gravarEstado(item, { ...estado, enguicada: false });
    return ui.notifications.info(`${item.name} foi consertada (1 hora de trabalho).`);
  }
  if (acao === 'aumentar' || acao === 'diminuir') {
    const delta = acao === 'aumentar' ? 1 : -1;
    await gravarEstado(item, { ...estado, usosDia: Math.max(0, estado.usosDia + delta) });
  }
}

function ligarControlesPainel(container, ator) {
  container.querySelectorAll('[data-eng-painel-acao]').forEach((botao) => {
    botao.addEventListener('click', async (evento) => {
      evento.preventDefault();
      evento.stopPropagation();
      botao.disabled = true;
      try { await acaoPainel(ator, botao); }
      catch (err) {
        console.error(`${MODULE_ID} | Falha no painel de engenhocas`, err);
        ui.notifications.error('Não foi possível atualizar o painel de engenhocas.');
      } finally {
        if (botao.isConnected) botao.disabled = false;
      }
    });
  });
}

export async function abrirPainel(ator) {
  if (!temEngenhoqueiro(ator)) return;
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Engenhocas — ${ator.name}`, icon: 'fa-solid fa-gears' },
    position: { width: 760 },
    content: conteudoPainel(ator),
    rejectClose: false,
    buttons: [{ action: 'fechar', label: 'Fechar', icon: 'fa-solid fa-xmark', default: true }],
    render: (_evento, dialogo) => ligarControlesPainel(dialogo.element, ator)
  });
}

function montarBotoesFicha(ator) {
  const painel = document.createElement('section');
  painel.className = 't20g-eng-painel';
  painel.dataset.actorUuid = ator.uuid;
  painel.innerHTML = `<button type="button" data-eng-ficha-acao="abrir">
      <i class="fa-solid fa-gears"></i> Painel de Engenhocas
      <span>${engenhocasDoAtor(ator).length}</span></button>
    ${podeControlar(ator) ? `<button type="button" data-eng-ficha-acao="resetar">
      <i class="fa-solid fa-sun"></i> Resetar engenhocas</button>` : ''}`;
  painel.querySelector('[data-eng-ficha-acao="abrir"]')?.addEventListener('click', (evento) => {
    evento.preventDefault();
    abrirPainel(ator);
  });
  painel.querySelector('[data-eng-ficha-acao="resetar"]')?.addEventListener('click', async (evento) => {
    evento.preventDefault();
    evento.currentTarget.disabled = true;
    try { await resetarEngenhocas([ator]); }
    finally { if (evento.currentTarget.isConnected) evento.currentTarget.disabled = false; }
  });
  return painel;
}

/** Coloca o painel antes da lista nativa, tanto na ficha normal quanto na ficha em abas. */
export function injetarPainel(app, html) {
  if (!automacoesAtivas()) return;
  const ator = app?.actor ?? app?.document ?? app?.object;
  if (ator?.documentName !== 'Actor' || !temEngenhoqueiro(ator)) return;
  const root = html?.querySelector ? html : html?.[0];
  if (!root) return;
  const listas = root.querySelectorAll('.list-spells > ul.item-list, .tab.spells > ul.item-list');
  for (const lista of listas) {
    if (lista.previousElementSibling?.classList?.contains('t20g-eng-painel')) continue;
    lista.before(montarBotoesFicha(ator));
  }
}

export function atualizarPaineis(ator) {
  if (typeof document === 'undefined' || !ator) return;
  for (const antigo of document.querySelectorAll('.t20g-eng-painel')) {
    if (antigo.dataset.actorUuid !== ator.uuid) continue;
    antigo.replaceWith(montarBotoesFicha(ator));
  }
  for (const antiga of document.querySelectorAll('.t20g-eng-painel-janela')) {
    if (antiga.dataset.actorUuid !== ator.uuid) continue;
    const temp = document.createElement('div');
    temp.innerHTML = conteudoPainel(ator);
    const nova = temp.firstElementChild;
    ligarControlesPainel(nova, ator);
    antiga.replaceWith(nova);
  }
}

function opcoesPericia(ator, selecionada) {
  return Object.entries(ator.system?.pericias ?? {})
    .map(([id, pericia]) => ({ id, nome: pericia.label ?? CONFIG.T20.pericias?.[id]?.label ?? id }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((p) => `<option value="${p.id}" ${p.id === selecionada ? 'selected' : ''}>${esc(p.nome)}</option>`)
    .join('');
}

/**
 * Sistema de Refrigeração e Supressor de Segurança entram como checkboxes
 * aqui — decididos ANTES do teste, não em botão separado depois. Refrigeração
 * é opt-in (custa PM, some desmarcada); Supressor vem marcado quando
 * disponível (evita o enguiço se ESTE teste falhar) e desabilitado quando já
 * usado nesta cena, mas o Mestre pode desmarcar para guardá-lo para depois.
 */
async function escolherPericia(item, estado, cd, aprimoramentos) {
  const nomes = estado.aparatos.map(nomeAparato).join(', ') || 'nenhum';
  const podeResfriar = temAparato(estado, 'sistema-refrigeracao') && !estado.refrigeracaoUsada;
  const temSupressor = temAparato(estado, 'supressor-seguranca');
  const cdResfriada = Math.max(0, cd - 5);

  const camposExtras = [
    podeResfriar ? `<label class="t20g-eng-checagem">
        <input type="checkbox" name="resfriar" data-eng-resfriar>
        Acionar Sistema de Refrigeração (1 PM, −5 na CD desta ativação)
      </label>` : '',
    temSupressor ? `<label class="t20g-eng-checagem">
        <input type="checkbox" name="supressor" ${estado.supressorUsado ? '' : 'checked'}>
        Supressor de Segurança ${estado.supressorUsado
    ? '— já usado nesta cena; marque para acionar de novo mesmo assim'
    : '— evita o enguiço se este teste falhar'}
      </label>` : ''
  ].filter(Boolean).join('');

  return foundry.applications.api.DialogV2.wait({
    window: { title: `Ativar engenhoca — ${item.name}`, icon: 'fa-solid fa-gears' },
    position: { width: 470 },
    content: `<div class="t20g-eng-ativacao">
      <div class="t20g-eng-cd"><span>CD de ativação</span><b data-eng-cd-atual>${cd}</b></div>
      <p class="notes">15 + ${estado.custoBase} da magia + ${aprimoramentos} de aprimoramentos
      + ${estado.usosDia * 5} pelo uso no dia + ${modificadorAparatos(estado.aparatos)} pelos aparatos.</p>
      <div class="form-group"><label>Perícia do teste</label><select name="pericia">
        ${opcoesPericia(item.actor, estado.pericia)}
      </select></div>
      <p><b>Aparatos:</b> ${esc(nomes)}</p>
      ${camposExtras}
    </div>`,
    rejectClose: false,
    buttons: [
      {
        action: 'ativar', label: 'Fazer teste', icon: 'fa-solid fa-dice-d20', default: true,
        callback: (_ev, botao) => ({
          pericia: botao.form.elements.pericia.value,
          resfriar: !!botao.form.elements.resfriar?.checked,
          supressor: !!botao.form.elements.supressor?.checked
        })
      },
      { action: 'cancelar', label: 'Cancelar', icon: 'fa-solid fa-xmark' }
    ],
    render: !podeResfriar ? undefined : (_ev, dialogo) => {
      const caixa = dialogo.element.querySelector('input[data-eng-resfriar]');
      const rotulo = dialogo.element.querySelector('[data-eng-cd-atual]');
      caixa?.addEventListener('change', () => {
        rotulo.textContent = String(caixa.checked ? cdResfriada : cd);
      });
    }
  });
}

/** Rola uma perícia com a janela nativa e um efeito transitório de PDA. */
async function rolarAtivacao(item, periciaId, cd, estado) {
  const ator = item.actor;
  const pericia = ator.system?.pericias?.[periciaId];
  if (!pericia) return null;
  const rotulo = pericia.label ?? CONFIG.T20.pericias?.[periciaId]?.label ?? periciaId;
  const titulo = `${rotulo} — ${item.name} (CD ${cd})`;
  const rollData = ator.getRollData();
  const pda = Number(rollData.pda) || 0;
  // O valor preparado já contém a PDA quando a perícia pede. Ela sai da base
  // e volta como efeito de uso somente para Engenhoqueiro.
  // A subtração só pode acontecer junto com o efeito que a devolve — do
  // contrário, trocar para outra perícia com PDA (Acrobacia, Furtividade…)
  // rola sem a própria penalidade de armadura dela.
  const base = periciaId === 'enge'
    ? Number(pericia.value) - (pericia.pda ? pda : 0)
    : Number(pericia.value);
  let efeitoPda = null;

  try {
    if (periciaId === 'enge' && !temAparato(estado, 'giroscopio') && pda) {
      [efeitoPda] = await ator.createEmbeddedDocuments('ActiveEffect', [{
        name: `Engenhoca: Penalidade de Armadura (${pda})`,
        img: 'icons/svg/downgrade.svg',
        disabled: false,
        changes: [{ key: 'roll', mode: 2, value: String(pda), priority: 20 }],
        flags: {
          tormenta20: { onuse: true, skill: true, custo: '0', items: rotulo },
          [MODULE_ID]: { engenhocaPda: true }
        }
      }]);
    }

    const dados = {
      // O nome precisa continuar sendo exatamente o da perícia: é assim que
      // o T20 filtra efeitos de uso restritos por `flags.tormenta20.items`.
      name: rotulo,
      label: titulo,
      type: 'pericia',
      parts: ['1d20', String(base)],
      id: periciaId,
      actor: ator,
      img: item.img,
      system: { ativacao: { custo: 0 } },
      isOwned: true,
      effects: []
    };
    const Dialogo = game.tormenta20?.applications?.AbilityUseDialog;
    const configuracao = await Dialogo?.create(dados);
    if (!configuracao) return null;
    const opcoes = foundry.utils.mergeObject({
      parts: dados.parts,
      actor: ator,
      event: {},
      data: rollData,
      title: titulo,
      flavor: `Ativação de Engenhoca — CD ${cd}`
    }, configuracao);
    const roll = await game.tormenta20.dice.d20Roll(opcoes);
    configuracao.itemData = dados;
    configuracao.effects ??= [];
    dados.rolled = roll;
    const message = await ator.displayCard({ options: configuracao, rollMode: configuracao.rollMode });
    return { roll, message };
  } finally {
    if (efeitoPda) await efeitoPda.delete().catch(() => null);
  }
}

function aplicarEfeitosDosAparatos(item, configuracao, estado) {
  if (temAparato(estado, 'captador-luz')) {
    for (const roll of item.system?.rolls ?? []) {
      for (const parte of roll.parts ?? []) {
        if (parte[1] === 'curapv') parte[0] = bonusPorDado(parte[0]);
      }
    }
  }
  if (temAparato(estado, 'estimulador-sobrecarga')) {
    for (const roll of item.system?.rolls ?? []) {
      if (roll.type !== 'dano') continue;
      if (roll.parts?.some((p) => ['curapv', 'curatpv', 'curapm', 'curatpm'].includes(p[1]))) continue;
      const parte = roll.parts?.find((p) => /\d+d\d+/i.test(String(p[0])));
      const dado = dadoExtraDaFormula(parte?.[0]);
      // Parcela separada é essencial para compor com Seta Infalível: o
      // distribuidor reconhece este dado como bônus, não como outra seta.
      if (dado) roll.parts.push([dado, parte[1] ?? '', 'Estimulador de Sobrecarga']);
    }
  }
  if (temAparato(estado, 'estabilizador')) {
    item.system.resistencia.bonus = (Number(item.system.resistencia.bonus) || 0) + 2;
    item.system.resistencia.cd = (Number(item.system.resistencia.cd) || 0) + 2;
    // O cartão da magia não lê `resistencia.cd` direto — mostra
    // `labels.header`, uma string tipo "Resistência: Vontade (CD 15);" já
    // MONTADA em `_prepareLabels()` (chamado dentro do próprio diálogo
    // nativo, ANTES do aparato entrar em jogo). Sem reconstruir o label
    // aqui, o +2 fica certo no número interno mas o texto do cartão continua
    // mostrando a CD antiga — é exatamente esse o "feio" de escrever uma
    // nota à parte em vez de a própria CD do cartão subir.
    item._prepareLabels?.();
  }
  if (temAparato(estado, 'gatilho-corda')) item.system.ativacao.execucao = 'move';

  configuracao.onUseEffects ??= [];
  for (const id of estado.aparatos) {
    const aparato = APARATOS[id];
    configuracao.onUseEffects.push({
      description: aparato.nome,
      cost: '', qty: 1
    });
  }
}

function conteudoResultadoAtivacao(item, {
  sucesso, cd, total, suprimiu = false, transformado = false, conjurada = null, proximaCD = null
}) {
  // A engenhoca conjura SEMPRE, sucesso ou falha — só o enguiço muda (ver
  // executarAtivacao). Distinguir por `conjurada` continua fazendo sentido:
  // é o sistema quem confirma se o fluxo nativo terminou de verdade.
  const resultado = conjurada === false
    ? `<b>${sucesso ? 'Sucesso' : 'Falha'} no teste.</b> O sistema não conseguiu concluir a ativação de <b>${esc(item.name)}</b>.`
    : sucesso
      ? conjurada === true
        ? `<b>Sucesso.</b> A engenhoca <b>${esc(item.name)}</b> foi ativada.`
        : `<b>Sucesso.</b> A engenhoca <b>${esc(item.name)}</b> foi ativada — conjurando pelo fluxo nativo.`
      : suprimiu
        ? `<b>Falha suprimida.</b> O efeito é gerado normalmente; o Supressor impede que a engenhoca enguiçe.`
        : conjurada === true
          ? `<b>Falha.</b> O efeito é gerado normalmente, mas a engenhoca enguiça.`
          : `<b>Falha.</b> O efeito será gerado pelo fluxo nativo, mas a engenhoca enguiça.`;
  // Um botão só, sempre o OPOSTO do resultado atual: dá para corrigir e
  // voltar atrás quantas vezes o Mestre precisar, nas duas direções.
  const transformar = sucesso
    ? `<button type="button" data-acao-engenhoca="transformar-falha">
        <i class="fa-solid fa-rotate-left"></i> Transformar em falha</button>`
    : `<button type="button" data-acao-engenhoca="transformar-sucesso">
        <i class="fa-solid fa-rotate"></i> Transformar em sucesso</button>`;
  return `<section class="t20g-eng-ativacao-resultado ${sucesso ? 'sucesso' : 'falha'}"
    data-eng-actor-id="${item.actor.id}" data-eng-item-id="${item.id}">
    <div><i class="fa-solid ${sucesso ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
      <span><b>CD alvo ${cd}</b> · resultado ${total}${transformado ? ' (corrigido à mão)' : ''}</span></div>
    <p>${resultado}</p>
    ${proximaCD != null ? `<p class="notes">Próxima CD no dia: <b>${proximaCD}</b></p>` : ''}
    ${transformar}
  </section>`;
}

async function atualizarMensagemAtivacao(message, item, dados, registro) {
  if (!message?.id) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = message.content;
  wrapper.querySelector('.t20g-eng-ativacao-resultado')?.remove();
  const destino = wrapper.querySelector('.tormenta20.chat-card') ?? wrapper;
  destino.insertAdjacentHTML('beforeend', conteudoResultadoAtivacao(item, dados));
  await message.update({
    content: wrapper.innerHTML,
    [`flags.${MODULE_ID}.${FLAG_ATIVACAO}`]: registro
  });
}

/** Flag na mensagem da MAGIA (não a do teste): veio de uma ativação falhada. */
const FLAG_CONJURACAO_FALHOU = 'engenhocaConjuracaoFalhou';
const AVISO_CONJURACAO_FALHOU = 't20g-eng-conjuracao-falhou-aviso';

/**
 * Marca/desmarca o cartão da MAGIA conjurada como vindo de um teste que
 * falhou — a magia é gerada de qualquer jeito (ver executarAtivacao), então
 * o cartão dela fica idêntico ao de um sucesso sem isto.
 */
async function marcarConjuracaoFalhou(message) {
  if (!message?.id || message.getFlag(MODULE_ID, FLAG_CONJURACAO_FALHOU)) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = message.content;
  const card = wrapper.querySelector('.tormenta20.chat-card') ?? wrapper;
  card.classList.add('t20g-eng-conjuracao-falhou');
  card.insertAdjacentHTML('afterbegin', `<p class="${AVISO_CONJURACAO_FALHOU}">
    <i class="fa-solid fa-triangle-exclamation"></i> Engenhoca enguiçou neste uso</p>`);
  await message.update({
    content: wrapper.innerHTML,
    [`flags.${MODULE_ID}.${FLAG_CONJURACAO_FALHOU}`]: true
  });
}

async function desmarcarConjuracaoFalhou(message) {
  if (!message?.id || !message.getFlag(MODULE_ID, FLAG_CONJURACAO_FALHOU)) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = message.content;
  const card = wrapper.querySelector('.tormenta20.chat-card') ?? wrapper;
  card.classList.remove('t20g-eng-conjuracao-falhou');
  card.querySelector(`.${AVISO_CONJURACAO_FALHOU}`)?.remove();
  await message.update({
    content: wrapper.innerHTML,
    [`flags.${MODULE_ID}.-=${FLAG_CONJURACAO_FALHOU}`]: null
  });
}

async function prepararAtivacao(item, configuracao) {
  const real = itemReal(item);
  if (!real || !ehEngenhoca(real)) return configuracao;

  // Trava de execução única: escolher a perícia, rolar o teste e mostrar o
  // resultado passa por duas janelas e uma rolagem — clicar em ativar de
  // novo nesse meio-tempo faria duas execuções lerem/gravarem o mesmo item.
  // `.finally` cobre até executarAtivacao terminar de verdade, não só até
  // esta função montar o retorno (que pode ser o próprio executarAtivacao
  // ainda rodando).
  const chave = chaveItem(real);
  if (ativacoesEmAndamento.has(chave)) {
    ui.notifications.warn(`${real.name} já tem uma ativação em andamento.`);
    return null;
  }
  ativacoesEmAndamento.add(chave);
  return executarAtivacao(item, real, configuracao)
    .finally(() => ativacoesEmAndamento.delete(chave));
}

async function executarAtivacao(item, real, configuracao) {
  let estado = estadoDaEngenhoca(real);
  let custo = custoAprimoramentos(item.system?.ativacao?.custo, estado.aparatos);
  const inteligencia = Math.max(0, Number(item.actor?.system?.atributos?.int?.value) || 0);
  if (custo > inteligencia) {
    ui.notifications.warn(`Os aprimoramentos custam ${custo} PM, acima da Inteligência ${inteligencia}.`);
    return null;
  }
  item.system.ativacao.custo = custo;
  const cd = calcularCD({
    custoBase: estado.custoBase,
    aprimoramentos: custo,
    usosDia: estado.usosDia,
    aparatos: estado.aparatos,
    resfriada: estado.resfriada
  });
  const escolha = await escolherPericia(real, estado, cd, custo);
  // DialogV2 resolve com o próprio `action` quando o botão não tem callback —
  // "cancelar" chega aqui como string, não como o objeto que o botão Ativar
  // devolve. Qualquer coisa que não seja o objeto esperado é cancelamento.
  if (!escolha || typeof escolha !== 'object' || typeof escolha.pericia !== 'string') return null;
  const pericia = escolha.pericia;
  if (pericia !== estado.pericia) {
    estado = { ...estado, pericia };
    await gravarEstado(real, estado);
  }

  // Refrigeração é decidida ANTES do teste, não num botão separado depois:
  // muda a CD que de fato vale para ESTE teste, então precisa entrar no
  // cálculo antes de rolar, não depois.
  const podeResfriar = temAparato(estado, 'sistema-refrigeracao') && !estado.refrigeracaoUsada;
  const usouRefrigeracao = podeResfriar && escolha.resfriar;
  let cdFinal = cd;
  if (usouRefrigeracao) {
    const pm = real.actor.system?.attributes?.pm;
    if ((Number(pm?.value) || 0) + (Number(pm?.temp) || 0) < 1) {
      ui.notifications.warn('PM insuficientes para acionar o Sistema de Refrigeração.');
      return null;
    }
    await real.actor.spendMana(1, 0, false);
    cdFinal = Math.max(0, cd - 5);
  }

  const ativacao = await rolarAtivacao(real, pericia, cdFinal, estado);
  if (!ativacao?.roll) return null;

  const { roll, message } = ativacao;
  const sucesso = Number(roll.total) >= cdFinal;
  // O checkbox só é lido numa FALHA — mas vale mesmo se o Supressor já foi
  // usado nesta cena: "uma vez por cena" é só o padrão do checkbox
  // (desmarcado quando já usado), não uma trava. Marcar de novo de
  // propósito aciona o Supressor de novo.
  const usarSupressor = !sucesso && temAparato(estado, 'supressor-seguranca')
    && !!escolha.supressor;
  const proximo = depoisDaTentativa(estado, { sucesso, usarSupressor });
  if (usouRefrigeracao) proximo.refrigeracaoUsada = true;
  if (temAparato(estado, 'gatilho-corda') && sucesso) proximo.gatilhoPronto = false;
  await gravarEstado(real, proximo);
  const proximaCD = cdAtual(real, proximo);
  const registro = {
    actorUuid: real.actor.uuid,
    itemId: real.id,
    cd: cdFinal,
    custo,
    total: Number(roll.total),
    resultado: sucesso ? 'sucesso' : 'falha',
    executada: false,
    supressorAplicado: usarSupressor,
    enguiçou: !sucesso && !usarSupressor,
    estadoAntes: estado,
    proximaCD
  };
  await atualizarMensagemAtivacao(message, real, {
    sucesso,
    cd: cdFinal,
    total: Number(roll.total),
    suprimiu: usarSupressor,
    proximaCD
  }, registro);
  // A engenhoca conjura SEMPRE, sucesso ou falha — só o enguiço muda. Só
  // conjurar no sucesso exigia corrigir uma falha chamando item.roll() de
  // novo, e a segunda chamada reabre o diálogo nativo do zero: os
  // aprimoramentos aplicados aqui (Estimulador de Sobrecarga, Estabilizador…)
  // não sobrevivem a um segundo diálogo. Sempre conjurando, eles são
  // aplicados uma vez só, na única rolagem que existe.
  aplicarEfeitosDosAparatos(item, configuracao, estado);
  conjuracoesEmCurso.set(chaveItem(real), { messageId: message?.id, item: real });
  return configuracao;
}

function podeComecar(item) {
  const estado = estadoDaEngenhoca(item);
  if (estado.enguicada) {
    ui.notifications.warn(`${item.name} está enguiçada. Abra o Painel de Engenhocas e use “Consertar engenhoca”.`);
    return false;
  }
  if (temAparato(estado, 'gatilho-corda') && !estado.gatilhoPronto) {
    ui.notifications.warn(`${item.name} precisa receber corda antes de ser ativada novamente.`);
    return false;
  }
  return true;
}

/** Instala os dois wrappers necessários: item, diálogo e descanso. */
export function ligarFluxo() {
  const ItemT20 = game.tormenta20?.entities?.ItemT20;
  if (ItemT20 && !ItemT20.prototype._t20gEngenhocas) {
    const original = ItemT20.prototype.roll;
    ItemT20.prototype.roll = async function (opcoes = {}) {
      if (!automacoesAtivas() || !ehEngenhoca(this)) return original.call(this, opcoes);
      const chave = chaveItem(this);
      if (!podeComecar(this)) return undefined;

      // `this` é o item real, com `.id` de verdade — original.call() vai
      // clonar SEM id (ver itemReal). Guarda aqui, na mesma chave, enquanto
      // ainda é possível.
      itensReaisPendentes.set(chave, this);
      let resultado;
      try {
        resultado = await original.call(this, { ...opcoes, configureDialog: true });
      } catch (err) {
        itensReaisPendentes.delete(chave);
        const curso = conjuracoesEmCurso.get(chave);
        conjuracoesEmCurso.delete(chave);
        const mensagem = curso?.messageId ? game.messages.get(curso.messageId) : null;
        const registro = mensagem?.getFlag(MODULE_ID, FLAG_ATIVACAO);
        if (mensagem && registro) {
          await atualizarMensagemAtivacao(mensagem, this, {
            sucesso: registro.resultado === 'sucesso', cd: registro.cd, total: registro.total,
            suprimiu: registro.supressorAplicado, transformado: registro.transformado,
            conjurada: false, proximaCD: registro.proximaCD
          }, { ...registro, erroConjuracao: true });
        }
        throw err;
      }
      itensReaisPendentes.delete(chave);
      const curso = conjuracoesEmCurso.get(chave);
      conjuracoesEmCurso.delete(chave);
      const mensagem = curso?.messageId ? game.messages.get(curso.messageId) : null;
      const registro = mensagem?.getFlag(MODULE_ID, FLAG_ATIVACAO);
      if (mensagem && registro) {
        const conjurada = !!resultado?.id;
        const novo = {
          ...registro,
          executada: conjurada,
          erroConjuracao: !conjurada,
          mensagemConjuracaoId: conjurada ? resultado.id : null
        };
        await atualizarMensagemAtivacao(mensagem, this, {
          sucesso: registro.resultado === 'sucesso', cd: registro.cd, total: registro.total,
          suprimiu: registro.supressorAplicado, transformado: registro.transformado,
          conjurada, proximaCD: registro.proximaCD
        }, novo);
        // A magia é conjurada de qualquer jeito agora — o cartão DELA
        // recebe uma marca simples quando veio de um teste que falhou, já
        // que ela é idêntica à de um sucesso fora isso.
        if (conjurada && registro.resultado === 'falha') {
          await marcarConjuracaoFalhou(resultado).catch((err) =>
            console.error(`${MODULE_ID} | Falha ao marcar conjuração como falha`, err));
        }
      }
      return resultado;
    };
    ItemT20.prototype._t20gEngenhocas = true;
  }

  const Dialogo = game.tormenta20?.applications?.AbilityUseDialog;
  if (Dialogo && !Dialogo._t20gEngenhocas) {
    const original = Dialogo.create;
    Dialogo.create = async function (item, ...resto) {
      const configuracao = await original.call(this, item, ...resto);
      if (!automacoesAtivas() || !configuracao || !ehEngenhoca(item)) return configuracao;
      return prepararAtivacao(item, configuracao).catch((err) => {
        console.error(`${MODULE_ID} | Falha na ativação da engenhoca`, err);
        ui.notifications.error('Não foi possível processar a ativação da engenhoca.');
        return null;
      });
    };
    Dialogo._t20gEngenhocas = true;
  }

  const ActorT20 = game.tormenta20?.entities?.ActorT20;
  if (ActorT20 && !ActorT20.prototype._t20gDescansoEngenhocas) {
    const original = ActorT20.prototype.descanso;
    ActorT20.prototype.descanso = async function (...args) {
      const resultado = await original.call(this, ...args);
      if (automacoesAtivas()) registrarDescanso(this);
      return resultado;
    };
    ActorT20.prototype._t20gDescansoEngenhocas = true;
  }
}

/**
 * Corrige manualmente uma tentativa já registrada, nas duas direções.
 *
 * Substitui a detecção automática de rerrolagem: em vez de adivinhar pela
 * comparação de totais, o Mestre decide direto no cartão.
 */
async function transformarResultado(message, alvo) {
  // Cada saída cedo daqui é um jeito de "o botão não faz nada" — sem aviso
  // nenhum, é indistinguível de um bug silencioso. Cada uma agora fala o que
  // impediu, em vez de simplesmente devolver undefined.
  const registro = message?.getFlag?.(MODULE_ID, FLAG_ATIVACAO);
  if (!registro) {
    return ui.notifications.warn('Esta mensagem não tem uma ativação de engenhoca registrada.');
  }
  const ator = await fromUuid(registro.actorUuid).catch(() => null);
  const item = ator?.items?.get(registro.itemId);
  if (!item || !ehEngenhoca(item)) {
    return ui.notifications.warn('A engenhoca desta ativação não foi encontrada — item apagado ou automação desligada?');
  }
  if (!podeControlar(ator)) {
    return ui.notifications.warn(`Você não controla ${ator.name}.`);
  }
  if (alvo === registro.resultado) {
    return ui.notifications.info(`Esta ativação já está marcada como ${alvo}.`);
  }

  if (alvo === 'sucesso') await transformarEmSucesso(message, registro, item);
  else await transformarEmFalha(message, registro, item);
}

/** Corrige a CD/enguiço e reabre o diálogo de aprimoramentos para conjurar. */
/**
 * A conjuração já aconteceu na única rolagem que existe (ver
 * executarAtivacao) — transformar só corrige a CD/enguiço retroativamente e
 * atualiza a marca visual do cartão da MAGIA, sem rolar nada de novo.
 */
async function transformarEmSucesso(message, registro, item) {
  const corrigido = corrigirFalhaParaSucesso(
    estadoDaEngenhoca(item),
    registro.estadoAntes,
    { usarSupressor: registro.supressorAplicado }
  );
  await gravarEstado(item, corrigido);

  const proximaCD = cdAtual(item, corrigido);
  const novo = { ...registro, resultado: 'sucesso', transformado: true, proximaCD };
  await atualizarMensagemAtivacao(message, item, {
    sucesso: true, cd: registro.cd, total: registro.total,
    transformado: true, proximaCD, conjurada: registro.executada
  }, novo);

  if (registro.mensagemConjuracaoId) {
    const mensagemMagia = game.messages.get(registro.mensagemConjuracaoId);
    if (mensagemMagia) {
      await desmarcarConjuracaoFalhou(mensagemMagia).catch((err) =>
        console.error(`${MODULE_ID} | Falha ao desmarcar a conjuração`, err));
    }
  }
}

/** Corrige a CD/enguiço de volta — a magia continua conjurada, só passa a
 * carregar a marca visual de "veio de um teste que falhou". */
async function transformarEmFalha(message, registro, item) {
  const antes = normalizarEstado(registro.estadoAntes, {
    custoBase: registro.estadoAntes?.custoBase,
    atributoCD: registro.estadoAntes?.atributoCDOriginal
  });
  const usarSupressor = temAparato(antes, 'supressor-seguranca') && !antes.supressorUsado;
  const corrigido = corrigirSucessoParaFalha(estadoDaEngenhoca(item), registro.estadoAntes, { usarSupressor });
  await gravarEstado(item, corrigido);

  const proximaCD = cdAtual(item, corrigido);
  const novo = {
    ...registro,
    resultado: 'falha',
    supressorAplicado: usarSupressor,
    transformado: true,
    proximaCD
  };
  await atualizarMensagemAtivacao(message, item, {
    sucesso: false, cd: registro.cd, total: registro.total, suprimiu: usarSupressor,
    transformado: true, proximaCD, conjurada: registro.executada
  }, novo);

  if (registro.mensagemConjuracaoId) {
    const mensagemMagia = game.messages.get(registro.mensagemConjuracaoId);
    if (mensagemMagia) {
      await marcarConjuracaoFalhou(mensagemMagia).catch((err) =>
        console.error(`${MODULE_ID} | Falha ao marcar a conjuração como falha`, err));
    }
  }
}

function criarBotao(acao, icone, texto) {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 't20g-auto-btn t20g-auto-btn-largo';
  botao.dataset.acaoEngenhoca = acao;
  botao.innerHTML = `<i class="${icone}"></i> ${texto}`;
  return botao;
}

export function montarBarraChat(item) {
  if (!ehEngenhoca(item)) return null;
  const estado = estadoDaEngenhoca(item);
  const barra = document.createElement('footer');
  barra.className = 't20g-auto-barra t20g-engenhoca-barra';
  barra.dataset.itemId = item.id;
  const linha = document.createElement('div');
  linha.className = 't20g-auto-linha';
  const rotulo = document.createElement('div');
  rotulo.className = 't20g-auto-rotulo';
  const cd = cdAtual(item, estado);
  rotulo.innerHTML = `<i class="fa-solid fa-gears"></i> <b>Engenhoca (efeito mundano)</b>: 
   ${estado.usosDia} uso(s) no dia · ${estado.aparatos.map(nomeAparato).join(', ') || 'sem aparatos'}`;
  linha.appendChild(rotulo);
  if (podeControlar(item.actor)) {
    linha.appendChild(criarBotao('aparatos', 'fa-solid fa-gears', 'Aparatos'));
    // Consertar mora só no Painel de Engenhocas agora — ver linhaPainel().
    // Resfriar virou checkbox na própria janela de Ativar — ver
    // escolherPericia(). Os dois convivendo permitiriam acionar o mesmo
    // aparato duas vezes no mesmo dia.
    if (temAparato(estado, 'gatilho-corda') && !estado.gatilhoPronto) {
      linha.appendChild(criarBotao('dar-corda', 'fa-solid fa-rotate', 'Dar corda'));
    }
  }
  barra.appendChild(linha);
  return barra;
}

export function injetarBarra(message, html) {
  const container = html?.querySelector ? html : html?.[0];
  const card = container?.querySelector?.('.chat-card.item-card');
  if (!card || card.querySelector('.t20g-engenhoca-barra')) return;
  const actorId = card.dataset.actorId;
  let ator = actorId ? game.actors.get(actorId) : null;
  if (!ator && message?.speaker?.scene && message?.speaker?.token) {
    ator = game.scenes.get(message.speaker.scene)?.tokens.get(message.speaker.token)?.actor;
  }
  const item = ator?.items?.get(card.dataset.itemId);
  const barra = montarBarraChat(item);
  if (barra) card.appendChild(barra);
}

function atualizarBarras(item) {
  if (typeof document === 'undefined') return;
  for (const antiga of document.querySelectorAll('.t20g-engenhoca-barra')) {
    if (antiga.dataset.itemId !== item.id) continue;
    const nova = montarBarraChat(item);
    if (nova) antiga.replaceWith(nova);
  }
}

async function acaoDaBarra(item, acao) {
  const estado = estadoDaEngenhoca(item);
  if (acao === 'aparatos') return abrirAparatos(item);
  if (acao === 'dar-corda') {
    await gravarEstado(item, { ...estado, gatilhoPronto: true });
    return ui.notifications.info(`Você deu corda em ${item.name} (ação completa).`);
  }
}

export function ligarBotoesChat(message, html) {
  const container = html?.querySelector ? html : html?.[0];
  if (!container) return;
  container.querySelectorAll('[data-acao-engenhoca]').forEach((botao) => {
    if (botao.dataset.t20gLigado) return;
    botao.dataset.t20gLigado = '1';
    botao.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const acao = botao.dataset.acaoEngenhoca;

      // Transformar opera na MENSAGEM (lê/grava a flag da tentativa), não no
      // par ator/item resolvido abaixo — `message` já está no closure.
      if (acao === 'transformar-sucesso' || acao === 'transformar-falha') {
        botao.disabled = true;
        try {
          await transformarResultado(message, acao === 'transformar-sucesso' ? 'sucesso' : 'falha');
        } catch (err) {
          console.error(`${MODULE_ID} | Falha ao transformar o resultado da engenhoca`, err);
          ui.notifications.error('Não foi possível transformar o resultado da engenhoca.');
        } finally {
          botao.disabled = false;
        }
        return;
      }

      const card = botao.closest('.chat-card.item-card');
      const resultado = botao.closest('[data-eng-item-id]');
      const ator = game.actors.get(card?.dataset.actorId ?? resultado?.dataset.engActorId)
        ?? (message?.speaker?.scene && message?.speaker?.token
          ? game.scenes.get(message.speaker.scene)?.tokens.get(message.speaker.token)?.actor : null);
      const item = ator?.items?.get(card?.dataset.itemId ?? resultado?.dataset.engItemId);
      if (!item || !podeControlar(ator)) return;
      botao.disabled = true;
      try { await acaoDaBarra(item, acao); }
      catch (err) { console.error(`${MODULE_ID} | Falha no controle da engenhoca`, err); }
      finally { botao.disabled = false; }
    });
  });

  const descanso = message?.getFlag?.(MODULE_ID, FLAG_DESCANSO);
  if (!descanso) return;
  const atores = (descanso.actorIds ?? []).map((id) => game.actors.get(id)).filter(Boolean);
  const pode = atores.some((ator) => podeControlar(ator));
  container.querySelectorAll('[data-eng-descanso]').forEach((botao) => {
    if (!pode) { botao.remove(); return; }
    botao.addEventListener('click', async (ev) => {
      ev.preventDefault();
      botao.disabled = true;
      try {
        if (botao.dataset.engDescanso === 'resetar') await executarReset(message, atores);
        else if (botao.dataset.engDescanso === 'reverter') await reverterReset(message, descanso.snapshot);
      } catch (err) {
        console.error(`${MODULE_ID} | Falha no reset diário das engenhocas`, err);
      } finally { botao.disabled = false; }
    }, { once: true });
  });
}

function engenhocasDosAtores(atores) {
  return atores.flatMap((ator) => [...(ator?.items ?? [])]
    .filter((item) => ehEngenhoca(item)));
}

function registrarDescanso(ator) {
  if (!temEngenhoqueiro(ator)) return;
  descansosPendentes.set(ator.id, ator);
  clearTimeout(timerDescanso);
  timerDescanso = setTimeout(() => {
    const atores = [...descansosPendentes.values()];
    descansosPendentes.clear();
    oferecerReset(atores).catch((err) =>
      console.error(`${MODULE_ID} | Falha ao oferecer reset das engenhocas`, err));
  }, 900);
}

async function oferecerReset(atores) {
  const itens = engenhocasDosAtores(atores);
  if (!itens.length) return;
  const nomes = [...new Set(itens.map((i) => i.actor.name))].map(esc).join(', ');
  await ChatMessage.create({
    content: `<div class="t20g-eng-descanso"><h3><i class="fa-solid fa-gears"></i> Engenhocas — novo dia?</h3>
      <p>O descanso de <b>${nomes}</b> terminou. Deseja zerar os aumentos diários das CDs?</p>
      <button type="button" data-eng-descanso="resetar"><i class="fa-solid fa-sun"></i> Resetar CDs</button>
    </div>`,
    flags: { [MODULE_ID]: { [FLAG_DESCANSO]: { status: 'oferta', actorIds: atores.map((a) => a.id) } } }
  });
}

async function aplicarReset(atores) {
  const snapshot = [];
  const linhas = [];
  for (const item of engenhocasDosAtores(atores)) {
    const estado = estadoDaEngenhoca(item);
    const antes = calcularCD({
      custoBase: estado.custoBase, usosDia: estado.usosDia, aparatos: estado.aparatos,
      resfriada: estado.resfriada
    });
    const depois = resetarDia(estado);
    const base = calcularCD({ custoBase: depois.custoBase, aparatos: depois.aparatos });
    snapshot.push({ actorId: item.actor.id, itemId: item.id, estado });
    await gravarEstado(item, depois);
    linhas.push(`<li>${esc(item.name)}</b>: CD ${antes} → ${base}
      </li>`);
  }
  return { snapshot, linhas };
}

function conteudoReset(linhas) {
  return `<div class="t20g-eng-descanso"><h3><i class="fa-solid fa-sun"></i> Engenhocas resetadas</h3>
    <p>CDs antes e depois do reset diário:</p>
    <ul>${linhas.join('')}</ul>
    <button type="button" data-eng-descanso="reverter"><i class="fa-solid fa-rotate-left"></i> Reverter ação</button>
  </div>`;
}

/** Reset manual usado tanto na ficha quanto dentro do painel. */
export async function resetarEngenhocas(atores) {
  const validos = atores.filter((ator) => podeControlar(ator) && temEngenhoqueiro(ator));
  if (!validos.length) return;
  const { snapshot, linhas } = await aplicarReset(validos);
  await ChatMessage.create({
    content: conteudoReset(linhas),
    flags: {
      [MODULE_ID]: {
        [FLAG_DESCANSO]: {
          status: 'resetado',
          actorIds: validos.map((ator) => ator.id),
          snapshot
        }
      }
    }
  });
}

async function executarReset(message, atores) {
  const { snapshot, linhas } = await aplicarReset(atores);
  const dados = { status: 'resetado', actorIds: atores.map((a) => a.id), snapshot };
  await message.update({
    content: conteudoReset(linhas),
    [`flags.${MODULE_ID}.${FLAG_DESCANSO}`]: dados
  });
}

async function reverterReset(message, snapshot = []) {
  const restauradas = [];
  for (const registro of snapshot) {
    const item = game.actors.get(registro.actorId)?.items?.get(registro.itemId);
    if (!item || !podeControlar(item.actor)) continue;
    await gravarEstado(item, registro.estado);
    restauradas.push(`${esc(item.actor.name)} — ${esc(item.name)}`);
  }
  await message.update({
    content: `<div class="t20g-eng-descanso"><h3><i class="fa-solid fa-rotate-left"></i> Reset revertido</h3>
      <p>${restauradas.join('<br>') || 'Nenhuma engenhoca pôde ser restaurada.'}</p></div>`,
    [`flags.${MODULE_ID}.${FLAG_DESCANSO}.status`]: 'revertido'
  });
}

/** Supressor é uma vez por cena, não por dia. */
export async function resetarSupressores() {
  const promessas = [];
  for (const ator of game.actors ?? []) {
    if (!souResponsavelPeloAtor(ator) || !temEngenhoqueiro(ator)) continue;
    for (const item of ator.items.filter((i) => ehEngenhoca(i))) {
      const estado = estadoDaEngenhoca(item);
      if (estado.supressorUsado) promessas.push(gravarEstado(item, { ...estado, supressorUsado: false }));
    }
  }
  await Promise.all(promessas);
}

export function paginaDiario() {
  const linhas = Object.values(APARATOS).map((a) => `<tr><td><b>${a.nome}</b></td>
    <td>${a.automacao}</td><td>${a.manual ? 'Apoio/lembrete' : 'Automático'}</td></tr>`).join('');
  return `<p class="notes"><b>Fonte:</b> Livro Básico e Heróis de Arton</p>
    <h3>Preparação</h3><ul>
      <li>Ligue <b>Engenhoqueiro</b> no poder. As magias do ator com tipo <b>Engenhoca</b>
      passam a ter custo base 0 e atributo-chave Inteligência.</li>
      <li>Na ficha de cada magia, use <b>Aparatos</b> para ocupar até dois espaços.</li>
      <li>No topo da lista de magias, o botão <b>Painel de Engenhocas</b> abre uma janela
      por círculo para consultar CDs, ajustar usos, consertar e configurar aparatos.</li>
      <li>A automação de Engenhoca é paralela à automação da própria magia; Seta Infalível,
      por exemplo, pode manter as duas.</li></ul>
    <h3>Ativação</h3><ul>
      <li>Ao rolar a magia, escolha aprimoramentos e faça o teste contra a CD calculada.</li>
      <li>A perícia padrão é Ofício (engenhoqueiro), com penalidade de armadura como efeito
      de uso. Ela pode ser trocada no diálogo.</li>
      <li>Cada tentativa no dia soma +5 à próxima CD, sucesso ou falha. Falha enguiça; conserte
      pelo <b>Painel de Engenhocas</b> (o botão Ativar vira Consertar enquanto estiver enguiçada).</li>
      <li>O cartão do resultado tem um botão <b>Transformar em sucesso/falha</b> — o Mestre
      corrige à mão quando decidir que o teste deveria ter dado o outro resultado. Transformar em
      sucesso reabre o diálogo de aprimoramentos e conjura a magia de verdade; transformar em
      falha desfaz a conjuração, se já tiver acontecido.</li>
      <li>O cartão identifica o efeito como mundano. Custos especiais, sustentação e eventuais
      testes exigidos pela magia continuam sob controle da mesa.</li>
      <li>Depois de um descanso, o chat oferece reset e reversão das CDs diárias.</li></ul>
    <h3>Aparatos</h3><table><thead><tr><th>Aparato</th><th>No módulo</th><th>Tratamento</th></tr></thead>
      <tbody>${linhas}</tbody></table>`;
}

export const engenhocas = {
  APARATOS,
  ehEngenhoca,
  temEngenhoqueiro,
  estado: estadoDaEngenhoca,
  resumoPoder,
  sincronizarAtor,
  agendarSincronizacao,
  aoMudarItem,
  abrirAparatos,
  abrirPainel,
  resetarEngenhocas,
  ligarFluxo,
  injetarPainel,
  atualizarPaineis,
  injetarBarra,
  ligarBotoesChat,
  resetarSupressores,
  paginaDiario
};
