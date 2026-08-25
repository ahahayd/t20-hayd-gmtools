/**
 * t20-hayd-tesouros | app-homebrew.mjs
 * Editor de homebrew por tabela: adiciona entradas customizadas em qualquer
 * tabela genérica (ou faixa de riqueza), estendendo o dado (ex.: d100 →
 * d101) sempre que necessário para caber a entrada nova.
 */
import { MODULE_ID } from './constantes.mjs';
import {
  tabelasHomebrewaveis, labelTabela, dadoOficialTabela, FAIXAS_VALOR_RIQUEZA,
  entradasOficiaisComOverride, dadoResolvido
} from './tabelas.mjs';
import {
  obterHomebrewTabela, adicionarEntradaHomebrew, removerEntradaHomebrew,
  definirOverrideOficial, restaurarPadraoTabela, restaurarPadraoTudo
} from './homebrew.mjs';
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
      remover: TesourosHomebrewApp.#onRemover,
      alternarOficial: TesourosHomebrewApp.#onAlternarOficial,
      restaurarTabela: TesourosHomebrewApp.#onRestaurarTabela,
      restaurarTudo: TesourosHomebrewApp.#onRestaurarTudo
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

    const faixaTexto = f => (f ? (f.min === f.max ? String(f.min) : `${f.min}-${f.max}`) : null);
    const oficiais = entradasOficiaisComOverride(this.#tabelaId);
    const emJogo = oficiais.filter(e => e.faixaEfetiva).length;

    return {
      tabelas, tabelaId: this.#tabelaId, dadoOficial,
      // O dado REAL da rolagem, já com livros e redistribuição — não a soma
      // otimista de oficial + homebrew.
      dadoAtual: dadoResolvido(this.#tabelaId),
      emJogo, totalOficiais: oficiais.length,
      entradas: hb.entradas.map((e, indice) => ({
        indice, nome: e.nome, faixa: faixaTexto(e),
        fonte: e.livro ? `${e.livro}${e.pagina ? ` p.${e.pagina}` : ''}` : null
      })),
      // Entradas do livro, com o que o Mestre customizou e a faixa EFETIVA —
      // é o que permite ver como a tabela fica com só um livro ligado.
      oficiais: oficiais.map((e) => ({
        chave: e.chave,
        // Faixa em jogo; quem está fora mostra a de origem, apagada.
        faixa: faixaTexto(e.faixaEfetiva) ?? faixaTexto(e),
        emJogo: !!e.faixaEfetiva,
        foraPorLivro: e.foraPorLivro,
        nome: e.nomeExibido,
        original: e.nome,
        renomeada: !!e.override?.nome,
        removida: e.removida,
        livro: e.livro ?? null,
        fonte: e.livro ? `${e.livro}${e.pagina ? ` p.${e.pagina}` : ''}` : null
      }))
    };
  }

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
    // Mesma razão nos campos de renomear entrada oficial.
    for (const campo of this.element.querySelectorAll('input[data-chave]')) {
      campo.addEventListener('change', () => TesourosHomebrewApp.#onRenomearOficial.call(this, null, campo));
    }
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

  /** Tira (ou devolve) uma entrada oficial do sorteio. */
  static async #onAlternarOficial(event, target) {
    this.#sincronizar();
    const { chave, removida } = target.dataset;
    const atual = entradasOficiaisComOverride(this.#tabelaId).find((e) => e.chave === chave);
    if (!atual) return;

    // Devolver ao sorteio preserva um nome customizado, se houver.
    const novo = removida === 'true'
      ? (atual.override?.nome ? { nome: atual.override.nome } : null)
      : { ...(atual.override ?? {}), removida: true };

    await definirOverrideOficial(this.#tabelaId, chave, novo);
    this.render();
  }

  /** Renomeia uma entrada oficial (campo vazio volta ao nome do livro). */
  static async #onRenomearOficial(event, target) {
    this.#sincronizar();
    const chave = target.dataset.chave;
    const campo = this.element.querySelector(`[name="nome-${chave}"]`);
    const atual = entradasOficiaisComOverride(this.#tabelaId).find((e) => e.chave === chave);
    if (!campo || !atual) return;

    const nome = campo.value.trim();
    const igualAoLivro = !nome || nome === atual.nome;
    const novo = igualAoLivro
      ? (atual.removida ? { removida: true } : null)
      : { ...(atual.override ?? {}), nome };

    await definirOverrideOficial(this.#tabelaId, chave, novo);
    this.render();
  }

  static async #onRestaurarTabela() {
    this.#sincronizar();
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: loc('T20HaydGMTools.TesourosRestaurarTabela') },
      content: `<p>${loc('T20HaydGMTools.TesourosRestaurarTabelaAviso')}</p>`,
      rejectClose: false
    });
    if (!ok) return;
    await restaurarPadraoTabela(this.#tabelaId);
    this.render();
  }

  static async #onRestaurarTudo() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: loc('T20HaydGMTools.TesourosRestaurarTudo') },
      content: `<p>${loc('T20HaydGMTools.TesourosRestaurarTudoAviso')}</p>`,
      rejectClose: false
    });
    if (!ok) return;
    await restaurarPadraoTudo();
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
