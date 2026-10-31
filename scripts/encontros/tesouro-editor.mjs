/**
 * t20-hayd-gmtools | encontros/tesouro-editor.mjs
 * Janela "Tesouro do encontro": dinheiro editável por moeda, itens um a um
 * (remover, arrastar novos, item avulso) e o histórico das rolagens com cada
 * dado que saiu. Edita o objeto de tesouro da calculadora no lugar.
 */
import { MODULE_ID, MOEDAS, rotuloMoeda } from '../tesouros/constantes.mjs';
import { itemManual, textoMoedas } from './tesouro-encontro.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class TesouroEncontroApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 't20g-tesouro-encontro',
    classes: ['t20g-chefe', 't20g-tesouro-enc'],
    window: { title: 'THM.EncounterTreasureSummary', icon: 'fa-solid fa-sack-dollar', resizable: true },
    position: { width: 560, height: 680 },
    actions: {
      removerItem: TesouroEncontroApp.#onRemoverItem,
      itemAvulso: TesouroEncontroApp.#onItemAvulso
    }
  };

  static PARTS = { body: { template: `modules/${MODULE_ID}/templates/encontros/tesouro.hbs` } };

  #t;
  #aoMudar;
  #rolagem = 0;

  constructor(tesouro, aoMudar) {
    super();
    this.#t = tesouro;
    this.#aoMudar = aoMudar;
  }

  /** Reaponta para o tesouro atual (a janela é reaproveitada entre aberturas). */
  usar(tesouro, aoMudar) {
    this.#t = tesouro;
    this.#aoMudar = aoMudar;
  }

  async _prepareContext() {
    const t = this.#t;
    return {
      moedas: MOEDAS.map(m => ({ id: m, rotulo: rotuloMoeda(m), valor: t.moedas[m] ?? 0 })),
      total: textoMoedas(t.moedas),
      itens: t.itens,
      rolagens: [...t.rolagens].reverse().map(r => ({
        ...r,
        passos: r.passos.map(p => ({ ...p, temAjuste: p.ajustado !== null && p.ajustado !== undefined }))
      }))
    };
  }

  async _preRender(context, options) {
    await super._preRender?.(context, options);
    this.#rolagem = this.element?.querySelector('[data-rola]')?.scrollTop ?? 0;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const el = this.element;
    const r = el.querySelector('[data-rola]');
    if (r) r.scrollTop = this.#rolagem;
    // Moedas gravam a cada mudança sem redesenhar (não perde o foco).
    for (const inp of el.querySelectorAll('input[data-moeda]')) {
      inp.addEventListener('change', () => {
        this.#t.moedas[inp.dataset.moeda] = Math.max(0, Math.floor(Number(inp.value) || 0));
        el.querySelector('[data-total]').textContent = textoMoedas(this.#t.moedas) || 'nenhum';
        this.#aoMudar?.();
      });
    }
    el.querySelector('[name="avulso"]')?.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); TesouroEncontroApp.#onItemAvulso.call(this); }
    });
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.element.addEventListener('dragover', ev => ev.preventDefault());
    this.element.addEventListener('drop', async ev => {
      ev.preventDefault();
      const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
      const dados = TE.getDragEventData(ev);
      if (dados?.type !== 'Item') return;
      const doc = await fromUuid(dados.uuid);
      if (!doc) return;
      this.#t.itens.push(itemManual({ doc }));
      this.#aoMudar?.();
      this.render();
    });
  }

  static #onRemoverItem(ev, alvo) {
    this.#t.itens = this.#t.itens.filter(i => i.id !== alvo.dataset.id);
    this.#aoMudar?.();
    this.render();
  }

  static #onItemAvulso() {
    const campo = this.element.querySelector('[name="avulso"]');
    const nome = campo?.value.trim();
    if (!nome) return;
    this.#t.itens.push(itemManual({ nome }));
    this.#aoMudar?.();
    this.render();
  }
}

let instancia = null;

export function abrirTesouroEncontro(tesouro, aoMudar) {
  if (!instancia) instancia = new TesouroEncontroApp(tesouro, aoMudar);
  else instancia.usar(tesouro, aoMudar);
  instancia.render(true);
  return instancia;
}

/** A calculadora chama isto depois de rolar/limpar, para a janela acompanhar. */
export function atualizarTesouroEncontro(tesouro) {
  if (!instancia?.rendered) return;
  instancia.usar(tesouro, null);
  instancia.render();
}
