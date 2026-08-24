/**
 * t20-hayd-tesouros | app-gerador.mjs
 * Janela principal do Gerador de Tesouros: escolher ND, rolar
 * — de uma vez (modo Automático) ou dado por dado (modo Passo a Passo, cada
 * um podendo ser rolado agora, pedido a um jogador ou inserido manualmente)
 * —, revisar os resultados (trocar vínculo, rerolar) e conceder/postar.
 */
import { MODULE_ID, rotuloMoeda } from './constantes.mjs';
import { ORDEM_ND, linhaND, gerarTesouro, resolverColuna, rerolarResultado, aplicarMetadeResultado } from './motor.mjs';
import { rolarDado, rolarFormula } from './utils.mjs';
import { SessaoDeRolagem, sessaoAutomatica } from './sessao.mjs';
import { jogadoresOnline, pedirRolagemAoJogador, capturarRolagemDeJogador } from './rolagem-jogador.mjs';
import { resolverReferencia, definirOverride, tabelaAceitaVinculo } from './vinculo.mjs';
import { concederTesouro, postarCardTesouro, totalDinheiro } from './distribuicao.mjs';
import { concederTesouroEstoque } from './distribuicao-estoque.mjs';
import { distribuirTesouroNaParty } from './distribuicao-party.mjs';
import { postarTrilhaNoChat } from './chat.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

const MEMBER_TYPES = ['character', 'npc', 'simple'];
const LABEL_COLUNA = { dinheiro: 'Dinheiro', itens: 'Itens' };

/* ─── Helpers de visão (transformam a árvore do motor em algo fácil de renderizar) ── */

function badgeVinculo(vinculo) {
  if (!vinculo) return null;
  if (vinculo.status === 'vinculado') return { classe: 't20g-ok', label: loc('T20HaydGMTools.TesourosVinculado') };
  if (vinculo.status === 'ambiguo') return { classe: 't20g-ambiguo', label: loc('T20HaydGMTools.TesourosAmbiguo') };
  return { classe: 't20g-sem', label: loc('T20HaydGMTools.TesourosSemVinculo') };
}

function fonteTexto(livro, pagina) {
  return livro ? `${livro}${pagina ? ` p.${pagina}` : ''}` : null;
}

function visaoItemSimples(node) {
  const vinculavel = tabelaAceitaVinculo(node.tabela);
  return {
    id: node.id, tipoVisual: 'item', nome: node.nome, img: node.vinculo?.img,
    preco: node.preco ?? null, espacos: node.espacos ?? null,
    fonte: fonteTexto(node.livro, node.pagina),
    badge: vinculavel ? badgeVinculo(node.vinculo) : null, vinculavel,
    tabela: node.tabela, chave: node.chave
  };
}

function visaoBuild(node) {
  const lista = node.tipo === 'itemSuperior' ? node.melhorias : node.encantos;
  const vinculavel = tabelaAceitaVinculo(node.item.tabela);
  return {
    id: node.id, tipoVisual: 'build', rotuloBuild: node.tipo === 'itemSuperior' ? 'Superior' : 'Mágico',
    nome: node.item.nome, img: node.item.vinculo?.img, fonte: fonteTexto(node.item.livro, node.item.pagina),
    badge: vinculavel ? badgeVinculo(node.item.vinculo) : null, vinculavel,
    tabela: node.item.tabela, chave: node.item.chave,
    entradas: (lista ?? []).map(e => ({ nome: e.nome, material: e.materialEspecial ? e.material?.nome : null }))
  };
}

function visaoNo(node) {
  if (!node) return null;
  if (node.tipo === 'itemSuperior' || node.tipo === 'itemMagico') return visaoBuild(node);
  if (node.tipo === 'item') return visaoItemSimples(node);
  return null;
}

const ROTULO_GRUPO = { riquezas: 'Riquezas', pocoes: 'Poções' };

function visaoColuna(coluna) {
  return (coluna ?? []).map(entrada => {
    const resultado = entrada.resultado;
    return {
      id: entrada.id,
      rolagem: entrada.trilhaColuna?.[0]?.total ?? null,
      manual: !!entrada.trilhaColuna?.[0]?.manual,
      dinheiro: resultado?.tipo === 'dinheiro' ? {
        valor: resultado.valor, moeda: rotuloMoeda(resultado.moeda),
        metadeAplicada: !!resultado.metadeAplicada
      } : null,
      grupo: resultado?.tipo === 'grupo' ? {
        rotulo: ROTULO_GRUPO[resultado.rotulo] ?? resultado.rotulo, itens: resultado.itens.map(visaoNo)
      } : null,
      no: ['item', 'itemSuperior', 'itemMagico'].includes(resultado?.tipo) ? visaoNo(resultado) : null,
      vazio: !resultado
    };
  });
}

function buscarNo(no, alvoId) {
  if (!no) return null;
  if (no.id === alvoId) return no;
  if (no.itens) for (const it of no.itens) { const r = buscarNo(it, alvoId); if (r) return r; }
  if (no.item) { const r = buscarNo(no.item, alvoId); if (r) return r; }
  return null;
}

function buscarNoTesouro(tesouro, alvoId) {
  if (!tesouro) return null;
  for (const entrada of [...(tesouro.dinheiro ?? []), ...(tesouro.itens ?? [])]) {
    const r = buscarNo(entrada.resultado, alvoId);
    if (r) return r;
  }
  return null;
}

function formatarMoedas(totais) {
  return Object.entries(totais)
    .filter(([, v]) => v > 0)
    .map(([m, v]) => `${v} ${rotuloMoeda(m)}`);
}

/* ─── Diálogo de vínculo manual (candidatos ambíguos + arrastar item) ──── */

async function abrirDialogoVinculo(nome, candidatos = []) {
  const listaCandidatos = candidatos.length ? `
    <div class="form-group">
      <label>${loc('T20HaydGMTools.TesourosVincularCandidatos')}</label>
      <select name="candidato">
        <option value="">—</option>
        ${candidatos.map(c => `<option value="${c.uuid}">${foundry.utils.escapeHTML(c.nome)}</option>`).join('')}
      </select>
    </div>` : '';

  return foundry.applications.api.DialogV2.wait({
    window: { title: loc('T20HaydGMTools.TesourosVincularTitulo', { nome }), icon: 'fa-solid fa-link' },
    position: { width: 420 },
    modal: true,
    content: `
      <div class="t20g-tesouro-vinculo-dialogo">
        ${listaCandidatos}
        <div class="t20g-tesouro-drop" data-drop>
          <i class="fa-solid fa-hand-pointer"></i>
          <p>${loc('T20HaydGMTools.TesourosVincularArraste')}</p>
        </div>
        <input type="hidden" name="uuid" value="" />
      </div>`,
    rejectClose: false,
    buttons: [
      {
        action: 'vincular', label: loc('T20HaydGMTools.TesourosVincular'), icon: 'fa-solid fa-check', default: true,
        callback: (ev, btn) => btn.form.elements.uuid.value || btn.form.elements.candidato?.value || null
      },
      {
        action: 'nenhum', label: loc('T20HaydGMTools.TesourosUsarSemVinculo'), icon: 'fa-solid fa-link-slash',
        callback: () => 'nenhum'
      },
      { action: 'cancelar', label: loc('T20HaydGMTools.TesourosCancelar'), callback: () => null }
    ],
    render: (ev, dialog) => {
      const el = dialog.element;
      const drop = el.querySelector('[data-drop]');
      const input = el.querySelector('input[name="uuid"]');
      const select = el.querySelector('select[name="candidato"]');
      drop.addEventListener('dragover', e => e.preventDefault());
      drop.addEventListener('drop', e => {
        e.preventDefault();
        try {
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          if (data?.type === 'Item' && data.uuid) {
            input.value = data.uuid;
            if (select) select.value = '';
            drop.innerHTML = `<i class="fa-solid fa-check"></i> ${loc('T20HaydGMTools.TesourosVincularSelecionado')}`;
          }
        } catch { /* payload não é um item arrastável */ }
      });
      select?.addEventListener('change', () => { if (select.value) input.value = ''; });
    }
  });
}

/* ─── Diálogo do modo "Passo a Passo": como rolar ESTE dado específico ─── */

async function abrirDialogoPasso(spec) {
  const jogadores = jogadoresOnline();
  const descricaoDado = spec.tipo === 'dado' ? `1d${spec.dado}` : spec.formula;
  const opcoesJogador = jogadores.map(u => `<option value="${u.id}">${foundry.utils.escapeHTML(u.name)}</option>`).join('');

  const resultado = await foundry.applications.api.DialogV2.wait({
    window: { title: loc('T20HaydGMTools.TesourosPassoTitulo'), icon: 'fa-solid fa-dice-d20' },
    position: { width: 420 },
    modal: true,
    content: `
      <div class="t20g-tesouro-passo">
        <p class="t20g-tesouro-passo-rotulo"><strong>${foundry.utils.escapeHTML(spec.rotulo)}</strong></p>
        <p class="t20g-hint">${foundry.utils.escapeHTML(descricaoDado)}</p>
        ${jogadores.length ? `
          <div class="form-group">
            <label>${loc('T20HaydGMTools.TesourosPedirJogadorLabel')}</label>
            <select name="jogador">${opcoesJogador}</select>
          </div>` : ''}
        <div class="form-group">
          <label>${loc('T20HaydGMTools.TesourosInserirLabel')}</label>
          <input type="number" name="valorManual" />
        </div>
      </div>`,
    rejectClose: false,
    buttons: [
      {
        action: 'dado', label: loc('T20HaydGMTools.TesourosRolarDado'), icon: 'fa-solid fa-dice', default: true,
        callback: () => ({ modo: 'dado' })
      },
      ...(jogadores.length ? [{
        action: 'jogador', label: loc('T20HaydGMTools.TesourosPedir'), icon: 'fa-solid fa-user-group',
        callback: (ev, btn) => ({ modo: 'jogador', userId: btn.form.elements.jogador.value })
      }] : []),
      {
        action: 'manual', label: loc('T20HaydGMTools.TesourosUsar'), icon: 'fa-solid fa-hand-pointer',
        callback: (ev, btn) => ({ modo: 'manual', valor: Number(btn.form.elements.valorManual.value) || 0 })
      }
    ]
  }).catch(() => null);

  return resultado ?? { modo: 'dado' }; // fechou sem escolher — rola normal, não trava a geração
}

/* ─── Aplicação principal ───────────────────────────────────────────────── */

export class TesourosGeradorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instancia = null;

  static abrir(opcoes = {}) {
    if (!this.#instancia) this.#instancia = new TesourosGeradorApp();
    if (opcoes.nd) this.#instancia.#nd = String(opcoes.nd);
    // Mutuamente exclusivos: um destino de estoque preselecionado (vindo do
    // botão "Gerar Tesouro" da Ficha do Grupo) substitui um ator preselecionado.
    if (opcoes.estoqueFolderId) {
      this.#instancia.#estoqueFolderId = opcoes.estoqueFolderId;
      this.#instancia.#actorAlvoId = null;
    } else if (opcoes.actorAlvoId) {
      this.#instancia.#actorAlvoId = opcoes.actorAlvoId;
      this.#instancia.#estoqueFolderId = null;
    }
    this.#instancia.render(true);
    return this.#instancia;
  }

  static DEFAULT_OPTIONS = {
    id: 't20g-tesouros-gerador',
    classes: ['t20g-tesouros'],
    window: { title: 'T20HaydGMTools.TesourosGeradorTitulo', icon: 'fa-solid fa-sack-dollar', resizable: true },
    position: { width: 820, height: 780 },
    actions: {
      iniciar: TesourosGeradorApp.#onIniciar,
      limpar: TesourosGeradorApp.#onLimpar,
      colunaRolar: TesourosGeradorApp.#onColunaRolar,
      colunaRerolar: TesourosGeradorApp.#onColunaRerolar,
      colunaRemover: TesourosGeradorApp.#onColunaRemover,
      trocarVinculo: TesourosGeradorApp.#onTrocarVinculo,
      conceder: TesourosGeradorApp.#onConceder,
      distribuir: TesourosGeradorApp.#onDistribuir,
      postar: TesourosGeradorApp.#onPostar,
      metade: TesourosGeradorApp.#onMetade
    }
  };

  static PARTS = { body: { template: `modules/${MODULE_ID}/templates/tesouros/gerador.hbs` } };

  #nd = '1';
  #modoRolagem = 'auto';
  #actorAlvoId = null;
  #estoqueFolderId = null;
  #tesouro = null;
  #ocupado = false;

  #sincronizarFormulario() {
    const el = this.element;
    if (!el) return;
    const nd = el.querySelector('[name="nd"]')?.value;

    const modo = el.querySelector('[name="modoRolagem"]')?.value;
    const destino = el.querySelector('[name="destino"]');
    if (nd) this.#nd = nd;

    if (modo) this.#modoRolagem = modo;
    if (destino) {
      const [tipo, id] = (destino.value || '').split(':');
      this.#estoqueFolderId = tipo === 'stash' ? id : null;
      this.#actorAlvoId = tipo === 'actor' ? id : null;
    }
  }

  /**
   * Cada rolagem (coluna inteira ou reroll de um item) ganha sua própria
   * sessão/trilha. Política padrão (modo "Automático"): o Mestre rola tudo
   * na hora — moedas, tipo de equipamento, quantidade — EXCETO os d100
   * (qual item/melhoria/encanto específico), que ficam esperando a primeira
   * rolagem de um jogador no chat. Modo "Passo a passo": tudo, sem exceção,
   * passa pela mesma escolha (rolar agora / pedir a alguém / manual).
   */
  #criarSessao() {
    const aoEscolher = spec => this.#escolherEntreDados(spec);
    if (this.#modoRolagem === 'passo') {
      return new SessaoDeRolagem({ modo: 'passo', aoPedirPasso: spec => this.#passoInterativo(spec), aoEscolher });
    }
    return new SessaoDeRolagem({
      modo: 'auto',
      aoPedirPasso: spec => (spec.tipo === 'dado' && spec.dado === 100) ? this.#aguardarJogadorD100(spec) : null,
      aoEscolher
    });
  }

  /**
   * Espera a primeira rolagem "pura" de 1d100 de um jogador no chat — o
   * Mestre pode a qualquer momento rolar ele mesmo ou inserir um valor em
   * vez de esperar, e SEMPRE confirma antes de seguir (pode substituir o
   * valor capturado por outro, se quiser).
   */
  async #aguardarJogadorD100(spec) {
    const faces = spec.dado;
    await ChatMessage.create({
      content: `<p><i class="fa-solid fa-dice"></i> ${loc('T20HaydGMTools.TesourosAguardandoChat', { rotulo: spec.rotulo, dado: `1d${faces}` })}</p>`,
      speaker: { alias: loc('T20HaydGMTools.TesourosGeradorTitulo') }
    });

    const escolha = await this.#dialogoEsperaD100(spec, faces);

    if (escolha.tipo === 'euMesmo') {
      const roll = await rolarDado(faces);
      await roll.toMessage({ flavor: spec.rotulo, speaker: ChatMessage.getSpeaker() });
      return roll;
    }
    if (escolha.tipo === 'manual') {
      await ChatMessage.create({
        content: `<p>${foundry.utils.escapeHTML(spec.rotulo)}: <strong>${escolha.valor}</strong> <em>(${loc('T20HaydGMTools.TesourosManualCurto')})</em></p>`,
        speaker: ChatMessage.getSpeaker()
      });
      return { total: escolha.valor, manual: true };
    }

    // tipo === 'captura' — pede confirmação (ou um valor por cima) antes de seguir.
    const confirmar = await this.#confirmarCaptura(spec, escolha);
    if (confirmar.tipo === 'manual') {
      await ChatMessage.create({
        content: `<p>${foundry.utils.escapeHTML(spec.rotulo)}: <strong>${confirmar.valor}</strong> <em>(${loc('T20HaydGMTools.TesourosManualCurto')})</em></p>`,
        speaker: ChatMessage.getSpeaker()
      });
      return { total: confirmar.valor, manual: true };
    }
    return escolha.roll;
  }

  /** Corrida entre "um jogador rolou no chat" e "o Mestre decidiu rolar ele mesmo/inserir manual". */
  #dialogoEsperaD100(spec, faces) {
    return new Promise(resolve => {
      let decidido = false;
      const dialogId = `t20g-espera-${foundry.utils.randomID()}`;

      capturarRolagemDeJogador({ n: 1, faces }).then(captura => {
        if (decidido || !captura) return;
        decidido = true;
        foundry.applications.instances?.get(dialogId)?.close({ animate: false });
        resolve({ tipo: 'captura', roll: captura.roll, autor: captura.autor });
      });

      foundry.applications.api.DialogV2.wait({
        id: dialogId,
        window: { title: loc('T20HaydGMTools.TesourosAguardandoTitulo'), icon: 'fa-solid fa-dice' },
        position: { width: 400 },
        content: `
          <p class="t20g-tesouro-passo-rotulo"><strong>${foundry.utils.escapeHTML(spec.rotulo)}</strong></p>
          <p class="t20g-hint">${loc('T20HaydGMTools.TesourosAguardandoDica', { dado: `1d${faces}` })}</p>
          <div class="form-group">
            <label>${loc('T20HaydGMTools.TesourosInserirLabel')}</label>
            <input type="number" name="valorManual" />
          </div>`,
        rejectClose: false,
        buttons: [
          {
            action: 'euMesmo', label: loc('T20HaydGMTools.TesourosRolarDado'), icon: 'fa-solid fa-dice', default: true,
            callback: () => ({ tipo: 'euMesmo' })
          },
          {
            action: 'manual', label: loc('T20HaydGMTools.TesourosUsar'), icon: 'fa-solid fa-hand-pointer',
            callback: (ev, btn) => ({ tipo: 'manual', valor: Number(btn.form.elements.valorManual.value) || 0 })
          }
        ]
      }).then(resultado => {
        if (decidido) return;
        decidido = true;
        resolve(resultado ?? { tipo: 'euMesmo' });
      }).catch(() => {
        if (decidido) return;
        decidido = true;
        resolve({ tipo: 'euMesmo' });
      });
    });
  }

  /** Mostra o resultado capturado do jogador e deixa o Mestre confirmar ou substituir. */
  async #confirmarCaptura(spec, captura) {
    const resultado = await foundry.applications.api.DialogV2.wait({
      window: { title: loc('T20HaydGMTools.TesourosConfirmarTitulo'), icon: 'fa-solid fa-check-double' },
      position: { width: 400 },
      modal: true,
      content: `
        <p class="t20g-tesouro-passo-rotulo"><strong>${foundry.utils.escapeHTML(spec.rotulo)}</strong></p>
        <p>${loc('T20HaydGMTools.TesourosConfirmarDica', { jogador: foundry.utils.escapeHTML(captura.autor.name), valor: captura.roll.total })}</p>
        <div class="form-group">
          <label>${loc('T20HaydGMTools.TesourosUsarOutro')}</label>
          <input type="number" name="valorManual" placeholder="${captura.roll.total}" />
        </div>`,
      rejectClose: false,
      buttons: [
        {
          action: 'confirmar', label: loc('T20HaydGMTools.TesourosConfirmar'), icon: 'fa-solid fa-check', default: true,
          callback: () => ({ tipo: 'confirmado' })
        },
        {
          action: 'manual', label: loc('T20HaydGMTools.TesourosUsarOutro'), icon: 'fa-solid fa-pen',
          callback: (ev, btn) => {
            const bruto = btn.form.elements.valorManual.value;
            const valor = Number(bruto);
            return bruto !== '' && Number.isFinite(valor) ? { tipo: 'manual', valor } : { tipo: 'confirmado' };
          }
        }
      ]
    }).catch(() => ({ tipo: 'confirmado' }));
    return resultado ?? { tipo: 'confirmado' };
  }

  /** Regra "2D": o Mestre escolhe qual dos dois d6 usar ANTES de saber o que cada um resultaria. */
  async #escolherEntreDados({ rotulo, opcoes }) {
    const resultado = await foundry.applications.api.DialogV2.wait({
      window: { title: loc('T20HaydGMTools.TesourosEscolha2DTitulo'), icon: 'fa-solid fa-dice-two' },
      position: { width: 360 },
      modal: true,
      content: `
        <p class="t20g-tesouro-passo-rotulo"><strong>${foundry.utils.escapeHTML(rotulo)}</strong></p>
        <p class="t20g-hint">${loc('T20HaydGMTools.TesourosEscolha2DDica')}</p>`,
      rejectClose: false,
      buttons: opcoes.map((valor, i) => ({
        action: `opcao${i}`, label: String(valor), icon: 'fa-solid fa-dice-d6', callback: () => valor
      }))
    }).catch(() => null);
    return resultado ?? opcoes[0];
  }

  /** Modo Passo a Passo: decide (e executa) COMO um dado específico da cadeia é rolado. */
  async #passoInterativo(spec) {
    const escolha = await abrirDialogoPasso(spec);
    const formula = spec.tipo === 'dado' ? `1d${spec.dado}` : spec.formula;

    if (escolha.modo === 'jogador') {
      const { roll, cancelado } = await pedirRolagemAoJogador({ userId: escolha.userId, formula, rotulo: spec.rotulo });
      if (cancelado || !roll) {
        ui.notifications.warn(loc('T20HaydGMTools.TesourosRolagemNaoRecebida'));
        return spec.tipo === 'dado' ? rolarDado(spec.dado) : rolarFormula(spec.formula);
      }
      return roll;
    }

    if (escolha.modo === 'manual') {
      const total = escolha.valor;
      await ChatMessage.create({
        content: `<p>${foundry.utils.escapeHTML(spec.rotulo)}: <strong>${total}</strong> <em>(${loc('T20HaydGMTools.TesourosManualCurto')})</em></p>`,
        speaker: ChatMessage.getSpeaker()
      });
      return { total, manual: true };
    }

    // modo 'dado' — o próprio Mestre rola agora. `roll.toMessage()` já cria a
    // mensagem com a rolagem anexada, e o Dice So Nice anima sozinho a partir
    // dela — chamar `game.dice3d.showForRoll` antes tocava a animação 2x.
    const roll = spec.tipo === 'dado' ? await rolarDado(spec.dado) : await rolarFormula(spec.formula);
    await roll.toMessage({ flavor: spec.rotulo, speaker: ChatMessage.getSpeaker() });
    return roll;
  }

  async _prepareContext() {
    this.#sincronizarFormulario();
    const atores = game.actors
      .filter(a => MEMBER_TYPES.includes(a.type))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map(a => ({ id: a.id, name: a.name }));

    // O estoque da party só entra como opção quando veio pré-selecionado
    // (botão "Gerar Tesouro" na Ficha do Grupo) e a pasta ainda existe.
    const estoqueFolder = this.#estoqueFolderId ? game.folders.get(this.#estoqueFolderId) : null;
    const destinos = [
      ...(estoqueFolder
        ? [{ value: `stash:${estoqueFolder.id}`, label: loc('T20HaydGMTools.TesourosEstoqueDaParty', { nome: estoqueFolder.name }) }]
        : []),
      ...atores.map(a => ({ value: `actor:${a.id}`, label: a.name }))
    ];
    const destinoAtual = this.#estoqueFolderId
      ? `stash:${this.#estoqueFolderId}`
      : (this.#actorAlvoId ? `actor:${this.#actorAlvoId}` : '');

    return {
      ordemND: ORDEM_ND, nd: this.#nd, modoRolagem: this.#modoRolagem,
      destinos, destinoAtual, ocupado: this.#ocupado,
      temTesouro: !!this.#tesouro,
      temParty: !!this.#estoqueFolderId,
      totalMoedas: this.#tesouro ? formatarMoedas(totalDinheiro(this.#tesouro)) : [],
      colDinheiroCtx: {
        chave: 'dinheiro', rotulo: loc('T20HaydGMTools.TesourosColunaDinheiro'), icone: 'fa-solid fa-coins',
        lista: this.#tesouro ? visaoColuna(this.#tesouro.dinheiro) : []
      },
      colItensCtx: {
        chave: 'itens', rotulo: loc('T20HaydGMTools.TesourosColunaItens'), icone: 'fa-solid fa-gem',
        lista: this.#tesouro ? visaoColuna(this.#tesouro.itens) : []
      },
    };
  }

  static async #onIniciar() {
    this.#sincronizarFormulario();
    this.#ocupado = true; this.render();
    try {
      this.#tesouro = await gerarTesouro(this.#nd, () => this.#criarSessao());
    } finally {
      this.#ocupado = false;
    }
    this.render();

    if (this.#modoRolagem === 'auto') {
      for (const entrada of [...this.#tesouro.dinheiro, ...this.#tesouro.itens]) {
        await postarTrilhaNoChat(entrada);
      }
    }
  }

  static #onLimpar() {
    this.#sincronizarFormulario();
    this.#tesouro = null;
    this.render();
  }

  static async #onColunaRolar(event, target) {
    this.#sincronizarFormulario();
    const coluna = target.dataset.coluna;
    if (!this.#tesouro) this.#tesouro = { nd: this.#nd, dinheiro: [], itens: [] };
    const faixas = linhaND(this.#nd)?.[coluna];
    if (!faixas) return;

    this.#ocupado = true; this.render();
    const rotulo = `Tabela 8-1 — ND ${this.#nd} — ${LABEL_COLUNA[coluna]}`;
    let entrada;
    try {
      entrada = await resolverColuna(faixas, this.#criarSessao(), rotulo);
    } finally {
      this.#ocupado = false;
    }

    if (entrada) {
      this.#tesouro[coluna].push(entrada);
    } else {
      ui.notifications.info(loc('T20HaydGMTools.TesourosNadaNestaRolagem'));
    }
    this.render();

    if (entrada && this.#modoRolagem === 'auto') await postarTrilhaNoChat(entrada);
  }

  static async #onColunaRerolar(event, target) {
    this.#sincronizarFormulario();
    const { coluna, entradaId } = target.dataset;
    const entrada = this.#tesouro?.[coluna]?.find(e => e.id === entradaId);
    if (!entrada) return;

    this.#ocupado = true; this.render();
    let resultado, trilha;
    try {
      ({ resultado, trilha } = await rerolarResultado(entrada.celula, this.#criarSessao()));
    } finally {
      this.#ocupado = false;
    }
    entrada.resultado = resultado;
    entrada.trilha = trilha;
    this.render();

    if (this.#modoRolagem === 'auto') await postarTrilhaNoChat(entrada, { titulo: loc('T20HaydGMTools.TesourosRerolar') });
  }

  static #onColunaRemover(event, target) {
    this.#sincronizarFormulario();
    const { coluna, entradaId } = target.dataset;
    if (!this.#tesouro) return;
    this.#tesouro[coluna] = this.#tesouro[coluna].filter(e => e.id !== entradaId);
    this.render();
  }

  static async #onTrocarVinculo(event, target) {
    this.#sincronizarFormulario();
    const no = buscarNoTesouro(this.#tesouro, target.dataset.noId);
    const alvo = no?.item ?? no;
    if (!alvo?.tabela) return;

    const resultado = await abrirDialogoVinculo(alvo.nome, alvo.vinculo?.candidatos ?? []);
    if (!resultado) return;

    await definirOverride(alvo.tabela, alvo.chave, resultado);
    alvo.vinculo = await resolverReferencia(alvo.tabela, alvo.chave, alvo.nome, { riqueza: false });
    this.render();
  }

  /**
   * Corta pela metade o valor de UMA entrada (dinheiro ou preço de item).
   * Substitui o antigo modificador "metade", que só sabia cortar o tesouro
   * inteiro: assim o Mestre escolhe exatamente o que reduzir.
   */
  static #onMetade(event, target) {
    const { coluna, entradaId } = target.dataset;
    const entrada = (this.#tesouro?.[coluna] ?? []).find(e => e.id === entradaId);
    if (!entrada) return;
    aplicarMetadeResultado(entrada.resultado);
    this.render();
  }

  static async #onConceder() {
    this.#sincronizarFormulario();
    if (!this.#tesouro) return;

    if (this.#estoqueFolderId) {
      const folder = game.folders.get(this.#estoqueFolderId);
      if (!folder) return ui.notifications.warn(loc('T20HaydGMTools.TesourosEscolhaAlvo'));
      await concederTesouroEstoque(this.#tesouro, this.#estoqueFolderId);
      ui.notifications.info(loc('T20HaydGMTools.TesourosConcedido', { nome: folder.name }));
      return;
    }

    const actor = game.actors.get(this.#actorAlvoId);
    if (!actor) return ui.notifications.warn(loc('T20HaydGMTools.TesourosEscolhaAlvo'));
    await concederTesouro(this.#tesouro, actor);
    ui.notifications.info(loc('T20HaydGMTools.TesourosConcedido', { nome: actor.name }));
  }

  static async #onDistribuir() {
    this.#sincronizarFormulario();
    if (!this.#tesouro) return;
    if (!this.#estoqueFolderId) {
      ui.notifications.warn(loc('T20HaydGMTools.TesourosDistribuirSemParty'));
      return;
    }
    const distribuiu = await distribuirTesouroNaParty(this.#tesouro, this.#estoqueFolderId);
    if (distribuiu) ui.notifications.info(loc('T20HaydGMTools.TesourosDistribuido'));
  }

  static async #onPostar() {
    this.#sincronizarFormulario();
    if (!this.#tesouro) return;
    const destinatario = this.#estoqueFolderId
      ? game.folders.get(this.#estoqueFolderId)?.name ?? null
      : game.actors.get(this.#actorAlvoId)?.name ?? null;
    await postarCardTesouro(this.#tesouro, { titulo: loc('T20HaydGMTools.TesourosCardTitulo'), destinatario });
  }
}

export function abrirGeradorTesouros(opcoes = {}) {
  return TesourosGeradorApp.abrir(opcoes);
}
