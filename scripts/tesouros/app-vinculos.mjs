/**
 * t20-hayd-tesouros | app-vinculos.mjs
 * Auditoria de vínculos: lista, por tabela, os itens sem vínculo, ambíguos
 * (o Mestre escolhe) e vinculados — com arrastar-e-soltar para vincular
 * manualmente qualquer entrada a um item do mundo/compêndio.
 */
import { MODULE_ID } from './constantes.mjs';
import { TABELAS, labelTabela } from './tabelas.mjs';
import { auditarTudo, definirOverride, limparOverride, tabelaAceitaVinculo, resetarVinculos } from './vinculo.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

const STATUS = {
  'vinculado': { classe: 't20g-ok', label: 'T20HaydGMTools.TesourosVinculado' },
  'vinculado-manual': { classe: 't20g-ok', label: 'T20HaydGMTools.TesourosVinculadoManual' },
  'ambiguo': { classe: 't20g-ambiguo', label: 'T20HaydGMTools.TesourosAmbiguo' },
  'sem-vinculo': { classe: 't20g-sem', label: 'T20HaydGMTools.TesourosSemVinculo' },
  'sem-vinculo-forcado': { classe: 't20g-sem', label: 'T20HaydGMTools.TesourosSemVinculoForcado' }
};

/** "Pendentes" e "Vinculado" são baldes que juntam mais de um status bruto. */
function statusBate(filtro, status) {
  switch (filtro) {
    case 'todos': return true;
    case 'pendentes': return status === 'ambiguo' || status === 'sem-vinculo';
    case 'vinculado': return status === 'vinculado' || status === 'vinculado-manual';
    default: return status === filtro;
  }
}

export class TesourosVinculosApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instancia = null;

  static abrir() {
    if (!this.#instancia) this.#instancia = new TesourosVinculosApp();
    this.#instancia.render(true);
    return this.#instancia;
  }

  static DEFAULT_OPTIONS = {
    id: 't20g-tesouros-vinculos',
    classes: ['t20g-tesouros'],
    window: { title: 'T20HaydGMTools.TesourosVinculosTitulo', icon: 'fa-solid fa-link', resizable: true },
    position: { width: 720, height: 800 },
    actions: {
      filtrar: TesourosVinculosApp.#onFiltrar,
      usarCandidato: TesourosVinculosApp.#onUsarCandidato,
      usarSemVinculo: TesourosVinculosApp.#onUsarSemVinculo,
      limparOverride: TesourosVinculosApp.#onLimparOverride,
      abrirItem: TesourosVinculosApp.#onAbrirItem,
      resetarVinculos: TesourosVinculosApp.#onResetarVinculos
    }
  };

  static PARTS = { body: { template: `modules/${MODULE_ID}/templates/tesouros/vinculos.hbs` } };

  #tabelaFiltro = 'todas';
  #statusFiltro = 'pendentes';
  #linhas = [];

  #sincronizarFiltros() {
    const el = this.element;
    if (!el) return;
    this.#tabelaFiltro = el.querySelector('[name="filtroTabela"]')?.value ?? this.#tabelaFiltro;
    this.#statusFiltro = el.querySelector('[name="filtroStatus"]')?.value ?? this.#statusFiltro;
  }

  async _prepareContext() {
    this.#sincronizarFiltros();
    const auditoria = await auditarTudo();
    // Riquezas nunca entram aqui — não têm item de compêndio possível (ver
    // `tabelaAceitaVinculo`); cada uma vira um item `tesouro` na hora de gerar.
    this.#linhas = [];
    for (const linhas of Object.values(auditoria)) {
      for (const linha of linhas) {
        this.#linhas.push({ ...linha, tabelaLabel: labelTabela(linha.tabelaId) });
      }
    }

    const filtradas = this.#linhas.filter(l =>
      (this.#tabelaFiltro === 'todas' || l.tabelaId === this.#tabelaFiltro) &&
      statusBate(this.#statusFiltro, l.status)
    );

    const linhasVisao = filtradas.map(l => ({
      tabelaId: l.tabelaId, chave: l.chave, nome: l.nome, tabelaLabel: l.tabelaLabel,
      fonte: l.livro ? `${l.livro}${l.pagina ? ` p.${l.pagina}` : ''}` : null,
      status: STATUS[l.status]?.classe ?? 't20g-sem',
      statusLabel: loc(STATUS[l.status]?.label ?? 'T20HaydGMTools.TesourosSemVinculo'),
      ambiguo: l.status === 'ambiguo',
      // Uuid do item de fato vinculado, para abrir a ficha pelo nome. Vínculo
      // manual guarda o uuid no override; o automático, no primeiro candidato.
      uuid: l.status === 'vinculado-manual' ? l.override
        : (l.status === 'vinculado' ? l.candidatos?.[0]?.uuid ?? null : null),
      candidatos: l.candidatos?.map(c => ({ uuid: c.uuid, nome: c.nome })) ?? [],
      temOverride: !!l.override
    }));

    const tabelasOpcoes = [
      { id: 'todas', label: loc('T20HaydGMTools.TesourosTodasTabelas') },
      ...Object.keys(TABELAS).filter(tabelaAceitaVinculo).map(id => ({ id, label: labelTabela(id) }))
    ];

    return {
      tabelasOpcoes, tabelaFiltro: this.#tabelaFiltro, statusFiltro: this.#statusFiltro,
      linhas: linhasVisao,
      totais: {
        semVinculo: this.#linhas.filter(l => l.status === 'sem-vinculo').length,
        ambiguo: this.#linhas.filter(l => l.status === 'ambiguo').length,
        vinculado: this.#linhas.filter(l => l.status === 'vinculado' || l.status === 'vinculado-manual').length
      }
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelectorAll('[data-drop]').forEach(drop => {
      drop.addEventListener('dragover', e => e.preventDefault());
      drop.addEventListener('drop', async e => {
        e.preventDefault();
        try {
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          if (data?.type !== 'Item' || !data.uuid) return;
          const { tabela, chave } = drop.dataset;
          await definirOverride(tabela, chave, data.uuid);
          this.render();
        } catch { /* payload não é um item arrastável */ }
      });
    });
  }

  static #onFiltrar() {
    this.#sincronizarFiltros();
    this.render();
  }

  static async #onUsarCandidato(event, target) {
    this.#sincronizarFiltros();
    const linha = target.closest('[data-tabela]');
    const select = linha?.querySelector('select[name="candidato"]');
    const uuid = select?.value;
    if (!uuid) return;
    await definirOverride(linha.dataset.tabela, linha.dataset.chave, uuid);
    this.render();
  }

  static async #onUsarSemVinculo(event, target) {
    this.#sincronizarFiltros();
    const linha = target.closest('[data-tabela]');
    await definirOverride(linha.dataset.tabela, linha.dataset.chave, 'nenhum');
    this.render();
  }

  /**
   * Apaga todos os vínculos manuais e refaz a busca do zero.
   *
   * Confirma antes porque não dá para desfazer, e avisa que demora: a
   * reconstrução varre o índice inteiro de compêndios.
   */
  static async #onResetarVinculos() {
    this.#sincronizarFiltros();

    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: loc('T20HaydGMTools.TesourosResetarVinculos'), icon: 'fa-solid fa-arrows-rotate' },
      content: `<p>${loc('T20HaydGMTools.TesourosResetarVinculosAviso')}</p>`,
      rejectClose: false
    });
    if (!ok) return;

    ui.notifications.info(loc('T20HaydGMTools.TesourosResetandoVinculos'));
    await resetarVinculos();
    this.render();
    ui.notifications.info(loc('T20HaydGMTools.TesourosVinculosResetados'));
  }

  /** Abre a ficha do item vinculado (só existe onde há vínculo válido). */
  static async #onAbrirItem(event, target) {
    const doc = await fromUuid(target.dataset.uuid).catch(() => null);
    if (!doc) return ui.notifications.warn(loc('T20HaydGMTools.TesourosItemSumiu'));
    doc.sheet.render(true);
  }

  static async #onLimparOverride(event, target) {
    this.#sincronizarFiltros();
    const linha = target.closest('[data-tabela]');
    await limparOverride(linha.dataset.tabela, linha.dataset.chave);
    this.render();
  }
}

export function abrirVinculosTesouros() {
  return TesourosVinculosApp.abrir();
}
