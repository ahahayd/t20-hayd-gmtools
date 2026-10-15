/**
 * Assistente de Criação — tela de fontes (Mestre).
 *
 * Um interruptor por compêndio de itens, agrupados por quem os fornece
 * (sistema, módulos, mundo), cada um com a contagem do que interessa ao
 * assistente: raças, classes, poderes, magias e equipamento. Nada é salvo
 * até o Mestre clicar em Salvar.
 */
import {
  MODULE_ID, packsDeItem, packLigado, packLigadoPorPadrao, mundoLigado, salvarFontes, contarPorTipo, ehDoSistema
} from './fontes.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const ROTULOS_CONTAGEM = [
  ['race', 'raças', 'fa-person'],
  ['classe', 'classes', 'fa-shield-halved'],
  ['poder', 'poderes', 'fa-bolt'],
  ['magia', 'magias', 'fa-wand-sparkles'],
  ['equip', 'itens', 'fa-sack']
];

export class CriacaoFontesApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 't20g-criacao-fontes',
    classes: ['t20g-criacao-fontes'],
    tag: 'form',
    window: { title: 'Fontes do Assistente de Criação', icon: 'fa-solid fa-book-bookmark', resizable: true },
    position: { width: 560, height: 640 },
    form: { handler: CriacaoFontesApp.#salvar, closeOnSubmit: true },
    actions: {
      padrao: CriacaoFontesApp.#padrao,
      todos: CriacaoFontesApp.#todos,
      nenhum: CriacaoFontesApp.#nenhum
    }
  };

  static PARTS = {
    corpo: { template: `modules/${MODULE_ID}/templates/criacao/fontes.hbs`, scrollable: [''] },
    rodape: { template: `modules/${MODULE_ID}/templates/criacao/fontes-rodape.hbs` }
  };

  /** Contagens por compêndio — lidas uma vez por janela. */
  #contagens = new Map();

  async _prepareContext() {
    const packs = packsDeItem();
    await Promise.all(packs.filter(p => !this.#contagens.has(p.collection)).map(async p => {
      try { this.#contagens.set(p.collection, await contarPorTipo(p)); }
      catch { this.#contagens.set(p.collection, null); }
    }));

    const grupos = { sistema: [], modulo: [], mundo: [] };
    for (const p of packs) {
      const c = this.#contagens.get(p.collection);
      const chips = c ? ROTULOS_CONTAGEM.filter(([k]) => c[k]).map(([k, rotulo, icone]) => ({ n: c[k], rotulo, icone })) : [];
      // Compêndio sem nada que o assistente use (tabelas de tesouro em forma
      // de item, por exemplo) não precisa ocupar a lista.
      if (c && !chips.length) continue;
      const grupo = ehDoSistema(p) ? 'sistema' : p.metadata.packageType === 'world' ? 'mundo' : 'modulo';
      grupos[grupo].push({
        id: p.collection,
        rotulo: p.metadata.label,
        pacote: p.metadata.packageType === 'module' ? (game.modules.get(p.metadata.packageName)?.title ?? p.metadata.packageName) : '',
        ligado: packLigado(p),
        chips
      });
    }
    const ordenar = (l) => l.sort((a, b) => (a.pacote + a.rotulo).localeCompare(b.pacote + b.rotulo, 'pt-BR'));
    return {
      mundo: mundoLigado(),
      grupos: [
        { titulo: 'Sistema Tormenta20', icone: 'fa-dice-d20', itens: ordenar(grupos.sistema) },
        { titulo: 'Módulos', icone: 'fa-puzzle-piece', itens: ordenar(grupos.modulo), dica: 'Desligados até você ligar.' },
        { titulo: 'Compêndios do mundo', icone: 'fa-globe', itens: ordenar(grupos.mundo), dica: 'Desligados até você ligar.' }
      ].filter(g => g.itens.length)
    };
  }

  // Lido do DOM, e não do FormData: o id do compêndio tem pontos
  // ("tormenta20.racas"), e o Foundry transformaria isso em objeto aninhado.
  static async #salvar(event, form) {
    const packs = {};
    // Compêndio que a lista escondeu (sem nada útil) guarda o estado atual.
    for (const p of packsDeItem()) packs[p.collection] = packLigado(p);
    form.querySelectorAll('input[data-pack]').forEach(cb => { packs[cb.dataset.pack] = cb.checked; });
    await salvarFontes(packs, !!form.querySelector('input[name="mundo"]')?.checked);
    ui.notifications.info('Fontes do Assistente de Criação salvas.');
  }

  static #marcar(app, fn) {
    app.element.querySelectorAll('input[data-pack]').forEach(cb => { cb.checked = fn(cb); });
  }

  static #padrao() {
    const padrao = new Set(packsDeItem().filter(packLigadoPorPadrao).map(p => p.collection));
    CriacaoFontesApp.#marcar(this, cb => padrao.has(cb.dataset.pack));
    const mundo = this.element.querySelector('input[name="mundo"]');
    if (mundo) mundo.checked = true;
  }

  static #todos() { CriacaoFontesApp.#marcar(this, () => true); }
  static #nenhum() { CriacaoFontesApp.#marcar(this, () => false); }
}

export function abrirFontesCriacao() {
  if (!game.user.isGM) return;
  new CriacaoFontesApp().render(true);
}
