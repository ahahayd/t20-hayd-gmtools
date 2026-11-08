/**
 * Dano contínuo — integração com o Foundry.
 *
 * - Lançar o item (com o aprimoramento certo, se a configuração pedir) grava
 *   na ficha do ator um dano contínuo, montado a partir da rolagem de dano do
 *   cartão: uma parcela por fonte (dado da magia, Arcano de Batalha, campo
 *   Bônus…), com os bônus de primeira rolagem desmarcados.
 * - A ficha mostra uma linha embaixo do item: clicar no nome rola o dano como
 *   uma rolagem comum do chat (rerolar, inserir resultado e aplicar dano
 *   funcionam como em qualquer outra); o ajuste abre as parcelas para marcar,
 *   desmarcar e editar; o X apaga.
 * - "Uma vez por rodada" avisa antes de rolar de novo na mesma rodada; os
 *   usos limitados apagam a linha quando acabam; "termina com a cena" apaga
 *   quando o Mestre encerra a cena.
 *
 * Entradas encerradas viram null em vez de sair da flag: no v14 a primeira
 * chave gravada no delta de um token não vinculado resiste à exclusão.
 */

import { MODULE_ID, podeControlar, souResponsavelPeloAtor } from '../runtime.mjs';
import { definicaoDe } from '../estado.mjs';
import {
  FLAG_CONFIG, FLAG_ATIVOS, GATILHOS, ORIGENS, TIPOS_DANO,
  normalizarConfig, configValida, disparou, parcelasDaRolagem, montarParcelas,
  formulaDasParcelas, resumoDasParcelas, novaInstancia, listarInstancias,
  restantes, jaRolouNaRodada, depoisDeRolar
} from './regras.mjs';

const { DialogV2 } = foundry.applications.api;

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));
const tg = (chave, dados) => (dados
  ? game.i18n.format(`T20HaydGMTools.${chave}`, dados)
  : game.i18n.localize(`T20HaydGMTools.${chave}`));

/** Mesma chave das fontes da rolagem (t20-hayd-fontes.mjs). */
const OPCAO_FONTES = 't20gFontes';
const ICONE = 'fa-solid fa-fire-flame-curved';

function rotuloTipo(tipo) {
  const chave = CONFIG.T20?.damageTypes?.[tipo] ?? CONFIG.T20?.healingTypes?.[tipo];
  return chave ? game.i18n.localize(chave) : tipo;
}

/* ─── Configuração ───────────────────────────────────────────────────────── */

/** Configuração em vigor: a fixa do catálogo (Bola de Fogo) ou a do item. */
export function configDe(item) {
  const def = definicaoDe(item);
  if (def?.danoContinuo) return normalizarConfig(def.danoContinuo, def.danoContinuo.rotulo ?? item.name);
  if (def?.danoContinuoModelo) return normalizarConfig(item.getFlag(MODULE_ID, FLAG_CONFIG), item.name);
  return null;
}

function lerConfig(form, item) {
  const v = (n) => form.elements[n]?.value;
  const c = (n) => !!form.elements[n]?.checked;
  return normalizarConfig({
    rotulo: v('rotulo'),
    gatilho: v('gatilho'),
    aprimoramento: v('aprimoramento'),
    origem: v('origem'),
    formula: v('formula'),
    tipo: v('tipo'),
    bonusRepetem: c('bonusRepetem'),
    usos: v('usos'),
    umaVezPorRodada: c('umaVezPorRodada'),
    fimCena: c('fimCena'),
    nota: v('nota')
  }, item.name);
}

/**
 * Editor do Modelo de dano contínuo. Abre ao escolher a automação (e de novo
 * ao escolhê-la outra vez, que é como se edita). false = cancelado.
 */
export async function configurar(item) {
  const atual = normalizarConfig(item.getFlag(MODULE_ID, FLAG_CONFIG), item.name);
  const opcao = (valor, rotulo, escolhido) =>
    `<option value="${esc(valor)}" ${valor === escolhido ? 'selected' : ''}>${esc(rotulo)}</option>`;
  const rotGatilho = { sempre: 'Sempre que o item for usado', aprimoramento: 'Só com um aprimoramento' };
  const rotOrigem = {
    original: 'Repetir o dano da primeira rolagem',
    formula: 'Usar uma fórmula própria'
  };

  const config = await DialogV2.wait({
    window: { title: `Modelo de dano contínuo: ${item.name}`, icon: ICONE, resizable: true },
    position: { width: 520 },
    content: `<div class="t20g-auto-dialogo t20g-dc-config">
        <p class="notes">Depois de usar o item, o dano fica embaixo dele na ficha e é rolado de novo
          com um clique: uma rolagem comum do chat, que pode ser rerolada e aplicada.</p>
        <div class="form-group">
          <label>Nome na ficha</label>
          <input type="text" name="rotulo" value="${esc(atual.rotulo)}" placeholder="${esc(item.name)}">
        </div>
        <div class="form-group">
          <label>Quando cria</label>
          <select name="gatilho">${GATILHOS.map((g) => opcao(g, rotGatilho[g], atual.gatilho)).join('')}</select>
        </div>
        <div class="form-group t20g-dc-so-apr">
          <label>Texto do aprimoramento</label>
          <input type="text" name="aprimoramento" value="${esc(atual.aprimoramento)}"
            placeholder="esfera flamejante" autocomplete="off">
          <p class="hint">Um trecho do texto do aprimoramento, como aparece no cartão (sem diferença de
            acentos e maiúsculas).</p>
        </div>
        <div class="form-group">
          <label>Dano a cada vez</label>
          <select name="origem">${ORIGENS.map((o) => opcao(o, rotOrigem[o], atual.origem)).join('')}</select>
        </div>
        <div class="form-group t20g-dc-so-formula">
          <label>Fórmula</label>
          <input type="text" name="formula" value="${esc(atual.formula)}" placeholder="2d6" autocomplete="off">
          <p class="hint">Aceita <code>@for</code>, <code>@car</code>, <code>@nivel</code> e afins, lidos
            da ficha na hora de criar.</p>
        </div>
        <div class="form-group">
          <label>Tipo de dano</label>
          <select name="tipo">${opcao('', 'O da rolagem', atual.tipo)}${TIPOS_DANO.map((tp) => opcao(tp, rotuloTipo(tp), atual.tipo)).join('')}</select>
        </div>
        <label class="t20g-auto-item">
          <input type="checkbox" name="bonusRepetem" ${atual.bonusRepetem ? 'checked' : ''}>
          <i class="fa-solid fa-plus-minus"></i>
          <span class="t20g-auto-nome">Bônus de poderes e efeitos se repetem
            <small class="notes">Desmarcado, bônus como o do Arcano de Batalha valem só na primeira
            rolagem (eles continuam na janela de ajuste, para marcar se quiser).</small></span>
        </label>
        <div class="form-group">
          <label>Quantas vezes</label>
          <input type="number" name="usos" min="0" step="1" value="${atual.usos || ''}" placeholder="até cancelar">
          <p class="hint">Rolagens depois da primeira. Vazio ou 0: até cancelar.</p>
        </div>
        <label class="t20g-auto-item">
          <input type="checkbox" name="umaVezPorRodada" ${atual.umaVezPorRodada ? 'checked' : ''}>
          <i class="fa-solid fa-hourglass-half"></i>
          <span class="t20g-auto-nome">Uma vez por rodada (em combate, pergunta antes de repetir)</span>
        </label>
        <label class="t20g-auto-item">
          <input type="checkbox" name="fimCena" ${atual.fimCena ? 'checked' : ''}>
          <i class="fa-solid fa-clapperboard"></i>
          <span class="t20g-auto-nome">Termina quando o Mestre encerra a cena</span>
        </label>
        <div class="form-group stacked">
          <label>Lembrete na rolagem</label>
          <textarea name="nota" rows="2" placeholder="Ação de movimento: move 9 m.">${esc(atual.nota)}</textarea>
        </div>
        <p class="t20g-veneno-erro" hidden>Informe o texto do aprimoramento e/ou a fórmula.</p>
      </div>`,
    buttons: [
      {
        action: 'salvar', label: tg('AutoSalvar'), icon: 'fa-solid fa-check', default: true,
        callback: (_ev, botao) => lerConfig(botao.form, item)
      },
      { action: 'cancelar', label: tg('AutoCancelar'), icon: 'fa-solid fa-xmark' }
    ],
    render: (_ev, dialogo) => {
      const el = dialogo.element;
      const form = el.querySelector('form') ?? el;
      const salvar = el.querySelector('[data-action="salvar"]');
      const erro = el.querySelector('.t20g-veneno-erro');
      const conferir = () => {
        const c = lerConfig(form, item);
        el.querySelector('.t20g-dc-so-apr').hidden = form.elements.gatilho.value !== 'aprimoramento';
        el.querySelector('.t20g-dc-so-formula').hidden = form.elements.origem.value !== 'formula';
        const ok = configValida(c);
        salvar.disabled = !ok;
        erro.hidden = ok;
      };
      form.addEventListener('input', conferir);
      form.addEventListener('change', conferir);
      conferir();
    },
    rejectClose: false
  });

  if (!config || typeof config !== 'object') return false;
  await item.setFlag(MODULE_ID, FLAG_CONFIG, config);
  return true;
}

/** Automação desligada: some a configuração do item. */
export async function limparConfig(item) {
  if (item.getFlag(MODULE_ID, FLAG_CONFIG) !== undefined) await item.unsetFlag(MODULE_ID, FLAG_CONFIG);
}

/* ─── Primeira rolagem → dano contínuo ───────────────────────────────────── */

function termoSimples(termo) {
  const T = foundry.dice.terms;
  if (termo instanceof T.OperatorTerm) return { operador: termo.operator };
  const tipo = termo.options?.flavor;
  return {
    expressao: termo.expression ?? termo.formula,
    total: termo.total,
    dado: termo instanceof T.DiceTerm || !!termo.dice?.length,
    tipo: tipo && (tipo in (CONFIG.T20?.damageTypes ?? {})) ? tipo : ''
  };
}

/** Texto dos aprimoramentos escolhidos, como o cartão do sistema os lista. */
function textoDosAprimoramentos(message) {
  const div = document.createElement('div');
  div.innerHTML = String(message.content ?? '');
  const lista = div.querySelector('.card-upgrades');
  if (lista) return lista.textContent;
  // Sem a lista (outro layout): o cartão sem a descrição, que cita todos
  div.querySelectorAll('.card-content, .item-description, .description').forEach((n) => n.remove());
  return div.textContent;
}

function itemDaMensagem(message) {
  const id = String(message.content ?? '').match(/data-item-id="([^"]+)"/)?.[1];
  if (!id) return null;
  const ator = ChatMessage.getSpeakerActor(message.speaker)
    ?? game.actors.get(message.speaker?.actor);
  return ator?.items.get(id) ?? null;
}

/** Combate em andamento em que o ator está, no formato guardado. */
function rodadaAtual(ator) {
  const combate = game.combats?.find((c) => c.started && c.getCombatantsByActor?.(ator)?.length)
    ?? (game.combat?.started ? game.combat : null);
  return combate ? { combate: combate.id, rodada: Number(combate.round) || 0 } : null;
}

/** Fórmula própria com @: resolvida pela ficha na hora de criar. */
function resolverFormula(formula, ator) {
  try {
    return Roll.replaceFormulaData(formula, ator.getRollData?.() ?? {}, { missing: '0' });
  } catch {
    return formula;
  }
}

/**
 * Cartão novo de um item com dano contínuo: grava a instância na ficha.
 * Só no cliente que criou a mensagem, que é dono do ator.
 */
export async function aoCriarMensagem(message, userId) {
  if (userId !== game.user.id) return;
  const item = itemDaMensagem(message);
  const ator = item?.actor;
  if (!item || !ator?.isOwner) return;
  const config = configDe(item);
  if (!config || !disparou(config, textoDosAprimoramentos(message))) return;

  const roll = message.rolls?.find((r) => r.options?.type === 'damage');
  let originais = [];
  if (roll) {
    const nomeBase = tg('FonteDanoBase', { nome: item.name });
    originais = parcelasDaRolagem(roll.terms.map(termoSimples), roll.options?.[OPCAO_FONTES], {
      ehDoItem: (fonte) => fonte === nomeBase || fonte === item.name,
      rotuloBonus: 'Bônus'
    }).map((p) => ({ ...p, fonte: p.fonte || item.name }));
  }
  if (config.origem === 'original' && !originais.length) {
    ui.notifications.warn(`${config.rotulo}: o cartão não tem rolagem de dano para repetir.`);
    return;
  }

  const cfg = config.origem === 'formula' ? { ...config, formula: resolverFormula(config.formula, ator) } : config;
  const inst = novaInstancia({
    id: foundry.utils.randomID(),
    item,
    config: cfg,
    parcelas: montarParcelas(cfg, originais, item.name),
    criado: Date.now(),
    mensagem: message.id
  });
  await ator.update({ [`flags.${MODULE_ID}.${FLAG_ATIVOS}.${inst.id}`]: inst });
}

/* ─── Rolar, ajustar, cancelar ───────────────────────────────────────────── */

export function instanciasDe(ator) {
  return listarInstancias(ator?.getFlag?.(MODULE_ID, FLAG_ATIVOS));
}

const caminho = (id) => `flags.${MODULE_ID}.${FLAG_ATIVOS}.${id}`;

async function gravar(ator, id, valor) {
  await ator.update({ [caminho(id)]: valor });
}

/** Faixas das fontes para a rolagem nova: o menu "Fontes da rolagem" lê. */
function faixasDe(parcelas) {
  const T = foundry.dice.terms;
  const faixas = [];
  let pos = 0;
  for (const p of parcelas) {
    const f = String(p.formula ?? '').trim().replace(/^-/, '');
    let n;
    try { n = new Roll(f).terms.filter((tm) => !(tm instanceof T.OperatorTerm)).length; }
    catch { return null; }
    faixas.push({ fonte: p.fonte, ini: pos, fim: pos + n });
    pos += n;
  }
  return faixas;
}

export async function rolar(ator, id) {
  const inst = instanciasDe(ator).find((i) => i.id === id);
  if (!inst) return;
  const agora = rodadaAtual(ator);
  if (inst.umaVezPorRodada && jaRolouNaRodada(inst, agora)) {
    const seguir = await DialogV2.confirm({
      window: { title: inst.rotulo, icon: ICONE },
      content: `<p>${esc(inst.rotulo)} já causou dano nesta rodada. Cada criatura só sofre esse dano
        uma vez por rodada; role de novo só se for em outra criatura.</p><p>Rolar mesmo assim?</p>`,
      rejectClose: false
    });
    if (!seguir) return;
  }

  const ativas = inst.parcelas.filter((p) => p.ativa && String(p.formula ?? '').trim());
  const formula = formulaDasParcelas(ativas);
  if (!formula) return ui.notifications.warn(`${inst.rotulo}: nada marcado no ajuste.`);

  let roll;
  try {
    roll = await new Roll(formula, {}, { type: 'damage', title: inst.rotulo }).evaluate();
  } catch (err) {
    console.error(`${MODULE_ID} | Dano contínuo: fórmula inválida`, formula, err);
    return ui.notifications.error(`${inst.rotulo}: a fórmula "${formula}" não pôde ser rolada.`);
  }
  const faixas = faixasDe(ativas);
  if (faixas && faixas.at(-1)?.fim === roll.terms.filter((tm) => !(tm instanceof foundry.dice.terms.OperatorTerm)).length) {
    roll.options[OPCAO_FONTES] = faixas;
  }

  const proxima = depoisDeRolar(inst, agora);
  const resta = proxima ? restantes(proxima) : 0;
  const pe = [
    inst.nota ? `<p class="t20g-dc-nota">${esc(inst.nota)}</p>` : '',
    resta === 0 ? '<p class="t20g-dc-nota"><i>Última vez.</i></p>'
      : resta !== null ? `<p class="t20g-dc-nota">Restam ${resta}.</p>` : ''
  ].join('');
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: ator }),
    flavor: `<div class="t20g-dc-flavor"><i class="${ICONE}"></i> <b>${esc(inst.rotulo)}</b>
      <span class="t20g-dc-origem">${esc(inst.itemNome)}</span>${pe}</div>`,
    flags: { [MODULE_ID]: { danoContinuo: { id: inst.id, item: inst.itemId } } }
  });
  await gravar(ator, id, proxima);
}

export async function cancelar(ator, id) {
  const inst = instanciasDe(ator).find((i) => i.id === id);
  if (!inst) return;
  const ok = await DialogV2.confirm({
    window: { title: inst.rotulo, icon: 'fa-solid fa-xmark' },
    content: `<p>Encerrar <b>${esc(inst.rotulo)}</b>?</p>`,
    rejectClose: false
  });
  if (ok) await gravar(ator, id, null);
}

function linhaDeParcela(p, i) {
  return `<li class="t20g-dc-parcela ${p.doItem ? 't20g-dc-do-item' : ''}" data-i="${i}">
      <input type="checkbox" name="ativa.${i}" ${p.ativa ? 'checked' : ''}
        data-tooltip="Entra na rolagem">
      <input type="text" name="fonte.${i}" value="${esc(p.fonte)}" class="t20g-dc-fonte" placeholder="Fonte">
      <input type="text" name="formula.${i}" value="${esc(p.formula)}" class="t20g-dc-formula"
        placeholder="1d6" autocomplete="off">
      ${p.original && p.original !== p.formula
        ? `<a class="t20g-dc-restaurar" data-tooltip="Voltar para ${esc(p.original)}" role="button"><i class="fa-solid fa-rotate-left"></i></a>`
        : '<span class="t20g-dc-restaurar-vazio"></span>'}
    </li>`;
}

/** Janela de ajuste: cada parcela da rolagem, para marcar, desmarcar e editar. */
export async function ajustar(ator, id) {
  const inst = instanciasDe(ator).find((i) => i.id === id);
  if (!inst) return;
  let parcelas = inst.parcelas.map((p) => ({ ...p }));

  const ler = (form) => parcelas.map((p, i) => ({
    ...p,
    ativa: !!form.elements[`ativa.${i}`]?.checked,
    fonte: String(form.elements[`fonte.${i}`]?.value ?? p.fonte).trim(),
    formula: String(form.elements[`formula.${i}`]?.value ?? p.formula).trim()
  }));

  const resposta = await DialogV2.wait({
    window: { title: `Ajustar: ${inst.rotulo}`, icon: 'fa-solid fa-sliders', resizable: true },
    position: { width: 500 },
    content: `<div class="t20g-auto-dialogo t20g-dc-ajuste">
        <p class="notes">O que entrou na primeira rolagem de ${esc(inst.itemNome)}. Marque o que entra nas
          próximas rolagens e edite a fórmula se precisar. Bônus que valem só na primeira rolagem
          (Arcano de Batalha e afins) vêm desmarcados.</p>
        <div class="form-group">
          <label>Nome</label><input type="text" name="rotulo" value="${esc(inst.rotulo)}">
        </div>
        <ul class="t20g-dc-parcelas">${parcelas.map(linhaDeParcela).join('')}</ul>
        <button type="button" class="t20g-dc-adicionar"><i class="fa-solid fa-plus"></i> Somar outro dano</button>
        <p class="t20g-dc-previa"></p>
        <div class="form-group">
          <label>Rolagens restantes</label>
          <input type="number" name="restantes" min="0" step="1" value="${restantes(inst) ?? ''}" placeholder="até cancelar">
        </div>
        <label class="t20g-auto-item">
          <input type="checkbox" name="umaVezPorRodada" ${inst.umaVezPorRodada ? 'checked' : ''}>
          <span class="t20g-auto-nome">Uma vez por rodada</span>
        </label>
      </div>`,
    buttons: [
      {
        action: 'salvar', label: tg('AutoSalvar'), icon: 'fa-solid fa-check', default: true,
        callback: (_ev, botao) => {
          const form = botao.form;
          const texto = String(form.elements.restantes.value ?? '').trim();
          const n = Math.max(0, Math.trunc(Number(texto)) || 0);
          return {
            rotulo: String(form.elements.rotulo.value ?? '').trim() || inst.rotulo,
            parcelas: ler(form).filter((p) => p.formula || p.original),
            // Restantes vira "usos" contando o que já foi feito
            usos: texto === '' || !n ? 0 : (Number(inst.feitos) || 0) + n,
            umaVezPorRodada: !!form.elements.umaVezPorRodada.checked
          };
        }
      },
      { action: 'cancelar', label: tg('AutoCancelar'), icon: 'fa-solid fa-xmark' }
    ],
    render: (_ev, dialogo) => {
      const el = dialogo.element;
      const form = el.querySelector('form') ?? el;
      const lista = el.querySelector('.t20g-dc-parcelas');
      const previa = el.querySelector('.t20g-dc-previa');
      const atualizar = () => {
        parcelas = ler(form);
        previa.innerHTML = `<b>Próxima rolagem:</b> ${esc(resumoDasParcelas(parcelas))}`;
      };
      el.querySelector('.t20g-dc-adicionar').addEventListener('click', () => {
        parcelas = ler(form);
        parcelas.push({ id: `extra${Date.now()}`, fonte: 'Extra', formula: '', original: '', doItem: false, ativa: true });
        lista.innerHTML = parcelas.map(linhaDeParcela).join('');
        lista.querySelector(`[name="formula.${parcelas.length - 1}"]`)?.focus();
        atualizar();
      });
      lista.addEventListener('click', (ev) => {
        const botao = ev.target.closest('.t20g-dc-restaurar');
        if (!botao) return;
        const i = Number(botao.closest('[data-i]').dataset.i);
        form.elements[`formula.${i}`].value = parcelas[i].original;
        atualizar();
      });
      form.addEventListener('input', atualizar);
      form.addEventListener('change', atualizar);
      atualizar();
    },
    rejectClose: false
  });

  if (!resposta || typeof resposta !== 'object') return;
  const atual = instanciasDe(ator).find((i) => i.id === id);
  if (!atual) return;
  const proxima = { ...atual, ...resposta };
  await gravar(ator, id, restantes(proxima) === 0 ? null : proxima);
}

/* ─── Linha na ficha ─────────────────────────────────────────────────────── */

function montarLinha(ator, inst, editavel) {
  const div = document.createElement('div');
  div.className = 't20g-dc-linha';
  div.dataset.dcId = inst.id;
  const resta = restantes(inst);
  const rodada = inst.umaVezPorRodada && jaRolouNaRodada(inst, rodadaAtual(ator));
  div.classList.toggle('t20g-dc-rolou', rodada);
  div.innerHTML = `
    <i class="t20g-dc-icone ${ICONE}"></i>
    <a class="t20g-dc-nome" data-dc-acao="rolar" role="button" tabindex="0"
      data-tooltip="${editavel ? 'Rolar o dano' : ''}">
      <span>${esc(inst.rotulo)}</span> <b>${esc(resumoDasParcelas(inst.parcelas))}</b>
    </a>
    ${rodada ? '<span class="t20g-dc-estado" data-tooltip="Já causou dano nesta rodada"><i class="fa-solid fa-hourglass-end"></i></span>' : ''}
    ${resta !== null ? `<span class="t20g-dc-estado" data-tooltip="Rolagens restantes">×${resta}</span>` : ''}
    ${editavel ? `
      <a class="t20g-dc-botao" data-dc-acao="ajustar" role="button" tabindex="0" data-tooltip="Ajustar o dano"><i class="fa-solid fa-sliders"></i></a>
      <a class="t20g-dc-botao" data-dc-acao="cancelar" role="button" tabindex="0" data-tooltip="Encerrar"><i class="fa-solid fa-xmark"></i></a>` : ''}`;
  if (!editavel) return div;

  const agir = (ev) => {
    const alvo = ev.target.closest('[data-dc-acao]');
    if (!alvo) return;
    ev.preventDefault();
    ev.stopPropagation();
    const acao = { rolar, ajustar, cancelar }[alvo.dataset.dcAcao];
    acao?.(ator, inst.id).catch((err) => console.error(`${MODULE_ID} | Dano contínuo`, err));
  };
  div.addEventListener('click', agir);
  div.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') agir(ev); });
  return div;
}

/**
 * Põe as linhas embaixo de cada item com dano contínuo ativo: Ficha Hayd,
 * Ficha Ameaça e fichas do sistema. Favoritos e chips ficam de fora.
 */
export function injetarNaFicha(app, html) {
  const ator = app.actor;
  const ativas = instanciasDe(ator);
  if (!ativas.length) return;
  const bruto = app.element ?? html;
  const raiz = bruto instanceof HTMLElement ? bruto : bruto?.[0];
  if (!raiz?.querySelectorAll) return;
  const editavel = (app.isEditable ?? true) && podeControlar(ator);

  const porItem = new Map();
  for (const inst of ativas) {
    if (!ator.items.get(inst.itemId)) continue;
    if (!porItem.has(inst.itemId)) porItem.set(inst.itemId, []);
    porItem.get(inst.itemId).push(inst);
  }
  for (const [itemId, lista] of porItem) {
    const linhas = raiz.querySelectorAll(`li.item[data-item-id="${itemId}"]:not(.hf-fav):not(.ha-chip)`);
    for (const li of linhas) {
      if (li.querySelector('.t20g-dc-linha') || li.nextElementSibling?.classList.contains('t20g-dc-li')) continue;
      const frag = document.createDocumentFragment();
      for (const inst of lista) frag.append(montarLinha(ator, inst, editavel));
      const linhaHayd = li.querySelector(':scope > .hf-item-linha');
      if (linhaHayd) {
        linhaHayd.after(frag);
      } else {
        const envolta = document.createElement('li');
        envolta.className = 't20g-dc-li';
        envolta.append(frag);
        li.after(envolta);
      }
    }
  }
}

/* ─── Fim de cena e itens apagados ───────────────────────────────────────── */

/** O Mestre encerrou a cena: somem os danos contínuos que duram uma cena. */
export async function aoEncerrarCena() {
  const atores = new Set([
    ...game.actors.contents,
    ...(canvas?.scene?.tokens?.contents ?? []).map((tk) => tk.actor).filter(Boolean)
  ]);
  for (const ator of atores) {
    const fim = instanciasDe(ator).filter((i) => i.fimCena);
    if (!fim.length || !souResponsavelPeloAtor(ator)) continue;
    await ator.update(Object.fromEntries(fim.map((i) => [caminho(i.id), null])))
      .catch((err) => console.error(`${MODULE_ID} | Dano contínuo: falha ao encerrar`, err));
  }
}

/** Item saiu da ficha ou perdeu a automação: os danos dele somem. */
export async function aoPerderItem(item, userId) {
  const ator = item?.actor;
  if (userId !== game.user.id || !ator?.isOwner) return;
  const dele = instanciasDe(ator).filter((i) => i.itemId === item.id);
  if (dele.length) await ator.update(Object.fromEntries(dele.map((i) => [caminho(i.id), null])));
}

export const danoContinuo = {
  configDe, configurar, limparConfig, aoCriarMensagem, injetarNaFicha,
  rolar, ajustar, cancelar, aoEncerrarCena, aoPerderItem, instanciasDe
};
