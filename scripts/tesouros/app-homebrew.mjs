/**
 * t20-hayd-tesouros | app-homebrew.mjs
 * Editor de homebrew por tabela: adiciona entradas customizadas em qualquer
 * tabela genérica (ou faixa de riqueza), estendendo o dado (ex.: d100 →
 * d101) sempre que necessário para caber a entrada nova.
 */
import { MODULE_ID } from './constantes.mjs';
import { tabelasHomebrewaveis, labelTabela, dadoOficialTabela, FAIXAS_VALOR_RIQUEZA } from './tabelas.mjs';
import { obterHomebrewTabela, adicionarEntradaHomebrew, removerEntradaHomebrew } from './homebrew.mjs';
import { slugify } from './utils.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

function rotuloTabelaSelect(tabelaId) {
  if (tabelaId.startsWith('riqueza-')) {
    const faixaId = Number(tabelaId.slice('riqueza-'.length));
    const faixa = FAIXAS_VALOR_RIQUEZA.find(f => f.id === faixaId);
    return loc('T20HaydGMTools.TesourosRiquezaFaixa', { id: faixaId, formula: faixa?.formula ?? '?', base: faixa?.base ?? '?' });
  }
  return labelTabela(tabelaId);
}

export class TesourosHomebrewApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instancia = null;

  static abrir() {
    if (!this.#instancia) this.#instancia = new TesourosHomebrewApp();
    this.#instancia.render(true);
    return this.#instancia;
  }

  static DEFAULT_OPTIONS = {
    id: 't20g-tesouros-homebrew',
    classes: ['t20g-tesouros'],
    window: { title: 'T20HaydGMTools.TesourosHomebrewTitulo', icon: 'fa-solid fa-wand-magic-sparkles', resizable: true },
    position: { width: 560, height: 640 },
    actions: {
      adicionar: TesourosHomebrewApp.#onAdicionar,
      remover: TesourosHomebrewApp.#onRemover
    }
  };

  static PARTS = { body: { template: `modules/${MODULE_ID}/templates/tesouros/homebrew.hbs` } };

  #tabelaId = tabelasHomebrewaveis()[0];

  #sincronizar() {
    const sel = this.element?.querySelector('[name="tabela"]');
    if (sel?.value) this.#tabelaId = sel.value;
  }

  async _prepareContext() {
    this.#sincronizar();
    const tabelas = tabelasHomebrewaveis().map(id => ({ id, label: rotuloTabelaSelect(id) }));
    const dadoOficial = dadoOficialTabela(this.#tabelaId);
    const hb = obterHomebrewTabela(this.#tabelaId);

    return {
      tabelas, tabelaId: this.#tabelaId, dadoOficial,
      dadoAtual: Math.max(dadoOficial, hb.dadoMax ?? 0),
      entradas: hb.entradas.map((e, indice) => ({
        indice, nome: e.nome, faixa: e.min === e.max ? String(e.min) : `${e.min}-${e.max}`,
        fonte: e.livro ? `${e.livro}${e.pagina ? ` p.${e.pagina}` : ''}` : null
      }))
    };
  }

  /**
   * A troca de tabela escuta , não : o dispatcher de
   * ações do ApplicationV2 roda no clique, então abrir o dropdown já
   * disparava o re-render e fechava a lista antes de dar para escolher.
   */
  /**
   * A troca de tabela escuta "change", e não `data-action`: o dispatcher de
   * ações do ApplicationV2 roda no CLIQUE, então abrir o dropdown já disparava
   * o re-render e fechava a lista antes de dar para escolher a tabela.
   */
  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelector('[name="tabela"]')?.addEventListener('change', () => {
      this.#sincronizar();
      this.render();
    });
  }

  static async #onAdicionar() {
    this.#sincronizar();
    const form = this.element;
    const campoNome = form.querySelector('[name="novoNome"]');
    const nome = campoNome?.value?.trim();
    if (!nome) return ui.notifications.warn(loc('T20HaydGMTools.TesourosHomebrewNomeObrigatorio'));

    const livro = form.querySelector('[name="novoLivro"]')?.value?.trim() || null;
    const paginaTxt = form.querySelector('[name="novaPagina"]')?.value?.trim();
    const pagina = paginaTxt ? Number(paginaTxt) : null;

    await adicionarEntradaHomebrew(this.#tabelaId, dadoOficialTabela(this.#tabelaId), {
      chave: slugify(nome), nome, livro, pagina
    });

    campoNome.value = '';
    form.querySelector('[name="novoLivro"]').value = '';
    form.querySelector('[name="novaPagina"]').value = '';
    this.render();
  }

  static async #onRemover(event, target) {
    this.#sincronizar();
    await removerEntradaHomebrew(this.#tabelaId, Number(target.dataset.indice));
    this.render();
  }
}

export function abrirHomebrewTesouros() {
  return TesourosHomebrewApp.abrir();
}
