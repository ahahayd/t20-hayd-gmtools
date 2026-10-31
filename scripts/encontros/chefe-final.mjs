/**
 * t20-hayd-gmtools | encontros/chefe-final.mjs
 * Aplicador de Chefe Final (AdA p. 368): transforma uma ameaça em chefe na
 * própria ficha — PV dobrados, +2 PM por ND, RD por patamar, Maior que a
 * Morte — e, opcionalmente, em Rei da Arena, com a arena e os recursos
 * escritos como poderes na ficha. Tudo fica marcado numa flag e pode ser
 * desfeito ("Remover Chefe Final") devolvendo os valores originais.
 */
import { MODULE_ID } from '../tesouros/constantes.mjs';
import { ndNumero, ndRotulo, parametros, patamar, PAPEIS } from './regras.mjs';
import { itemDeMenu } from '../versao.mjs';
import { ajustesChefe, ARENAS, RECURSOS, textoConducao, indicePatamar } from './dados-chefe.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const FLAG = 'chefeFinal';
const SUFIXO = ' (Chefe Final)';
const UUID_MAIOR_QUE_A_MORTE = 'Compendium.bestiario-de-arton.habilidades-do-bestiario.Item.lHnXVBHFQvgsYJnZ';

export function ehChefeFinal(actor) {
  return !!actor?.getFlag?.(MODULE_ID, FLAG);
}

function papelDe(actor) {
  return actor.system?.detalhes?.role || 'solo';
}

function poder(nome, img, html) {
  return {
    name: nome, type: 'poder', img,
    system: { description: { value: html } },
    flags: { [MODULE_ID]: { [FLAG]: true } }
  };
}

/** Poder "Maior que a Morte": o do Bestiário de Arton, se instalado; senão, um próprio. */
async function maiorQueAMorte() {
  if (game.packs.get('bestiario-de-arton.habilidades-do-bestiario')) {
    const doc = await fromUuid(UUID_MAIOR_QUE_A_MORTE).catch(() => null);
    if (doc) {
      const d = doc.toObject();
      delete d._id;
      foundry.utils.setProperty(d, `flags.${MODULE_ID}.${FLAG}`, true);
      return d;
    }
  }
  return poder('Maior que a Morte', 'icons/svg/skull.svg',
    '<p>Enquanto estiver com metade ou mais de seus PV, a criatura é imune a efeitos de morte instantânea. Ainda pode ser reduzida a 0 PV por dano.</p>');
}

/**
 * Aplica o Chefe Final na ficha. Se ela já é chefe, refaz a partir dos
 * valores originais (trocar arena/recursos não dobra os PV de novo).
 */
/** Rótulo de um tipo de dano do sistema. */
function rotuloDano(k) {
  const v = CONFIG.T20?.damageTypes?.[k];
  return v ? game.i18n.localize(v) : k;
}

const link = c => (c?.uuid ? `@UUID[${c.uuid}]{${c.nome}}` : '');

/** Texto das escolhas de um recurso, anexado ao poder na ficha. */
function textoEscolhas(id, e = {}, actor) {
  switch (id) {
    case 'lacaios': return e.lacaios?.length ? `<p><b>Lacaios:</b> ${e.lacaios.map(c => `${link(c)} (ND ${c.ndRotulo})`).join(', ')}.</p>` : '';
    case 'campeao': return e.campeao ? `<p><b>Campeão:</b> ${link(e.campeao)} (ND ${e.campeao.ndRotulo}).</p>` : '';
    case 'orbe': return e.orbeElemento ? `<p><b>Elemento:</b> ${rotuloDano(e.orbeElemento)}${e.orbeVulneravel ? ` · o orbe é vulnerável a ${rotuloDano(e.orbeVulneravel)}` : ''}.</p>` : '';
    case 'selo': return e.selo ? `<p><b>Magia do selo:</b> ${link(e.selo)}.</p>` : '';
    case 'torreta': {
      const arma = actor?.items.get(e.torreta);
      return arma ? `<p><b>Ataque da torreta:</b> ${arma.name}.</p>` : '';
    }
    case 'arsenal': {
      const itens = (e.arsenal ?? []).filter(x => x?.uuid);
      return itens.length ? `<p><b>Itens escondidos:</b> ${itens.map(link).join(', ')}.</p>` : '';
    }
    default: return '';
  }
}

export async function aplicarChefeFinal(actor, { arena = null, recursos = [], escolhas = {} } = {}) {
  if (ehChefeFinal(actor)) await removerChefeFinal(actor, { silencioso: true });
  const s = actor._source.system;
  const nd = ndNumero(s.attributes?.nd) ?? 1;
  const orig = {
    pvMax: Number(s.attributes?.pv?.max) || 0,
    pvValue: Number(s.attributes?.pv?.value) || 0,
    pmMax: Number(s.attributes?.pm?.max) || 0,
    pmValue: Number(s.attributes?.pm?.value) || 0,
    rd: Number(s.tracos?.resistencias?.dano?.base) || 0
  };
  const aj = ajustesChefe({ nd, pvMax: orig.pvMax, pmMax: orig.pmMax });
  const cd = parametros(papelDe(actor), nd).cd;

  // Só o nome da ficha ganha o sufixo; o token continua com o nome de sempre.
  const tokenNome = actor.prototypeToken?.name || actor.name;
  await actor.update({
    name: actor.name.endsWith(SUFIXO) ? actor.name : actor.name + SUFIXO,
    'prototypeToken.name': tokenNome,
    'system.attributes.pv.max': aj.pvNovo,
    'system.attributes.pv.value': aj.pvNovo,
    'system.attributes.pm.max': aj.pmNovo,
    'system.attributes.pm.value': orig.pmValue + aj.pmExtra,
    'system.tracos.resistencias.dano.base': orig.rd + aj.rd,
    [`flags.${MODULE_ID}.${FLAG}`]: { orig, arena, recursos, escolhas, nd, aplicadoEm: Date.now() }
  });

  const itens = [];
  if (!actor.items.some(i => /maior que a morte/i.test(i.name))) itens.push(await maiorQueAMorte());
  itens.push(poder('Chefe Final', 'systems/tormenta20/icons/itens/itens-magicos/coroa.webp', textoConducao(nd, cd)));
  const t = aj.t;
  const a = ARENAS.find(x => x.id === arena);
  const templo = a?.id === 'templo' && escolhas.templo ? `<p><b>Divindade:</b> ${escolhas.templo}.</p>` : '';
  if (a) itens.push(poder(`Arena: ${a.nome}`, 'icons/svg/castle.svg', `<p>${a.texto(t)}</p>${templo}<p><i>CD ${cd}.</i></p>`));
  for (const id of recursos) {
    const r = RECURSOS.find(x => x.id === id);
    if (!r) continue;
    itens.push(poder(`Recurso: ${r.nome}`, 'icons/svg/target.svg',
      `<p>${r.texto(t)}</p>${textoEscolhas(id, escolhas, actor)}<p><i>CD ${cd}. Ativar: ação de movimento (a que o chefe ganha ao fim do turno de cada PJ).${r.criatura ? ' Criaturas deste recurso não contam para recompensas.' : ''}</i></p>`));
  }
  await actor.createEmbeddedDocuments('Item', itens);
  return aj;
}

/** Desfaz o Chefe Final: valores originais de volta e poderes criados removidos. */
export async function removerChefeFinal(actor, { silencioso = false } = {}) {
  const f = actor.getFlag(MODULE_ID, FLAG);
  if (!f) return;
  const o = f.orig ?? {};
  await actor.update({
    name: actor.name.endsWith(SUFIXO) ? actor.name.slice(0, -SUFIXO.length) : actor.name,
    'system.attributes.pv.max': o.pvMax,
    'system.attributes.pv.value': Math.min(o.pvValue ?? o.pvMax, o.pvMax),
    'system.attributes.pm.max': o.pmMax,
    'system.attributes.pm.value': Math.min(o.pmValue ?? o.pmMax, o.pmMax),
    'system.tracos.resistencias.dano.base': o.rd ?? 0,
    [`flags.${MODULE_ID}.-=${FLAG}`]: null
  });
  const ids = actor.items.filter(i => i.getFlag(MODULE_ID, FLAG)).map(i => i.id);
  if (ids.length) await actor.deleteEmbeddedDocuments('Item', ids);
  if (!silencioso) ui.notifications.info(game.i18n.format('THM.BossRemoved', { nome: actor.name }));
}

/* ─── Janela ──────────────────────────────────────────────────────────── */

class ChefeFinalApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ['t20g-chefe'],
    window: { title: 'THM.BossTitle', icon: 'fa-solid fa-crown', resizable: true },
    position: { width: 640, height: 720 },
    actions: {
      aplicar: ChefeFinalApp.#onAplicar,
      remover: ChefeFinalApp.#onRemover,
      alternarRecurso: ChefeFinalApp.#onAlternarRecurso,
      marcarCalculo: ChefeFinalApp.#onMarcarCalculo,
      removerEscolha: ChefeFinalApp.#onRemoverEscolha
    }
  };

  static PARTS = { body: { template: `modules/${MODULE_ID}/templates/encontros/chefe-final.hbs` } };

  #actor;
  #arena = null;
  #recursos = new Set();
  /** Sub-escolhas dos recursos (lacaios, campeão, orbe, selo, torreta, arsenal, templo). */
  #escolhas = { lacaios: [], arsenal: [] };
  #aoAplicar;
  #aoMarcar;
  #importar;
  #marcado = false;
  #rolagem = 0;

  constructor(actor, { aoAplicar, aoMarcar, importar, marcadoNoCalculo = false } = {}) {
    super({ id: `t20g-chefe-${actor.id ?? foundry.utils.randomID()}` });
    this.#actor = actor;
    this.#aoAplicar = aoAplicar;
    this.#aoMarcar = aoMarcar;
    this.#importar = importar;
    this.#marcado = marcadoNoCalculo;
    const f = actor.getFlag(MODULE_ID, FLAG);
    if (f) {
      this.#arena = f.arena ?? null;
      this.#recursos = new Set(f.recursos ?? []);
      this.#escolhas = foundry.utils.mergeObject({ lacaios: [], arsenal: [] }, f.escolhas ?? {});
    }
  }

  get title() { return `${game.i18n.localize('THM.BossTitle')} — ${this.#actor.name}`; }

  async _prepareContext() {
    const a = this.#actor;
    const f = a.getFlag(MODULE_ID, FLAG);
    const s = a._source.system;
    const nd = ndNumero(s.attributes?.nd) ?? 1;
    const base = f?.orig ?? {
      pvMax: Number(s.attributes?.pv?.max) || 0,
      pmMax: Number(s.attributes?.pm?.max) || 0,
      rd: Number(s.tracos?.resistencias?.dano?.base) || 0
    };
    const aj = ajustesChefe({ nd, pvMax: base.pvMax, pmMax: base.pmMax });
    const t = indicePatamar(nd);
    const papel = papelDe(a);
    const cd = parametros(papel, nd).cd;
    const sub = await this.#contextoEscolhas(nd, t);
    return {
      sub,
      nome: a.name, img: a.img, nd: ndRotulo(nd), patamar: patamar(nd).rotulo,
      papel: PAPEIS[papel]?.rotulo, lacaio: papel === 'lackey',
      aplicado: !!f, mundo: !a.pack || !!this.#importar, doCompendio: !!a.pack,
      calculo: !!this.#aoMarcar, marcado: this.#marcado,
      ajustes: [
        { rotulo: 'Pontos de vida', de: base.pvMax, para: aj.pvNovo },
        ...(aj.pmExtra ? [{ rotulo: 'Pontos de mana', de: base.pmMax, para: aj.pmNovo }] : []),
        ...(aj.rd ? [{ rotulo: 'RD (todo dano)', de: base.rd, para: base.rd + aj.rd }] : []),
        { rotulo: 'ND para XP e tesouro', de: ndRotulo(nd), para: ndRotulo(aj.ndRecompensa) }
      ],
      semPM: !base.pmMax,
      cd, cdIdentificar: 15 + Math.min(Math.floor(nd), 20),
      limite: aj.recursos, escolhidos: this.#recursos.size,
      excedeu: this.#recursos.size > aj.recursos,
      arenas: ARENAS.map(x => ({ id: x.id, nome: x.nome, icone: x.icone, sel: x.id === this.#arena, texto: x.texto(t) })),
      arenaSel: ARENAS.find(x => x.id === this.#arena)?.texto(t) ?? null,
      recursos: RECURSOS.map(x => ({ id: x.id, nome: x.nome, icone: x.icone, sel: this.#recursos.has(x.id), texto: x.texto(t), criatura: x.criatura }))
    };
  }

  /** Formulários das escolhas, só dos recursos (e da arena) selecionados. */
  async #contextoEscolhas(nd, t) {
    const e = this.#escolhas;
    const sel = id => this.#recursos.has(id);
    const out = { algum: false };
    if (sel('lacaios')) {
      const limite = Math.max(0.25, nd - 2);
      const soma = e.lacaios.reduce((acc, c) => acc + c.nd, 0);
      out.lacaios = {
        limite: ndRotulo(limite), soma: ndRotulo(soma) === '0' ? '0' : String(Math.round(soma * 100) / 100).replace('.', ','),
        cheio: e.lacaios.length >= 4, excedeu: soma > limite, poucos: e.lacaios.length < 2,
        escolhidos: e.lacaios.map((c, i) => ({ ...c, i }))
      };
    }
    if (sel('campeao')) out.campeao = { escolhido: e.campeao, nd: ndRotulo(nd) };
    if (sel('orbe')) {
      const tipos = Object.keys(CONFIG.T20?.damageTypes ?? {}).filter(k => !['dano', 'perda'].includes(k))
        .map(k => ({ id: k, rotulo: rotuloDano(k) }));
      out.orbe = { tipos, elemento: e.orbeElemento, vulneravel: e.orbeVulneravel };
    }
    if (sel('selo')) out.selo = { circulo: t + 1, escolhido: e.selo };
    if (sel('torreta')) {
      out.torreta = { atual: e.torreta, opcoes: this.#actor.items.filter(i => i.type === 'arma').map(i => ({ id: i.id, nome: i.name })) };
    }
    if (sel('arsenal')) {
      const itens = (e.arsenal ?? []).filter(x => x?.uuid);
      out.arsenal = { limite: t + 1, cheio: itens.length >= t + 1, escolhidos: itens.map((x, i) => ({ ...x, i })) };
    }
    if (this.#arena === 'templo') out.templo = { valor: e.templo ?? '' };
    out.algum = Object.keys(out).length > 1;
    return out;
  }

  /**
   * Soltar na janela: o alvo é a área [data-solta] sob o cursor. Criaturas
   * vão para Lacaios/Campeão; itens para o Arsenal; magias para o Selo.
   * As regras do livro (ND somado, ND igual, círculo) são conferidas aqui.
   */
  async #aoSoltar(ev) {
    const zona = ev.target.closest?.('[data-solta]')?.dataset.solta;
    if (!zona) return;
    ev.preventDefault();
    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
    const dados = TE.getDragEventData(ev);
    const doc = dados?.uuid ? await fromUuid(dados.uuid) : null;
    if (!doc) return;
    const e = this.#escolhas;
    const nd = ndNumero(this.#actor._source.system.attributes?.nd) ?? 1;
    const t = indicePatamar(nd);
    const aviso = k => ui.notifications.warn(game.i18n.localize(k));
    const criatura = () => ({ uuid: doc.uuid, nome: doc.name, img: doc.img, nd: ndNumero(doc.system?.attributes?.nd) ?? 1, ndRotulo: ndRotulo(ndNumero(doc.system?.attributes?.nd) ?? 1) });

    if (zona === 'lacaios' || zona === 'campeao') {
      if (dados.type !== 'Actor' || !['npc', 'simple'].includes(doc.type)) return aviso('THM.BossDropCreature');
      const c = criatura();
      if (zona === 'lacaios') {
        if (e.lacaios.length >= 4) return aviso('THM.BossDropFull');
        const soma = e.lacaios.reduce((acc, x) => acc + x.nd, 0) + c.nd;
        if (soma > Math.max(0.25, nd - 2)) ui.notifications.warn(game.i18n.format('THM.BossDropOverLimit', { limite: ndRotulo(Math.max(0.25, nd - 2)) }));
        e.lacaios.push(c);
      } else {
        if (Math.floor(c.nd) !== Math.floor(nd)) ui.notifications.warn(game.i18n.format('THM.BossDropChampionND', { nd: ndRotulo(nd) }));
        e.campeao = c;
      }
    } else if (zona === 'selo') {
      if (doc.type !== 'magia') return aviso('THM.BossDropSpell');
      if (Number(doc.system?.circulo) !== t + 1) ui.notifications.warn(game.i18n.format('THM.BossDropSpellCircle', { circulo: t + 1 }));
      e.selo = { uuid: doc.uuid, nome: doc.name, img: doc.img };
    } else if (zona === 'arsenal') {
      if (dados.type !== 'Item') return aviso('THM.BossDropItem');
      e.arsenal = (e.arsenal ?? []).filter(x => x?.uuid);
      if (e.arsenal.length >= t + 1) return aviso('THM.BossDropFull');
      e.arsenal.push({ uuid: doc.uuid, nome: doc.name, img: doc.img });
    }
    this.render();
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.element.addEventListener('dragover', ev => {
      if (ev.target.closest?.('[data-solta]')) ev.preventDefault();
    });
    this.element.addEventListener('drop', ev => this.#aoSoltar(ev));
  }

  async _preRender(context, options) {
    await super._preRender?.(context, options);
    this.#rolagem = this.element?.querySelector('[data-rola]')?.scrollTop ?? 0;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const r = this.element.querySelector('[data-rola]');
    if (r) r.scrollTop = this.#rolagem;
    // Escolhas: selects redesenham (podem mudar a lista); textos só gravam.
    const el = this.element;
    const e = this.#escolhas;
    el.querySelector('[name="orbeElemento"]')?.addEventListener('change', ev => { e.orbeElemento = ev.currentTarget.value || null; });
    el.querySelector('[name="orbeVulneravel"]')?.addEventListener('change', ev => { e.orbeVulneravel = ev.currentTarget.value || null; });
    el.querySelector('[name="torreta"]')?.addEventListener('change', ev => { e.torreta = ev.currentTarget.value || null; });
    el.querySelector('[name="templo"]')?.addEventListener('change', ev => { e.templo = ev.currentTarget.value.trim(); });
    this.element.querySelector('[name="arena"]')?.addEventListener('change', ev => {
      this.#arena = ev.currentTarget.value || null;
      this.render();
    });
  }

  static #onRemoverEscolha(ev, alvo) {
    const { lista, i } = alvo.dataset;
    if (lista === 'lacaios' || lista === 'arsenal') this.#escolhas[lista].splice(Number(i), 1);
    else this.#escolhas[lista] = null;
    this.render();
  }

  static #onAlternarRecurso(ev, alvo) {
    const id = alvo.dataset.id;
    if (this.#recursos.has(id)) this.#recursos.delete(id);
    else this.#recursos.add(id);
    this.render();
  }

  /** "Só no cálculo": marca/desmarca na calculadora sem tocar na ficha. */
  static #onMarcarCalculo() {
    this.#marcado = !this.#marcado;
    this.#aoMarcar?.(this.#marcado);
    this.close();
  }

  static async #onAplicar() {
    if (this.#actor.pack) {
      if (!this.#importar) return ui.notifications.warn(game.i18n.localize('THM.BossPackActor'));
      this.#actor = await this.#importar(this.#actor);
    }
    const a = this.#actor;
    const escolhas = foundry.utils.deepClone(this.#escolhas);
    await aplicarChefeFinal(a, { arena: this.#arena, recursos: [...this.#recursos], escolhas });
    ui.notifications.info(game.i18n.format('THM.BossApplied', { nome: a.name }));
    await this.#aoAplicar?.(a, true, { recursos: [...this.#recursos], escolhas });
    this.render();
  }

  static async #onRemover() {
    await removerChefeFinal(this.#actor);
    await this.#aoAplicar?.(this.#actor, false);
    this.render();
  }
}

/** Abre o aplicador para um ator (do mundo ou de um token). */
export function abrirChefeFinal(actor, opcoes = {}) {
  if (!game.user.isGM || !actor) return null;
  const app = new ChefeFinalApp(actor, opcoes);
  app.render(true);
  return app;
}

/* Menu de contexto do diretório de atores: "Chefe Final…" nas ameaças. */
function opcaoNoMenu(opcoes) {
  if (opcoes.some(o => o.t20gChefe)) return;
  const atorDe = li => game.actors.get((li?.dataset ?? li?.[0]?.dataset)?.entryId ?? (li?.dataset ?? li?.[0]?.dataset)?.documentId);
  opcoes.push({
    ...itemDeMenu({
      name: game.i18n.localize('THM.BossMenu'),
      icon: '<i class="fa-solid fa-crown"></i>',
      condition: li => game.user.isGM && atorDe(li)?.type === 'npc',
      callback: li => abrirChefeFinal(atorDe(li))
    }),
    t20gChefe: true
  });
}

Hooks.on('getActorContextOptions', (_app, opcoes) => opcaoNoMenu(opcoes));
Hooks.on('getActorDirectoryEntryContext', (_html, opcoes) => opcaoNoMenu(opcoes));
