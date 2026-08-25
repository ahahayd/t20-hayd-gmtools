/**
 * t20-hayd-tesouros | app-livros.mjs
 * Quais livros-fonte entram nas rolagens de tesouro.
 *
 * Além das caixas de marcação, mostra quantas entradas cada livro traz e
 * avisa quando desligar um deles esvaziaria alguma tabela — caso em que o
 * filtro é ignorado naquela tabela (ver `entradasResolvidas`).
 */
import { MODULE_ID, LIVROS } from './constantes.mjs';
import { obterLivros, definirLivro, habilitarTodosOsLivros } from './livros.mjs';
import { TABELAS, labelTabela } from './tabelas.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Quantas entradas oficiais cada livro traz, somando todas as tabelas. */
function contarPorLivro() {
  const contagem = Object.fromEntries(LIVROS.map(l => [l, 0]));
  for (const tabela of Object.values(TABELAS)) {
    for (const e of tabela.entradas ?? []) {
      if (e.livro && contagem[e.livro] !== undefined) contagem[e.livro]++;
    }
  }
  return contagem;
}

/**
 * Tabelas que ficariam sem nenhuma entrada se `livro` fosse desligado, dado o
 * que já está desligado agora. É o aviso que evita a surpresa de ver o filtro
 * ser ignorado silenciosamente numa tabela.
 */
function tabelasQueEsvaziam(livro, cfg) {
  const vazias = [];
  for (const [id, tabela] of Object.entries(TABELAS)) {
    const restantes = (tabela.entradas ?? []).filter(e => {
      if (!e.livro) return true;
      if (e.livro === livro) return false;
      return cfg[e.livro] ?? true;
    });
    if (!restantes.length && (tabela.entradas ?? []).length) vazias.push(labelTabela(id));
  }
  return vazias;
}

export class TesourosLivrosApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instancia = null;

  static abrir() {
    if (!this.#instancia) this.#instancia = new TesourosLivrosApp();
    this.#instancia.render(true);
    return this.#instancia;
  }

  static DEFAULT_OPTIONS = {
    id: 't20g-tesouros-livros',
    classes: ['t20g-tesouros'],
    window: { title: 'T20HaydGMTools.TesourosLivrosTitulo', icon: 'fa-solid fa-book', resizable: true },
    position: { width: 480, height: 420 },
    actions: { habilitarTodos: TesourosLivrosApp.#onHabilitarTodos }
  };

  static PARTS = { body: { template: `modules/${MODULE_ID}/templates/tesouros/livros.hbs` } };

  async _prepareContext() {
    const cfg = obterLivros();
    const contagem = contarPorLivro();
    return {
      livros: LIVROS.map(livro => {
        const habilitado = cfg[livro] !== false;
        const esvazia = habilitado ? tabelasQueEsvaziam(livro, cfg) : [];
        return {
          livro,
          habilitado,
          entradas: contagem[livro] ?? 0,
          aviso: esvazia.length ? loc('T20HaydGMTools.TesourosLivroEsvazia', { tabelas: esvazia.join(', ') }) : null
        };
      })
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    // `change` e não `data-action`: no ApplicationV2 a ação dispara no clique,
    // e clicar numa caixa de marcação já é um clique — o re-render chegaria
    // antes de o navegador registrar o novo estado.
    for (const campo of this.element.querySelectorAll('input[data-livro]')) {
      campo.addEventListener('change', async () => {
        await definirLivro(campo.dataset.livro, campo.checked);
        this.render();
      });
    }
  }

  static async #onHabilitarTodos() {
    await habilitarTodosOsLivros();
    this.render();
  }
}

export function abrirLivrosTesouros() {
  return TesourosLivrosApp.abrir();
}
