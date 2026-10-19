import { MODULE_ID, podeControlar } from './runtime.mjs';
import { definicaoDe } from './estado.mjs';
import { normalizarNome } from './sugestao.mjs';

/*
 * Escriba Arcano (Mago): aprender magias copiando pergaminhos e grimórios.
 *
 * Cada PM da magia custa um dia de trabalho e T$ 250 em matérias-primas. A
 * janela lista as magias de todos os compêndios de itens, por padrão só as
 * arcanas dos círculos a que o arcanista já tem acesso e que ele ainda não
 * conhece. O jogador aprende uma de cada vez ou monta uma lista; no fim o
 * dinheiro sai da ficha (com troco) e o chat registra os dias e as magias.
 */

/** PM para lançar uma magia de cada círculo (Livro Básico). */
const PM_POR_CIRCULO = { 1: 1, 2: 3, 3: 6, 4: 10, 5: 15 };
const TIBARES_POR_PM = 250;

/* ─── Regras (funções puras) ─────────────────────────────────────────────── */

/** Círculo mais alto de um arcanista: 1–4 → 1º, 5–8 → 2º, … 17–20 → 5º. */
export function circuloMaximo(nivel) {
  const n = Math.trunc(Number(nivel) || 0);
  if (n <= 0) return 0;
  return Math.min(5, Math.ceil(n / 4));
}

export function pmDoCirculo(circulo) {
  return PM_POR_CIRCULO[Number(circulo)] ?? 0;
}

/** Dias e T$ para aprender uma magia do círculo dado. */
export function custoDoCirculo(circulo) {
  const pm = pmDoCirculo(circulo);
  return { pm, dias: pm, tibares: pm * TIBARES_POR_PM };
}

export function totalDaLista(circulos) {
  return circulos.reduce((soma, c) => {
    const custo = custoDoCirculo(c);
    return { dias: soma.dias + custo.dias, tibares: soma.tibares + custo.tibares };
  }, { dias: 0, tibares: 0 });
}

/**
 * Paga `custoTc` (em tibares de cobre) com a carteira { to, tp, tc }.
 *
 * Mexe o mínimo nas moedas: paga com prata, depois cobre, e só então quebra
 * ouro; o troco volta em prata e cobre. Devolve a carteira nova ou `null`
 * quando o dinheiro não basta.
 */
export function pagar(carteira, custoTc) {
  let to = Math.max(0, Math.trunc(Number(carteira.to) || 0));
  let tp = Math.max(0, Math.trunc(Number(carteira.tp) || 0));
  let tc = Math.max(0, Math.trunc(Number(carteira.tc) || 0));
  if (to * 100 + tp * 10 + tc < custoTc) return null;

  let resta = custoTc;
  const usaTp = Math.min(tp, Math.floor(resta / 10));
  tp -= usaTp; resta -= usaTp * 10;
  const usaTc = Math.min(tc, resta);
  tc -= usaTc; resta -= usaTc;
  // Sobrou menos de 1 TP sem cobre para cobrir: uma prata a mais, com troco
  if (resta > 0 && tp > 0) { tp -= 1; resta -= 10; }
  if (resta > 0) {
    const usaTo = Math.ceil(resta / 100);
    to -= usaTo; resta -= usaTo * 100;
  }
  const troco = -resta;
  return { to, tp: tp + Math.floor(troco / 10), tc: tc + (troco % 10) };
}

export function formatarTibares(valor) {
  return `T$ ${(Number(valor) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`;
}

/* ─── Ator ───────────────────────────────────────────────────────────────── */

export function temEscriba(ator) {
  return !!ator?.items?.some((i) => definicaoDe(i)?.escriba);
}

/** Níveis de arcanista (soma, caso a ficha tenha mais de um item da classe). */
export function nivelDeArcanista(ator) {
  return (ator?.items ?? [])
    .filter((i) => i.type === 'classe' && normalizarNome(i.name).startsWith('arcanista'))
    .reduce((soma, i) => soma + (Number(i.system?.niveis) || 0), 0);
}

function carteiraDe(ator) {
  const d = ator.system?.dinheiro ?? {};
  return { to: Number(d.to) || 0, tp: Number(d.tp) || 0, tc: Number(d.tc) || 0 };
}

const emTc = (c) => c.to * 100 + c.tp * 10 + c.tc;

/* ─── Catálogo de magias ─────────────────────────────────────────────────── */

let _catalogo = null;

/**
 * Todas as magias dos compêndios de itens, sem repetir nome: a do sistema
 * ganha das cópias de outros módulos. Montado uma vez por sessão.
 */
async function catalogoDeMagias() {
  if (_catalogo) return _catalogo;
  const porNome = new Map();
  const packs = [...game.packs].filter((p) => p.documentName === 'Item')
    .sort((a, b) => (b.collection === 'tormenta20.magias') - (a.collection === 'tormenta20.magias'));
  for (const pack of packs) {
    let indice;
    try {
      indice = await pack.getIndex({ fields: ['type', 'system.circulo', 'system.tipo', 'system.escola'] });
    } catch (err) {
      console.warn(`${MODULE_ID} | Escriba Arcano: compêndio ${pack.collection} ilegível`, err);
      continue;
    }
    for (const e of indice) {
      if (e.type !== 'magia') continue;
      const circulo = Number(e.system?.circulo) || 0;
      if (circulo < 1 || circulo > 5) continue;
      const chave = normalizarNome(e.name);
      if (porNome.has(chave)) continue;
      porNome.set(chave, {
        chave,
        uuid: e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}`,
        nome: e.name,
        img: e.img,
        circulo,
        tipo: e.system?.tipo ?? '',
        escola: e.system?.escola ?? '',
        fonte: pack.title
      });
    }
  }
  _catalogo = [...porNome.values()]
    .sort((a, b) => a.circulo - b.circulo || a.nome.localeCompare(b.nome, 'pt-BR'));
  return _catalogo;
}

/* ─── Janela ─────────────────────────────────────────────────────────────── */

const esc = (t) => foundry.utils.escapeHTML(String(t ?? ''));
const rotulo = (mapa, chave) => {
  const r = CONFIG.T20?.[mapa]?.[chave];
  return r ? game.i18n.localize(r) : '';
};

function filtros(raiz) {
  const campo = (nome) => raiz.querySelector(`[data-esc-filtro="${nome}"]`);
  return {
    busca: normalizarNome(campo('busca')?.value ?? ''),
    tipo: campo('tipo')?.value ?? 'arc',
    circulo: campo('circulo')?.value ?? 'acesso',
    escola: campo('escola')?.value ?? '',
    conhecidas: !!campo('conhecidas')?.checked
  };
}

function passaNoFiltro(magia, f, { maximo, conhecidas }) {
  if (!f.conhecidas && conhecidas.has(magia.chave)) return false;
  // Universal vale como arcana e como divina
  if (f.tipo === 'arc' && !['arc', 'uni'].includes(magia.tipo)) return false;
  if (f.tipo === 'div' && !['div', 'uni'].includes(magia.tipo)) return false;
  if (f.circulo === 'acesso' && magia.circulo > maximo) return false;
  if (/^\d$/.test(f.circulo) && magia.circulo !== Number(f.circulo)) return false;
  if (f.escola && magia.escola !== f.escola) return false;
  if (f.busca && !magia.chave.includes(f.busca)) return false;
  return true;
}

function linhaMagia(magia, { conhecida, naLista, acima }) {
  const custo = custoDoCirculo(magia.circulo);
  const detalhes = [rotulo('spellType', magia.tipo), rotulo('spellSchools', magia.escola), magia.fonte]
    .filter(Boolean).join(' · ');
  const situacao = conhecida
    ? '<span class="t20g-chip t20g-chip--sucesso">Já conhece</span>'
    : acima ? '<span class="t20g-chip t20g-chip--aviso" data-tooltip="Círculo acima do seu acesso">Acima do acesso</span>' : '';
  return `<article class="t20g-esc-item ${naLista ? 'na-lista' : ''}" data-chave="${esc(magia.chave)}">
    <img class="t20g-miniatura" src="${esc(magia.img)}" alt="">
    <div class="t20g-esc-info">
      <div class="t20g-esc-nome"><a data-esc-acao="ver" data-tooltip="Abrir a magia">${esc(magia.nome)}</a>${situacao}</div>
      <small>${esc(detalhes)}</small>
    </div>
    <div class="t20g-esc-custo" data-tooltip="${custo.pm} PM: ${custo.dias} dia(s) de trabalho">
      <b>${formatarTibares(custo.tibares)}</b><small>${custo.dias} dia${custo.dias > 1 ? 's' : ''}</small>
    </div>
    <div class="t20g-btn-grupo">
      <button type="button" class="t20g-btn t20g-btn--pequeno" data-esc-acao="aprender" ${conhecida ? 'disabled' : ''}
        data-tooltip="Aprender só esta magia"><i class="fa-solid fa-feather-pointed"></i> Aprender</button>
      <button type="button" class="t20g-btn t20g-btn--icone t20g-btn--pequeno t20g-esc-alternar" data-esc-acao="lista" ${conhecida ? 'disabled' : ''}
        data-tooltip="${naLista ? 'Tirar da lista' : 'Pôr na lista'}"><i class="fa-solid ${naLista ? 'fa-check' : 'fa-plus'}"></i></button>
    </div>
  </article>`;
}

function conteudo(ator, { nivel, maximo }) {
  const opcoes = (mapa) => Object.entries(CONFIG.T20?.[mapa] ?? {})
    .map(([v, r]) => `<option value="${v}">${esc(game.i18n.localize(r))}</option>`).join('');
  const acesso = maximo
    ? `Arcanista ${nivel}: acesso até o ${maximo}º círculo.`
    : 'Sem níveis de arcanista na ficha: escolha o círculo no filtro.';
  return `<div class="t20g-esc-janela">
    <p class="t20g-esc-regra"><i class="fa-solid fa-scroll"></i>
      Cada PM da magia custa <b>1 dia</b> de trabalho e <b>T$ 250</b> em matérias-primas. ${acesso}</p>
    <div class="t20g-barra t20g-esc-filtros">
      <input type="search" class="t20g-cresce" data-esc-filtro="busca" placeholder="Buscar magia…">
      <select data-esc-filtro="tipo">
        <option value="arc" selected>Arcanas</option><option value="div">Divinas</option><option value="">Todos os tipos</option>
      </select>
      <select data-esc-filtro="circulo">
        <option value="acesso" ${maximo ? 'selected' : ''}>Círculos que acesso</option>
        ${[1, 2, 3, 4, 5].map((c) => `<option value="${c}">${c}º círculo</option>`).join('')}
        <option value="" ${maximo ? '' : 'selected'}>Todos os círculos</option>
      </select>
      <select data-esc-filtro="escola"><option value="">Todas as escolas</option>${opcoes('spellSchools')}</select>
      <label class="t20g-esc-check"><input type="checkbox" data-esc-filtro="conhecidas"> Já conhecidas</label>
    </div>
    <div class="t20g-esc-lista t20g-rola"><p class="t20g-vazio">Carregando magias…</p></div>
    <div class="t20g-esc-resumo">
      <div class="t20g-esc-escolhidas"></div>
      <div class="t20g-esc-totais"></div>
      <button type="button" class="t20g-btn t20g-btn--primario" data-esc-acao="aprender-lista" disabled>
        <i class="fa-solid fa-book-medical"></i> Aprender a lista</button>
    </div>
  </div>`;
}

function ligar(raiz, ator, catalogo, contexto) {
  const lista = raiz.querySelector('.t20g-esc-lista');
  const escolhidas = new Map();
  const conhecidas = () => new Set(ator.items.filter((i) => i.type === 'magia').map((i) => normalizarNome(i.name)));
  const porChave = new Map(catalogo.map((m) => [m.chave, m]));

  const desenharLista = () => {
    const f = filtros(raiz);
    const sabidas = conhecidas();
    const visiveis = catalogo.filter((m) => passaNoFiltro(m, f, { maximo: contexto.maximo, conhecidas: sabidas }));
    const rolagem = lista.scrollTop;
    if (!visiveis.length) {
      lista.innerHTML = '<p class="t20g-vazio">Nenhuma magia com esses filtros.</p>';
      return;
    }
    const grupos = new Map();
    for (const m of visiveis) {
      if (!grupos.has(m.circulo)) grupos.set(m.circulo, []);
      grupos.get(m.circulo).push(m);
    }
    lista.innerHTML = [...grupos].map(([circulo, magias]) => `<section class="t20g-esc-circulo">
      <h3 class="t20g-titulo">${circulo}º círculo <small>${magias.length}</small></h3>
      <div class="t20g-esc-grupo">${magias.map((m) => linhaMagia(m, {
        conhecida: sabidas.has(m.chave),
        naLista: escolhidas.has(m.chave),
        acima: contexto.maximo > 0 && m.circulo > contexto.maximo
      })).join('')}</div>
    </section>`).join('');
    lista.scrollTop = rolagem;
  };

  const desenharResumo = () => {
    const magias = [...escolhidas.values()];
    const total = totalDaLista(magias.map((m) => m.circulo));
    const saldo = emTc(carteiraDe(ator)) / 10;
    const falta = total.tibares - saldo;
    raiz.querySelector('.t20g-esc-escolhidas').innerHTML = magias.length
      ? magias.map((m) => `<span class="t20g-chip" data-chave="${esc(m.chave)}">${esc(m.nome)}
          <a data-esc-acao="tirar" data-tooltip="Tirar da lista"><i class="fa-solid fa-xmark"></i></a></span>`).join('')
      : '<span class="t20g-esc-dica">Use <i class="fa-solid fa-plus"></i> para montar uma lista de estudo.</span>';
    raiz.querySelector('.t20g-esc-totais').innerHTML = magias.length
      ? `<span><i class="fa-solid fa-calendar-days"></i> <b>${total.dias}</b> dia${total.dias > 1 ? 's' : ''}</span>
         <span><i class="fa-solid fa-coins"></i> <b>${formatarTibares(total.tibares)}</b></span>
         <span class="${falta > 0 ? 't20g-esc-falta' : 't20g-esc-saldo'}">Carteira: ${formatarTibares(saldo)}${falta > 0 ? ` (faltam ${formatarTibares(falta)})` : ''}</span>`
      : `<span class="t20g-esc-saldo">Carteira: ${formatarTibares(saldo)}</span>`;
    const botao = raiz.querySelector('[data-esc-acao="aprender-lista"]');
    botao.disabled = !magias.length || falta > 0;
    botao.innerHTML = `<i class="fa-solid fa-book-medical"></i> ${magias.length > 1 ? `Aprender ${magias.length} magias` : 'Aprender a lista'}`;
  };

  // Pôr/tirar da lista muda só a linha e o resumo: a lista não é redesenhada
  const alternarLinha = (chave, naLista) => {
    const linha = lista.querySelector(`.t20g-esc-item[data-chave="${CSS.escape(chave)}"]`);
    if (!linha) return;
    linha.classList.toggle('na-lista', naLista);
    const botao = linha.querySelector('.t20g-esc-alternar');
    botao.dataset.tooltip = naLista ? 'Tirar da lista' : 'Pôr na lista';
    botao.querySelector('i').className = `fa-solid ${naLista ? 'fa-check' : 'fa-plus'}`;
  };

  const aprenderAgora = async (magias, botao) => {
    if (botao) botao.disabled = true;
    try {
      if (await aprender(ator, magias)) {
        for (const m of magias) escolhidas.delete(m.chave);
        desenharLista();
      }
    } finally {
      desenharResumo();
      if (botao?.isConnected && !botao.closest('[data-esc-acao="aprender-lista"]')) botao.disabled = false;
    }
  };

  let espera;
  raiz.querySelector('.t20g-esc-filtros').addEventListener('input', (ev) => {
    clearTimeout(espera);
    if (ev.target.type === 'search') espera = setTimeout(desenharLista, 150);
    else desenharLista();
  });

  raiz.addEventListener('click', async (ev) => {
    const alvo = ev.target.closest('[data-esc-acao]');
    if (!alvo || alvo.disabled) return;
    ev.preventDefault();
    const chave = alvo.closest('[data-chave]')?.dataset.chave;
    const magia = chave ? porChave.get(chave) : null;
    switch (alvo.dataset.escAcao) {
      case 'ver':
        (await fromUuid(magia.uuid))?.sheet?.render(true);
        break;
      case 'lista':
        if (escolhidas.has(chave)) escolhidas.delete(chave);
        else escolhidas.set(chave, magia);
        alternarLinha(chave, escolhidas.has(chave));
        desenharResumo();
        break;
      case 'tirar':
        escolhidas.delete(chave);
        alternarLinha(chave, false);
        desenharResumo();
        break;
      case 'aprender':
        await aprenderAgora([magia], alvo);
        break;
      case 'aprender-lista':
        await aprenderAgora([...escolhidas.values()], alvo);
        break;
    }
  });

  // Dinheiro ou magias mudaram na ficha com a janela aberta: o resumo acompanha
  const aoMudarAtor = (doc) => {
    if (!raiz.isConnected) return Hooks.off('updateActor', gancho);
    if (doc.id === ator.id) desenharResumo();
  };
  const gancho = Hooks.on('updateActor', aoMudarAtor);

  desenharLista();
  desenharResumo();
}

export async function abrirEscriba(ator) {
  if (!ator || !podeControlar(ator)) return;
  const nivel = nivelDeArcanista(ator);
  const contexto = { nivel, maximo: circuloMaximo(nivel) };
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Escriba Arcano — ${ator.name}`, icon: 'fa-solid fa-feather-pointed' },
    position: { width: 780 },
    content: conteudo(ator, contexto),
    rejectClose: false,
    buttons: [{ action: 'fechar', label: 'Fechar', icon: 'fa-solid fa-xmark', default: true }],
    render: async (_evento, dialogo) => {
      const raiz = dialogo.element;
      try {
        ligar(raiz, ator, await catalogoDeMagias(), contexto);
      } catch (err) {
        console.error(`${MODULE_ID} | Escriba Arcano: falha ao montar a janela`, err);
        raiz.querySelector('.t20g-esc-lista').innerHTML = '<p class="t20g-vazio">Não foi possível ler as magias dos compêndios.</p>';
      }
    }
  });
}

/* ─── Aprender ───────────────────────────────────────────────────────────── */

/** Cobra, copia as magias para a ficha e registra no chat. Devolve true se aprendeu. */
async function aprender(ator, magias) {
  const sabidas = new Set(ator.items.filter((i) => i.type === 'magia').map((i) => normalizarNome(i.name)));
  magias = magias.filter((m) => !sabidas.has(m.chave));
  if (!magias.length) return false;

  const total = totalDaLista(magias.map((m) => m.circulo));
  const carteira = carteiraDe(ator);
  const nova = pagar(carteira, total.tibares * 10);
  if (!nova) {
    ui.notifications.warn(`${ator.name} não tem ${formatarTibares(total.tibares)} para as matérias-primas.`);
    return false;
  }

  const nomes = magias.map((m) => `<b>${esc(m.nome)}</b>`).join(', ');
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: 'Escriba Arcano', icon: 'fa-solid fa-feather-pointed' },
    content: `<div class="t20g-esc-confirmar"><p>Aprender ${nomes}?</p>
      <p><i class="fa-solid fa-calendar-days"></i> ${total.dias} dia${total.dias > 1 ? 's' : ''} de trabalho ·
        <i class="fa-solid fa-coins"></i> ${formatarTibares(total.tibares)} em matérias-primas</p></div>`,
    rejectClose: false
  });
  if (!ok) return false;

  const dados = [];
  const aprendidas = [];
  for (const m of magias) {
    const doc = await fromUuid(m.uuid);
    if (!doc) continue;
    const obj = doc.toObject();
    delete obj._id;
    foundry.utils.setProperty(obj, `flags.${MODULE_ID}.escribaArcano`, true);
    // Origem na Ficha Hayd (t20-hayd-ui): categoria livre, sem nível
    foundry.utils.setProperty(obj, 'flags.t20-hayd-ui.origemPoder', { categoria: 'Escriba Arcano', nivel: null });
    dados.push(obj);
    aprendidas.push(m);
  }
  if (!dados.length) {
    ui.notifications.error('Não foi possível ler as magias escolhidas.');
    return false;
  }

  await ator.update({
    'system.dinheiro.to': nova.to,
    'system.dinheiro.tp': nova.tp,
    'system.dinheiro.tc': nova.tc
  });
  await ator.createEmbeddedDocuments('Item', dados);

  const real = totalDaLista(aprendidas.map((m) => m.circulo));
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: ator }),
    content: `<div class="t20g-auto-chat t20g-esc-chat">
      <i class="fa-solid fa-feather-pointed"></i>
      <p><b>${esc(ator.name)}</b> passou <b>${real.dias} dia${real.dias > 1 ? 's' : ''}</b> copiando pergaminhos e grimórios
        e gastou <b>${formatarTibares(real.tibares)}</b> em matérias-primas.</p>
      <p>Magia${aprendidas.length > 1 ? 's' : ''} aprendida${aprendidas.length > 1 ? 's' : ''}:</p>
      <ul>${aprendidas.map((m) => `<li>@UUID[${m.uuid}]{${esc(m.nome)}} <small>(${m.circulo}º círculo)</small></li>`).join('')}</ul>
    </div>`
  });
  ui.notifications.info(`${ator.name} aprendeu ${aprendidas.length} magia${aprendidas.length > 1 ? 's' : ''}.`);
  return true;
}

export const escriba = { temEscriba, abrir: abrirEscriba, nivelDeArcanista, circuloMaximo };
