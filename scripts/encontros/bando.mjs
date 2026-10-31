/**
 * t20-hayd-gmtools | encontros/bando.mjs
 * Aplicador de Bando (AdA p. 388). Gera uma ficha NOVA ("Bando de X") a
 * partir da criatura-base — a original, do mundo ou de compêndio, não muda.
 */
import { MODULE_ID } from '../tesouros/constantes.mjs';
import { ndNumero, ndRotulo, patamar, PAPEIS } from './regras.mjs';
import { calcularBando, ndsDoBando, ESCALAS, TAMANHOS, multiplicarFormula, TEXTO_BANDO } from './dados-bando.mjs';
import { itemDeMenu } from '../versao.mjs';
import { pastaGMTools } from './pasta-gmtools.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const FLAG = 'bando';
const SAVES = ['fort', 'refl', 'vont'];
const PERICIAS_DE_ATAQUE = ['luta', 'pontaria'];

/** O que o cálculo precisa da criatura-base. */
export function dadosDaBase(doc) {
  const s = doc.system ?? {};
  return {
    papel: s.detalhes?.role || 'solo',
    nd: ndNumero(s.attributes?.nd) ?? 1,
    pv: Number(s.attributes?.pv?.max) || 0,
    defesa: Number(s.attributes?.defesa?.value) || null,
    resistencias: SAVES.map(k => Number(s.pericias?.[k]?.value) || 0),
    tamanho: s.tracos?.tamanho ?? 'med'
  };
}

export function nomeDoBando(nome) {
  return `Bando de ${nome}`;
}

/** Poder "Bando": o do Bestiário de Arton, se houver; senão, um próprio. */
async function poderBando() {
  for (const pack of game.packs.filter(p => p.documentName === 'Item' && /habilidade/i.test(p.title + p.collection))) {
    const e = (await pack.getIndex()).find(x => x.type === 'poder' && /^bando$/i.test(x.name.trim()));
    if (e) {
      const d = (await pack.getDocument(e._id)).toObject();
      delete d._id;
      return d;
    }
  }
  return { name: 'Bando', type: 'poder', img: 'icons/svg/combat.svg', system: { description: { value: TEXTO_BANDO } } };
}

/**
 * Cria a ficha do bando. Ataque e dano das armas são ajustados nos próprios
 * itens; poderes e magias com dano ficam como estão (o livro só multiplica o
 * dano de ataques e habilidades, e as habilidades vêm em texto livre) — uma
 * nota na ficha lembra o Mestre do multiplicador.
 */
export async function criarFichaBando(base, { escala = 'dezena', ndBando, nome, folder } = {}) {
  const b = dadosDaBase(base);
  const c = calcularBando({ ...b, ndBando, escala });
  const dados = base.pack ? game.actors.fromCompendium(base) : base.toObject();
  delete dados._id;
  dados.name = nome || nomeDoBando(base.name);
  dados.folder = folder ?? (await pastaGMTools()).id;
  // Token: o mesmo nome da ficha (é uma ameaça só) e o tamanho novo.
  const dim = { min: 0.5, peq: 1, med: 1, gra: 2, eno: 3, col: 6 }[c.tamanho] ?? 1;
  dados.prototypeToken = { ...(dados.prototypeToken ?? {}), name: dados.name, width: dim, height: dim };

  const sys = dados.system;
  const set = (k, v) => foundry.utils.setProperty(sys, k, v);
  set('attributes.nd', ndRotulo(ndBando));
  set('attributes.pv.max', c.pv);
  set('attributes.pv.value', c.pv);
  set('tracos.tamanho', c.tamanho);
  const defBase = Number(foundry.utils.getProperty(sys, 'attributes.defesa.base')) || 0;
  set('attributes.defesa.base', defBase + (c.defesa - (b.defesa ?? c.defesa)));
  for (const { i, delta } of c.deltaResistencias) {
    const k = SAVES[i];
    const atual = Number(foundry.utils.getProperty(sys, `pericias.${k}.outros`)) || 0;
    set(`pericias.${k}.outros`, atual + delta);
  }
  if (c.deltaPericias) {
    for (const [k, p] of Object.entries(sys.pericias ?? {})) {
      if (SAVES.includes(k) || PERICIAS_DE_ATAQUE.includes(k) || typeof p !== 'object') continue;
      p.outros = (Number(p.outros) || 0) + c.deltaPericias;
    }
  }
  foundry.utils.setProperty(dados, `flags.${MODULE_ID}.${FLAG}`, {
    baseUuid: base.uuid, ndBase: b.nd, escala, ndBando, multDano: c.multDano
  });

  // Armas: ataque com o mesmo desvio na linha nova; dano multiplicado se subiu de patamar.
  for (const item of dados.items ?? []) {
    if (item.type !== 'arma') continue;
    for (const roll of item.system?.rolls ?? []) {
      if (roll.type === 'ataque' && c.deltaAtaque) {
        const parte = roll.parts?.find((pt, idx) => idx > 0 && /^-?\d+$/.test(String(pt[0]).trim()));
        if (parte) parte[0] = String(Number(parte[0]) + c.deltaAtaque);
        else roll.parts.push([String(c.deltaAtaque), '', '']);
      }
      if (roll.type === 'dano' && c.multDano > 1) {
        for (const pt of roll.parts ?? []) if (pt[0]) pt[0] = multiplicarFormula(pt[0], c.multDano);
      }
    }
  }

  dados.items = [...(dados.items ?? []).filter(i => !/^bando$/i.test(i.name)), await poderBando(), {
    name: 'Notas do Bando', type: 'poder', img: 'icons/svg/book.svg',
    system: { description: { value:
      `<p>Bando de ${ESCALAS[escala].rotulo} formado a partir de <b>${base.name}</b> (ND ${ndRotulo(b.nd)} → ${ndRotulo(ndBando)}).</p>`
      + `<ul><li>Ataque das armas: ${c.deltaAtaque >= 0 ? '+' : ''}${c.deltaAtaque} (já aplicado).</li>`
      + `<li>Dano: ${c.multDano > 1 ? `×${c.multDano} por subir de patamar — já aplicado nas armas; <b>aplique também nas habilidades que causam dano</b> (exceto magias).` : 'mesmo patamar, mesmo dano.'}</li>`
      + `<li>CD das habilidades: ${c.deltaCD >= 0 ? '+' : ''}${c.deltaCD} em relação à criatura-base.</li>`
      + `<li>Perícias: ${c.deltaPericias >= 0 ? '+' : ''}${c.deltaPericias} (metade da variação de ND).</li>`
      + `${c.subiuPatamar ? '<li>Subiu de patamar: o livro sugere uma habilidade nova (ex.: Varrer).</li>' : ''}`
      + `<li>Tesouro: mesma categoria, rolada na linha do ND do bando; multiplique os itens carregados pela quantidade.</li></ul>`
    } },
    flags: { [MODULE_ID]: { [FLAG]: true } }
  }];
  return Actor.create(dados);
}

/* ─── Janela ──────────────────────────────────────────────────────────── */

class BandoApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ['t20g-chefe', 't20g-bando'],
    window: { title: 'THM.SwarmTitle', icon: 'fa-solid fa-people-group', resizable: true },
    position: { width: 560, height: 'auto' },
    actions: {
      criar: BandoApp.#onCriar,
      noEncontro: BandoApp.#onNoEncontro,
      desfazer: BandoApp.#onDesfazer
    }
  };

  static PARTS = { body: { template: `modules/${MODULE_ID}/templates/encontros/bando.hbs` } };

  #base;
  #escala;
  #ndBando;
  #nome;
  #opcoes;

  constructor(base, opcoes = {}) {
    super({ id: `t20g-bando-${foundry.utils.randomID()}` });
    this.#base = base;
    this.#opcoes = opcoes;
    this.#escala = opcoes.atual?.escala ?? 'dezena';
    const b = dadosDaBase(base);
    this.#ndBando = opcoes.atual?.ndBando ?? Math.min(20, Math.floor(b.nd) + ESCALAS[this.#escala].padrao);
    this.#nome = nomeDoBando(base.name);
  }

  get title() { return `${game.i18n.localize('THM.SwarmTitle')} — ${this.#base.name}`; }

  async _prepareContext() {
    const b = dadosDaBase(this.#base);
    const nds = ndsDoBando(b.nd, this.#escala);
    if (!nds.includes(this.#ndBando)) this.#ndBando = nds[Math.floor(nds.length / 2)];
    const c = calcularBando({ ...b, ndBando: this.#ndBando, escala: this.#escala });
    const T = CONFIG.T20?.actorSizes ?? {};
    const sinal = v => (v >= 0 ? `+${v}` : String(v));
    const resNomes = ['Fortitude', 'Reflexos', 'Vontade'];
    return {
      nome: this.#nome, img: this.#base.img, base: this.#base.name,
      ndBase: ndRotulo(b.nd), papel: PAPEIS[b.papel]?.rotulo,
      escalas: Object.entries(ESCALAS).map(([id, e]) => ({ id, rotulo: e.rotulo, sel: id === this.#escala })),
      nds: nds.map(n => ({ valor: n, sel: n === this.#ndBando })),
      noEncontro: !!this.#opcoes.aoUsarNoEncontro,
      jaNoEncontro: !!this.#opcoes.atual,
      linhas: [
        { rotulo: 'ND', de: ndRotulo(b.nd), para: c.ndRotulo },
        { rotulo: 'Patamar', de: patamar(b.nd).rotulo, para: patamar(this.#ndBando).rotulo },
        { rotulo: 'Tamanho', de: T[b.tamanho] ?? b.tamanho, para: T[c.tamanho] ?? c.tamanho },
        { rotulo: 'PV', de: b.pv, para: c.pv },
        { rotulo: 'Defesa', de: b.defesa ?? '—', para: c.defesa },
        ...c.deltaResistencias.map(({ i, delta }) => ({ rotulo: resNomes[i], de: b.resistencias[i], para: b.resistencias[i] + delta })),
        { rotulo: 'Ataque das armas', de: '', para: sinal(c.deltaAtaque) },
        { rotulo: 'Dano dos ataques', de: '', para: c.multDano > 1 ? `×${c.multDano}` : 'igual' },
        { rotulo: 'Demais perícias', de: '', para: sinal(c.deltaPericias) }
      ],
      subiu: c.subiuPatamar
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const el = this.element;
    el.querySelector('[name="escala"]')?.addEventListener('change', ev => {
      this.#escala = ev.currentTarget.value;
      this.#ndBando = Math.min(20, Math.floor(dadosDaBase(this.#base).nd) + ESCALAS[this.#escala].padrao);
      this.render();
    });
    el.querySelector('[name="ndBando"]')?.addEventListener('change', ev => { this.#ndBando = Number(ev.currentTarget.value); this.render(); });
    el.querySelector('[name="nome"]')?.addEventListener('change', ev => { this.#nome = ev.currentTarget.value.trim() || nomeDoBando(this.#base.name); });
  }

  static async #onCriar() {
    const ator = await criarFichaBando(this.#base, { escala: this.#escala, ndBando: this.#ndBando, nome: this.#nome });
    ui.notifications.info(game.i18n.format('THM.SwarmCreated', { nome: ator.name }));
    await this.#opcoes.aoCriar?.(ator);
    ator.sheet?.render(true);
    this.close();
  }

  static async #onNoEncontro() {
    await this.#opcoes.aoUsarNoEncontro?.({ escala: this.#escala, ndBando: this.#ndBando, nome: this.#nome });
    this.close();
  }

  static async #onDesfazer() {
    await this.#opcoes.aoUsarNoEncontro?.(null);
    this.close();
  }
}

export function abrirBando(base, opcoes = {}) {
  if (!game.user.isGM || !base) return null;
  const app = new BandoApp(base, opcoes);
  app.render(true);
  return app;
}

/* Menu de contexto do diretório de atores: "Criar Bando…". */
function opcaoNoMenu(opcoes) {
  if (opcoes.some(o => o.t20gBando)) return;
  const atorDe = li => {
    const d = li?.dataset ?? li?.[0]?.dataset;
    return game.actors.get(d?.entryId ?? d?.documentId);
  };
  opcoes.push({
    ...itemDeMenu({
      name: game.i18n.localize('THM.SwarmMenu'),
      icon: '<i class="fa-solid fa-people-group"></i>',
      condition: li => game.user.isGM && atorDe(li)?.type === 'npc',
      callback: li => abrirBando(atorDe(li))
    }),
    t20gBando: true
  });
}

Hooks.on('getActorContextOptions', (_app, opcoes) => opcaoNoMenu(opcoes));
Hooks.on('getActorDirectoryEntryContext', (_html, opcoes) => opcaoNoMenu(opcoes));

export { TAMANHOS };
