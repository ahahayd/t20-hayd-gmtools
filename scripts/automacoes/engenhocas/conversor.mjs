/**
 * "Transformar em engenhoca" — converte magias da ficha em engenhocas em lote.
 *
 * Engenhoca, no sistema, é só o `system.tipo` da magia valendo `eng`. Mudar
 * isso item a item, pelos detalhes de cada magia, é um clique por magia mais
 * dois para abrir e fechar a ficha do item — um inventor com dez engenhocas
 * paga trinta cliques por isso.
 *
 * A conversão guarda o tipo anterior (`arc`, `div`...) num flag, e é por isso
 * que desmarcar devolve a magia ao que ela era. Uma magia que JÁ era engenhoca
 * antes deste painel existir não tem esse registro: aí a linha avisa e deixa
 * escolher o tipo de volta, em vez de chutar um.
 */

import { MODULE_ID, podeControlar } from '../runtime.mjs';

const FLAG_TIPO_ORIGINAL = 'tipoOriginalDaMagia';
const TIPO_ENGENHOCA = 'eng';
/** Para onde volta uma engenhoca sem registro do tipo anterior. */
const TIPO_PADRAO_DE_VOLTA = 'arc';

const esc = (valor) => foundry.utils.escapeHTML(String(valor ?? ''));

const tiposDeMagia = () => foundry.utils.deepClone(CONFIG.T20?.spellType ?? {});

function rotuloDoTipo(tipo) {
  return tiposDeMagia()[tipo] ?? tipo ?? '—';
}

/** Magias da ficha, engenhocas incluídas, em ordem alfabética. */
function magiasDoAtor(ator) {
  return [...(ator?.items ?? [])]
    .filter((item) => item.type === 'magia')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function linhaConversor(item) {
  const tipo = item.system?.tipo ?? '';
  const ehEngenhoca = tipo === TIPO_ENGENHOCA;
  const original = item.getFlag?.(MODULE_ID, FLAG_TIPO_ORIGINAL) ?? '';
  const circulo = Number(item.system?.circulo) || 0;
  // Uma engenhoca sem registro do tipo anterior precisa de um destino
  // escolhido à mão, senão desmarcar viraria um chute silencioso.
  const semRegistro = ehEngenhoca && !original;
  const seletor = semRegistro
    ? `<select class="t20g-campo t20g-conv-volta" data-item-id="${item.id}" data-tooltip="Para qual tipo esta magia volta ao ser desmarcada">
        ${Object.entries(tiposDeMagia())
          .filter(([chave]) => chave !== TIPO_ENGENHOCA)
          .map(([chave, rotulo]) =>
            `<option value="${esc(chave)}" ${chave === TIPO_PADRAO_DE_VOLTA ? 'selected' : ''}>${esc(rotulo)}</option>`)
          .join('')}
      </select>`
    : `<span class="t20g-chip">${esc(rotuloDoTipo(ehEngenhoca ? original : tipo))}</span>`;
  return `<label class="t20g-conv-linha" data-nome="${esc(item.name.toLowerCase())}">
    <input type="checkbox" data-conv-item="${item.id}" ${ehEngenhoca ? 'checked' : ''}>
    <img class="t20g-miniatura" src="${esc(item.img)}" alt="">
    <span class="t20g-conv-texto">
      <b>${esc(item.name)}</b>
      <small>${circulo ? `${circulo}º círculo` : 'Sem círculo'}</small>
    </span>
    ${seletor}
  </label>`;
}

function conteudoConversor(ator) {
  const magias = magiasDoAtor(ator);
  if (!magias.length) {
    return `<div class="t20g-vazio">
      <i class="fa-solid fa-wand-sparkles"></i>
      <p class="t20g-vazio__titulo">Nenhuma magia na ficha</p>
      <p class="t20g-vazio__texto">Engenhocas são magias com o tipo <b>Engenhoca</b>. Adicione as magias à ficha e elas aparecem aqui para converter.</p>
    </div>`;
  }
  return `<div class="t20g-conv">
    <p class="t20g-apoio">Marque as magias que são engenhocas. Desmarcar devolve a magia ao tipo que ela tinha antes.</p>
    <input type="search" class="t20g-campo t20g-conv-busca" placeholder="Filtrar pelo nome…" autocomplete="off">
    <div class="t20g-conv-lista t20g-rola">${magias.map(linhaConversor).join('')}</div>
    <p class="t20g-apoio t20g-conv-resumo" aria-live="polite"></p>
  </div>`;
}

/** Filtro por nome e contagem do que vai mudar, atualizados ao vivo. */
function ligarConversor(raiz) {
  const busca = raiz.querySelector('.t20g-conv-busca');
  const linhas = [...raiz.querySelectorAll('.t20g-conv-linha')];
  const resumo = raiz.querySelector('.t20g-conv-resumo');

  busca?.addEventListener('input', () => {
    const termo = busca.value.trim().toLowerCase();
    for (const linha of linhas) {
      linha.hidden = !!termo && !linha.dataset.nome.includes(termo);
    }
  });

  const atualizarResumo = () => {
    let viram = 0;
    let voltam = 0;
    for (const linha of linhas) {
      const caixa = linha.querySelector('[data-conv-item]');
      const era = caixa.defaultChecked;
      if (caixa.checked && !era) viram++;
      if (!caixa.checked && era) voltam++;
      // O seletor de retorno só interessa quando a linha está voltando a ser magia.
      const volta = linha.querySelector('.t20g-conv-volta');
      if (volta) volta.disabled = caixa.checked;
    }
    const partes = [];
    if (viram) partes.push(`${viram} vira${viram > 1 ? 'm' : ''} engenhoca`);
    if (voltam) partes.push(`${voltam} volta${voltam > 1 ? 'm' : ''} a ser magia`);
    resumo.textContent = partes.join(' · ') || 'Nada alterado ainda.';
  };

  raiz.addEventListener('change', atualizarResumo);
  atualizarResumo();
}

/** Lê o que mudou e monta as atualizações de item. */
function lerMudancas(form, ator) {
  const updates = [];
  for (const caixa of form.querySelectorAll('[data-conv-item]')) {
    const item = ator.items.get(caixa.dataset.convItem);
    if (!item) continue;
    const era = caixa.defaultChecked;
    if (caixa.checked === era) continue;
    if (caixa.checked) {
      updates.push({
        _id: item.id,
        'system.tipo': TIPO_ENGENHOCA,
        [`flags.${MODULE_ID}.${FLAG_TIPO_ORIGINAL}`]: item.system?.tipo ?? ''
      });
      continue;
    }
    const registrado = item.getFlag?.(MODULE_ID, FLAG_TIPO_ORIGINAL);
    const escolhido = form.querySelector(`.t20g-conv-volta[data-item-id="${item.id}"]`)?.value;
    updates.push({
      _id: item.id,
      'system.tipo': registrado || escolhido || TIPO_PADRAO_DE_VOLTA,
      [`flags.${MODULE_ID}.-=${FLAG_TIPO_ORIGINAL}`]: null
    });
  }
  return updates;
}

export async function abrirConversorDeEngenhocas(ator) {
  if (!ator || !podeControlar(ator)) return;
  const updates = await foundry.applications.api.DialogV2.wait({
    window: { title: `Transformar em engenhoca — ${ator.name}`, icon: 'fa-solid fa-screwdriver-wrench' },
    position: { width: 520 },
    classes: ['t20g-conv-janela'],
    content: conteudoConversor(ator),
    rejectClose: false,
    buttons: [
      {
        action: 'salvar',
        label: 'Salvar',
        icon: 'fa-solid fa-check',
        default: true,
        callback: (_evento, botao) => lerMudancas(botao.form, ator)
      },
      { action: 'cancelar', label: 'Cancelar', icon: 'fa-solid fa-xmark' }
    ],
    render: (_evento, dialogo) => ligarConversor(dialogo.element)
  });
  if (!Array.isArray(updates) || !updates.length) return;
  await ator.updateEmbeddedDocuments('Item', updates);
  const viraram = updates.filter((u) => u['system.tipo'] === TIPO_ENGENHOCA).length;
  const voltaram = updates.length - viraram;
  const partes = [];
  if (viraram) partes.push(`${viraram} magia(s) viraram engenhoca`);
  if (voltaram) partes.push(`${voltaram} voltaram a ser magia`);
  ui.notifications.info(`${partes.join(' e ')}.`);
}
