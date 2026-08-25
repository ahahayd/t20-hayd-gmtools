/**
 * t20-hayd-tesouros | app-gerador.mjs
 * Janela principal do Gerador de Tesouros: escolher ND, rolar
 * — de uma vez (Rápido/Automático) ou dado por dado (modo Passo a Passo, cada
 * um podendo ser rolado agora, pedido a um jogador ou inserido manualmente)
 * — e distribuir na metade de baixo: uma coluna por destino, com os itens
 * arrastáveis entre elas e as moedas ajustáveis por pessoa.
 */
import { MODULE_ID, rotuloMoeda, MOEDAS as MOEDAS_CHAVES } from './constantes.mjs';
import { ORDEM_ND, linhaND, gerarTesouro, resolverColuna, rerolarResultado, alternarMetadeResultado } from './motor.mjs';
import { rolarDado, rolarFormula, analisarFormula } from './utils.mjs';
import { SessaoDeRolagem, sessaoAutomatica, RolagemCancelada } from './sessao.mjs';
import { jogadoresOnline, pedirRolagemAoJogador, capturarRolagemDeJogador } from './rolagem-jogador.mjs';
import { resolverReferencia, definirOverride, tabelaAceitaVinculo } from './vinculo.mjs';
import {
  postarCardTesouro, totalDinheiro, itensGerados, materializarItem, finalizarPosCriacao
} from './distribuicao.mjs';
import { getPartyMembers, getPartyFolderIds, stashAddItem, stashAddMoney } from '../../t20-hayd-management.mjs';
import { postarTrilhaNoChat } from './chat.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

const ID_ESTOQUE = 'stash';

function nomeDoNode(node) {
  if (node.tipo === 'itemSuperior') return `${node.item.nome} (Superior)`;
  if (node.tipo === 'itemMagico') return `${node.item.nome} (Mágico)`;
  return node.nome;
}

function imgDoNode(node) {
  return (node.tipo === 'itemSuperior' || node.tipo === 'itemMagico'
    ? node.item.vinculo?.img
    : node.vinculo?.img) ?? 'icons/svg/chest.svg';
}
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

/**
 * Trilha de rolagens de uma entrada, em uma linha por dado, para o tooltip.
 * Reaproveita o que o motor já registrou — nada é rolado de novo. A ordem é a
 * mesma do card de chat: primeiro o d% que escolheu a célula da tabela, depois
 * tudo que aconteceu dentro dela.
 */
function textoTrilha(entrada) {
  const passos = [...(entrada?.trilhaColuna ?? []), ...(entrada?.trilha ?? [])];
  if (!passos.length) return null;
  // O Foundry injeta `data-tooltip` como HTML (TooltipManager), então a quebra
  // de linha é <br> e o que vem dos dados precisa ser escapado.
  const esc = t => foundry.utils.escapeHTML(String(t ?? ''));
  return passos
    .map(p => {
      const total = p.ajustado != null ? `${esc(p.total)} → <b>${esc(p.ajustado)}</b> (+20%)` : `<b>${esc(p.total)}</b>`;
      const manual = p.manual ? ` (${esc(loc('T20HaydGMTools.TesourosManualCurto'))})` : '';
      return `${esc(p.rotulo)} (${esc(p.formula)}): ${total}${manual}`;
    })
    .join('<br>');
}

function visaoColuna(coluna) {
  return (coluna ?? []).map(entrada => {
    const resultado = entrada.resultado;
    return {
      id: entrada.id,
      trilha: textoTrilha(entrada),
      rolagem: entrada.trilhaColuna?.[0]?.total ?? null,
      manual: !!entrada.trilhaColuna?.[0]?.manual,
      dinheiro: resultado?.tipo === 'dinheiro' ? {
        valor: resultado.valor, moeda: rotuloMoeda(resultado.moeda),
        metadeAplicada: !!resultado.metadeAplicada,
        // Valor antes do corte — o marcador mostra de onde veio, e a moeda
        // pode ter mudado (7 TO cortado vira 35 T$, não 3 TO).
        original: resultado.metadeOriginal
          ? `${resultado.metadeOriginal.valor} ${rotuloMoeda(resultado.metadeOriginal.moeda)}`
          : null
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
    // NÃO é modal de propósito: o Mestre precisa mexer em outras janelas
    // enquanto esta está aberta — buscar o item no Quick Insert, num compêndio
    // ou na barra lateral — para arrastar até a área de soltar aqui dentro.
    modal: false,
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

async function abrirDialogoPasso(spec, { aoAbrir } = {}) {
  const jogadores = jogadoresOnline();
  const descricaoDado = spec.tipo === 'dado' ? `1d${spec.dado}` : spec.formula;

  /**
   * Faixa do que o Mestre digita à mão. Ele informa o que SAIU NOS DADOS, não
   * o total: em "3d8x100" digita 10, e o módulo multiplica. Digitar 1000 era
   * confuso e não dava para validar contra a fórmula.
   */
  const analise = spec.tipo === 'dado'
    ? { dados: `1d${spec.dado}`, min: 1, max: spec.dado, multiplicador: 1 }
    : analisarFormula(spec.formula);
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
          <label>${analise
            ? loc('T20HaydGMTools.TesourosInserirDados', { dados: analise.dados, min: analise.min, max: analise.max })
            : loc('T20HaydGMTools.TesourosInserirLabel')}</label>
          <input type="number" name="valorManual"
            ${analise ? `min="${analise.min}" max="${analise.max}" step="1"` : ''} />
          ${analise && analise.multiplicador > 1
            ? `<p class="t20g-hint">${loc('T20HaydGMTools.TesourosInserirMultiplicador', { mult: analise.multiplicador })}</p>`
            : ''}
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
        callback: (ev, btn) => {
          const bruto = btn.form.elements.valorManual.value.trim();
          if (bruto === '') return { modo: 'cancelado' };
          const digitado = Number(bruto);
          if (!Number.isFinite(digitado)) return { modo: 'cancelado' };
          if (!analise) return { modo: 'manual', valor: digitado };
          // Fora da faixa da fórmula, prende no limite: quem digita 99 num 3d8
          // quer o máximo, não um resultado impossível.
          const nosDados = Math.clamp(Math.round(digitado), analise.min, analise.max);
          return { modo: 'manual', valor: nosDados * analise.multiplicador };
        }
      }
    ],
    render: (ev, dialog) => {
      aoAbrir?.(dialog);
      const el = dialog.element;
      const campo = el.querySelector('[name="valorManual"]');
      const botao = el.querySelector('[data-action="manual"]');
      if (!campo || !botao) return;
      // "Usar" só faz sentido com um valor digitado; vazio, o clique só
      // fechava a janela sem inserir nada.
      const sincronizar = () => { botao.disabled = campo.value.trim() === ''; };
      campo.addEventListener('input', sincronizar);
      sincronizar();
    }
  }).catch(() => null);

  // Fechar a janela é desistir da geração — antes rolava sozinho e a cadeia
  // seguia, que era o oposto do que o Mestre pediu ao fechar.
  return resultado ?? { modo: 'cancelado' };
}

/* ─── Aplicação principal ───────────────────────────────────────────────── */

export class TesourosGeradorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instancia = null;

  static abrir(opcoes = {}) {
    if (!this.#instancia) this.#instancia = new TesourosGeradorApp();
    if (opcoes.nd) this.#instancia.#nd = String(opcoes.nd);
    // Vindo do botão "Gerar Tesouro" da Ficha do Grupo: já abre com aquele
    // grupo selecionado como escopo da distribuição.
    if (opcoes.estoqueFolderId) {
      this.#instancia.#estoqueFolderId = opcoes.estoqueFolderId;
      this.#instancia.#escopo = opcoes.estoqueFolderId;
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
      dividirIgual: TesourosGeradorApp.#onDividirIgual,
      zerarMoedas: TesourosGeradorApp.#onZerarMoedas,
      removerExtra: TesourosGeradorApp.#onRemoverExtra,
      removerAtor: TesourosGeradorApp.#onRemoverAtor,
      alternarAtor: TesourosGeradorApp.#onAlternarAtor,
      distribuir: TesourosGeradorApp.#onDistribuir,
      postar: TesourosGeradorApp.#onPostar,
      metade: TesourosGeradorApp.#onMetade,
      cancelarRolagens: TesourosGeradorApp.#onCancelarRolagens
    }
  };

  static PARTS = { body: { template: `modules/${MODULE_ID}/templates/tesouros/gerador.hbs` } };

  #nd = '1';
  #modoRolagem = 'auto';
  #estoqueFolderId = null;
  #tesouro = null;
  #ocupado = false;

  /* Distribuição — vive aqui, na metade de baixo da janela. */
  /** Escopo escolhido no seletor: id da pasta de grupo, ou '' para personagens. */
  #escopo = '';
  /** id do nó gerado → id do destino */
  #atribuicoes = new Map();
  /** itens arrastados de fora: { uid, destinoId, nome, img, uuid } */
  #extras = [];
  /** id do destino → { tl, to, tp, tc } */
  #moedas = new Map();
  /** Atores que o Mestre arrastou para a janela (só quando não há grupos). */
  #atoresExtras = [];
  /** Convidados que o Mestre removeu de vez. */
  #atoresOcultos = new Set();
  /** Atores fora da divisão desta vez — cartão apagado, reversível num clique. */
  #atoresDesativados = new Set();
  /** Recém-arrastados — destacados por alguns instantes para dar retorno visual. */
  #recemAdicionados = new Set();

  /** Janela do passo aberta agora — o botão de cancelar a fecha. */
  #dialogoPasso = null;
  /** Desiste da espera por um jogador sem aguardar o tempo limite. */
  #cancelarEspera = null;

  #sincronizarFormulario() {
    const el = this.element;
    if (!el) return;
    const nd = el.querySelector('[name="nd"]')?.value;

    const modo = el.querySelector('[name="modoRolagem"]')?.value;
    if (nd) this.#nd = nd;
    if (modo) this.#modoRolagem = modo;

    // O seletor agora escolhe o ESCOPO da distribuição (qual grupo), não um
    // destinatário único — um tesouro gerado é da mesa, não de uma pessoa.
    const escopo = el.querySelector('[name="escopo"]');
    if (escopo) this.#escopo = escopo.value;
  }

  /**
   * Liga arrastar-e-soltar e os campos de moeda.
   *
   * Os campos gravam no estado a cada `change` SEM re-renderizar: redesenhar a
   * cada tecla tirava o foco do campo e descartava o que estava sendo digitado.
   * Só a linha "em disputa" é atualizada na hora.
   */
  _onRender(context, options) {
    super._onRender?.(context, options);
    const el = this.element;

    el.querySelector('[name="escopo"]')?.addEventListener('change', () => {
      this.#sincronizarFormulario();
      this.#prepararDistribuicao({ redividir: true });
      this.render();
    });

    for (const card of el.querySelectorAll('[data-item-uid]')) {
      card.addEventListener('dragstart', ev =>
        ev.dataTransfer.setData('text/plain', JSON.stringify({ t20gDist: card.dataset.itemUid })));
    }

    for (const zona of el.querySelectorAll('[data-bolso]')) {
      if (zona.tagName === 'INPUT') continue;
      zona.addEventListener('dragover', ev => { ev.preventDefault(); zona.classList.add('t20g-dist-sobre'); });
      zona.addEventListener('dragleave', () => zona.classList.remove('t20g-dist-sobre'));
      zona.addEventListener('drop', ev => {
        ev.preventDefault();
        zona.classList.remove('t20g-dist-sobre');
        this.#aoSoltarNoDestino(ev, zona.dataset.bolso);
      });
    }

    for (const campo of el.querySelectorAll('input[data-moeda]')) {
      campo.addEventListener('change', () => {
        this.#sincronizarMoedas();
        this.#atualizarDisputa();
      });
    }

  }

  /**
   * Listeners da RAIZ da janela, ligados uma vez só.
   *
   * O elemento raiz sobrevive aos re-renders (só o conteúdo é refeito), então
   * ligar aqui em `_onRender` empilhava um listener por render — o aviso de
   * "adicionado à distribuição" saía uma dúzia de vezes num arrasto só.
   *
   * Aceitar o arrasto na janela INTEIRA (e não só na área de distribuição) é
   * proposital: o Mestre solta o ator onde a mão estiver.
   */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.element.addEventListener('dragover', ev => ev.preventDefault());
    this.element.addEventListener('drop', ev => this.#aoSoltarNaJanela(ev));
  }

  /** Redesenha só a linha "em disputa", sem recriar os campos de moeda. */
  #atualizarDisputa() {
    const alvo = this.element?.querySelector('[data-disputa]');
    if (!alvo) return;
    const totais = totalDinheiro(this.#tesouro ?? { dinheiro: [], itens: [] });
    const sobra = this.#emDisputa();
    const partes = MOEDAS_CHAVES
      .filter(m => (totais[m] || 0) > 0 && sobra[m] !== 0)
      .map(m => `<b>${sobra[m]} ${rotuloMoeda(m)}</b>`);
    alvo.innerHTML = partes.length
      ? `<i class="fa-solid fa-triangle-exclamation"></i> ${loc('T20HaydGMTools.TesourosEmDisputa')}: ${partes.join(', ')}`
      : '';
  }

  /** Item solto numa coluna: move entre destinos ou entra vindo de fora. */
  async #aoSoltarNoDestino(ev, destinoId) {
    let dados;
    try { dados = JSON.parse(ev.dataTransfer.getData('text/plain')); } catch { return; }
    if (!dados) return;
    ev.stopPropagation();
    this.#sincronizarMoedas();

    if (dados.t20gDist) {
      const uid = dados.t20gDist;
      if (this.#atribuicoes.has(uid)) this.#atribuicoes.set(uid, destinoId);
      else {
        const extra = this.#extras.find(e => e.uid === uid);
        if (extra) extra.destinoId = destinoId;
      }
      return this.render();
    }

    if (dados.type !== 'Item' || !dados.uuid) return;
    const item = await fromUuid(dados.uuid);
    if (!item) return;
    this.#extras.push({
      uid: foundry.utils.randomID(), destinoId, uuid: dados.uuid, nome: item.name, img: item.img
    });
    this.render();
  }

  /**
   * Ator (ou pasta de atores) solto na janela: entra como destino elegível.
   *
   * Vale COM ou SEM grupo. Com grupo, o arrastado entra como convidado ao lado
   * dos membros — um NPC aliado, o personagem de um visitante — sem alterar a
   * pasta do grupo. Pasta arrastada traz só os atores da raiz.
   */
  async #aoSoltarNaJanela(ev) {
    let dados;
    try { dados = JSON.parse(ev.dataTransfer.getData('text/plain')); } catch { return; }
    if (!dados) return;

    const novos = [];
    if (dados.type === 'Actor' && dados.uuid) {
      const a = await fromUuid(dados.uuid);
      if (a) novos.push(a);
    } else if (dados.type === 'Folder' && dados.uuid) {
      const folder = await fromUuid(dados.uuid);
      // Só a raiz da pasta: subpastas costumam guardar outra coisa.
      if (folder?.type === 'Actor') novos.push(...folder.contents);
    }
    if (!novos.length) return;

    ev.preventDefault();
    this.#sincronizarMoedas();

    const conhecidos = new Set(this.#atoresExtras.map(a => a.id));
    const jaNaLista = new Set(this.#destinosDistribuicao().map(d => d.actorId).filter(Boolean));
    const adicionados = [];
    for (const a of novos) {
      // Soltar de novo alguém que foi removido antes o traz de volta.
      this.#atoresOcultos.delete(a.id);
      if (!conhecidos.has(a.id)) this.#atoresExtras.push(a);
      if (!jaNaLista.has(a.id)) adicionados.push(a);
    }

    this.#prepararDistribuicao({ redividir: true });
    this.#destacar(adicionados.map(a => a.id));

    // Retorno explícito: arrastar uma pasta pode não mudar nada visível se os
    // atores dela já estavam na lista, e sem aviso parece que o arrasto falhou.
    if (adicionados.length) {
      const nomes = adicionados.slice(0, 3).map(a => a.name).join(', ');
      const resto = adicionados.length > 3 ? ` +${adicionados.length - 3}` : '';
      ui.notifications.info(loc('T20HaydGMTools.TesourosAtoresAdicionados', { nomes: `${nomes}${resto}` }));
    } else {
      ui.notifications.info(loc('T20HaydGMTools.TesourosAtoresJaNaLista'));
    }

    this.render();
  }

  /** Marca destinos como recém-adicionados; o destaque some sozinho. */
  #destacar(ids) {
    if (!ids.length) return;
    for (const id of ids) this.#recemAdicionados.add(id);
    clearTimeout(this.#timerDestaque);
    this.#timerDestaque = setTimeout(() => {
      this.#recemAdicionados.clear();
      if (this.rendered) this.render();
    }, 2500);
  }
  #timerDestaque = null;

  /** Apaga/reativa o cartão de um personagem sem tirá-lo da lista. */
  static #onAlternarAtor(event, target) {
    this.#sincronizarMoedas();
    const id = target.dataset.actorId;
    if (this.#atoresDesativados.has(id)) this.#atoresDesativados.delete(id);
    else this.#atoresDesativados.add(id);
    this.#prepararDistribuicao({ redividir: true });
    this.render();
  }

  /** Tira um convidado de vez (membro do grupo usa o apagar/reativar). */
  static #onRemoverAtor(event, target) {
    this.#sincronizarMoedas();
    this.#atoresOcultos.add(target.dataset.actorId);
    this.#atoresExtras = this.#atoresExtras.filter(a => a.id !== target.dataset.actorId);
    // O que estava com ele volta para o padrão, e as moedas são redivididas.
    this.#prepararDistribuicao({ redividir: true });
    this.render();
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

    // "Rápido": nada é perguntado — nem a espera pelo d100 de um jogador, nem
    // a escolha da regra "2D". Rola tudo e mostra o resultado.
    if (this.#modoRolagem === 'rapido') return sessaoAutomatica();

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
    if (confirmar.tipo === 'cancelado') throw new RolagemCancelada();
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
          <label>${loc('T20HaydGMTools.TesourosSubstituirValor')}</label>
          <input type="number" name="valorManual" placeholder="${captura.roll.total}" />
        </div>`,
      rejectClose: false,
      buttons: [
        {
          // Um botão só: vazio usa o que veio do chat, preenchido usa o que o
          // Mestre digitou. Antes havia "Confirmar" e "Usar outro valor", e
          // digitar um valor e clicar em Confirmar descartava o que foi digitado.
          action: 'confirmar', label: loc('T20HaydGMTools.TesourosConfirmar'), icon: 'fa-solid fa-check', default: true,
          callback: (ev, btn) => {
            const bruto = btn.form.elements.valorManual.value.trim();
            if (bruto === '') return { tipo: 'confirmado' };
            const valor = Number(bruto);
            return Number.isFinite(valor) ? { tipo: 'manual', valor } : { tipo: 'confirmado' };
          }
        },
        {
          action: 'cancelar', label: loc('T20HaydGMTools.TesourosCancelar'), icon: 'fa-solid fa-ban',
          callback: () => ({ tipo: 'cancelado' })
        }
      ]
    }).catch(() => ({ tipo: 'cancelado' }));
    // Fechar no X é desistir, não aceitar em silêncio.
    return resultado ?? { tipo: 'cancelado' };
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
    // Guarda a janela aberta para o botão "Cancelar as rolagens" poder fechá-la.
    const escolha = await abrirDialogoPasso(spec, { aoAbrir: d => { this.#dialogoPasso = d; } });
    this.#dialogoPasso = null;
    if (escolha.modo === 'cancelado') throw new RolagemCancelada();

    const formula = spec.tipo === 'dado' ? `1d${spec.dado}` : spec.formula;

    if (escolha.modo === 'jogador') {
      const { roll, cancelado, abortado } = await pedirRolagemAoJogador({
        userId: escolha.userId, formula, rotulo: spec.rotulo,
        registrarCancelamento: fn => { this.#cancelarEspera = fn; }
      });
      this.#cancelarEspera = null;

      // O Mestre desistir é diferente de o jogador demorar: só o primeiro
      // interrompe a geração.
      if (abortado) throw new RolagemCancelada();
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

  /* ─── Distribuição (metade de baixo da janela) ────────────────────── */

  /**
   * Escopos oferecidos no seletor.
   *
   * Grupos configurados têm precedência: um tesouro gerado é da mesa, não de
   * uma pessoa só. Sem nenhum grupo, caem os personagens de jogador — e o
   * Mestre ainda pode arrastar atores para a janela para incluir quem quiser.
   */
  #escoposDisponiveis() {
    const grupos = (getPartyFolderIds?.() ?? [])
      .map(id => game.folders.get(id))
      .filter(Boolean)
      .map(f => ({ value: f.id, label: f.name }));
    if (grupos.length) return { grupos, temGrupos: true };
    return { grupos: [], temGrupos: false };
  }

  /** Destinos do escopo atual: estoque + membros, ou os personagens soltos. */
  #destinosDistribuicao() {
    const folderId = this.#escopo || this.#estoqueFolderId;
    if (folderId && game.folders.get(folderId)) {
      const folder = game.folders.get(folderId);
      const membros = getPartyMembers(folderId);
      const idsMembros = new Set(membros.map(a => a.id));

      // Convidados: atores que o Mestre arrastou e não fazem parte do grupo —
      // um NPC aliado, um personagem de outro grupo na mesma sessão. São
      // removíveis; os membros do grupo não, porque quem participa vem da pasta.
      const convidados = this.#atoresExtras
        .filter(a => !idsMembros.has(a.id) && !this.#atoresOcultos.has(a.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

      return [
        { id: ID_ESTOQUE, nome: loc('T20HaydGMTools.TesourosEstoqueDaParty', { nome: folder.name }), img: 'icons/svg/chest.svg', estoque: true, folderId },
        ...membros.map(a => this.#comoDestino(a, { podeDesativar: true })),
        ...convidados.map(a => this.#comoDestino(a, { podeDesativar: true, removivel: true, convidado: true }))
      ];
    }

    // Sem grupo: personagens de jogador, mais os que o Mestre arrastou, menos
    // os que ele tirou da lista.
    const base = game.actors.filter(a => a.type === 'character');
    const todos = [...new Map([...base, ...this.#atoresExtras].map(a => [a.id, a])).values()]
      .filter(a => !this.#atoresOcultos.has(a.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    // `removivel` só sem grupo: com grupo, quem participa vem da pasta, e
    // tirar alguém aqui daria a impressão de ter mexido no grupo.
    return todos.map(a => this.#comoDestino(a, { podeDesativar: true }));
  }

  /** Monta a entrada de destino de um ator. */
  #comoDestino(a, extras = {}) {
    return {
      id: `actor:${a.id}`, nome: a.name, img: a.img, actorId: a.id,
      recem: this.#recemAdicionados.has(a.id),
      desativado: this.#atoresDesativados.has(a.id),
      ...extras
    };
  }

  /** Destinos que de fato recebem alguma coisa. */
  #destinosAtivos(destinos = this.#destinosDistribuicao()) {
    return destinos.filter(d => !d.desativado);
  }

  /** Garante que cada item tem destino e cada destino tem um bolso de moedas. */
  #prepararDistribuicao({ redividir = false } = {}) {
    const destinos = this.#destinosDistribuicao();
    const ativos = this.#destinosAtivos(destinos);
    const ids = new Set(ativos.map(d => d.id));
    const padrao = ativos.find(d => d.estoque)?.id ?? ativos[0]?.id ?? null;

    for (const node of itensGerados(this.#tesouro ?? { dinheiro: [], itens: [] })) {
      const atual = this.#atribuicoes.get(node.id);
      if (!atual || !ids.has(atual)) this.#atribuicoes.set(node.id, padrao);
    }
    for (const ex of this.#extras) if (!ids.has(ex.destinoId)) ex.destinoId = padrao;

    for (const d of destinos) {
      if (!this.#moedas.has(d.id)) this.#moedas.set(d.id, Object.fromEntries(MOEDAS_CHAVES.map(m => [m, 0])));
    }
    for (const id of [...this.#moedas.keys()]) if (!ids.has(id)) this.#moedas.delete(id);

    if (redividir) this.#dividirIgualmente(destinos);
    return destinos;
  }

  /**
   * Divide em partes iguais SEM converter denominação: cada um leva a parte
   * inteira e o resto fica em disputa, para a mesa resolver.
   */
  #dividirIgualmente(destinos = this.#destinosDistribuicao()) {
    const totais = totalDinheiro(this.#tesouro ?? { dinheiro: [], itens: [] });
    const ativos = this.#destinosAtivos(destinos);
    const alvos = ativos.filter(d => !d.estoque);
    const entre = alvos.length ? alvos : ativos;
    for (const d of destinos) this.#moedas.set(d.id, Object.fromEntries(MOEDAS_CHAVES.map(m => [m, 0])));
    if (!entre.length) return;
    for (const m of MOEDAS_CHAVES) {
      const parte = Math.floor((totais[m] || 0) / entre.length);
      if (parte) for (const d of entre) this.#moedas.get(d.id)[m] = parte;
    }
  }

  /** O que ainda não foi atribuído — fica "em disputa". */
  #emDisputa() {
    const totais = totalDinheiro(this.#tesouro ?? { dinheiro: [], itens: [] });
    const sobra = {};
    for (const m of MOEDAS_CHAVES) {
      let dado = 0;
      for (const bolso of this.#moedas.values()) dado += bolso[m] ?? 0;
      sobra[m] = (totais[m] || 0) - dado;
    }
    return sobra;
  }

  /**
   * Lê os campos de moeda para o estado.
   *
   * Chamado ANTES de qualquer render que possa recriar os campos — sem isso o
   * que o Mestre digitou à mão era descartado no próximo redesenho, que era o
   * motivo de "não consigo escolher o número manualmente".
   */
  #sincronizarMoedas() {
    for (const campo of this.element?.querySelectorAll('input[data-moeda]') ?? []) {
      const bolso = this.#moedas.get(campo.dataset.bolso);
      if (bolso) bolso[campo.dataset.moeda] = Math.max(0, Math.floor(Number(campo.value) || 0));
    }
  }

  async _prepareContext() {
    this.#sincronizarFormulario();

    const { grupos, temGrupos } = this.#escoposDisponiveis();
    if (temGrupos && !this.#escopo) this.#escopo = this.#estoqueFolderId || grupos[0].value;

    const destinos = this.#tesouro ? this.#prepararDistribuicao() : [];
    const totais = totalDinheiro(this.#tesouro ?? { dinheiro: [], itens: [] });
    const moedasEmUso = MOEDAS_CHAVES.filter(m => (totais[m] || 0) > 0);
    const disputa = this.#emDisputa();

    const porDestino = new Map(destinos.map(d => [d.id, []]));
    for (const node of itensGerados(this.#tesouro ?? { dinheiro: [], itens: [] })) {
      porDestino.get(this.#atribuicoes.get(node.id))?.push({
        id: node.id, nome: nomeDoNode(node), img: imgDoNode(node), extra: false
      });
    }
    for (const ex of this.#extras) {
      porDestino.get(ex.destinoId)?.push({ id: ex.uid, nome: ex.nome, img: ex.img, extra: true });
    }

    return {
      ordemND: ORDEM_ND, nd: this.#nd, modoRolagem: this.#modoRolagem,
      ocupado: this.#ocupado,
      temTesouro: !!this.#tesouro,
      grupos, temGrupos, escopo: this.#escopo,
      moedasEmUso: moedasEmUso.map(m => ({ chave: m, rotulo: rotuloMoeda(m), total: totais[m] })),
      disputa: moedasEmUso.filter(m => disputa[m] !== 0).map(m => ({ rotulo: rotuloMoeda(m), valor: disputa[m] })),
      destinos: destinos.map(d => ({
        ...d,
        itens: porDestino.get(d.id) ?? [],
        moedas: moedasEmUso.map(m => ({ chave: m, rotulo: rotuloMoeda(m), valor: this.#moedas.get(d.id)?.[m] ?? 0 }))
      })),
      totalMoedas: this.#tesouro ? formatarMoedas(totais) : [],
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
    let novoTesouro;
    try {
      novoTesouro = await gerarTesouro(this.#nd, () => this.#criarSessao());
    } catch (err) {
      if (!(err instanceof RolagemCancelada)) throw err;
      ui.notifications.info(loc('T20HaydGMTools.TesourosGeracaoCancelada'));
      return;
    } finally {
      this.#ocupado = false;
      this.render();
    }

    // Acumula com o que já tinha, em vez de substituir.
    if (this.#tesouro) {
      this.#tesouro.dinheiro.push(...novoTesouro.dinheiro);
      this.#tesouro.itens.push(...novoTesouro.itens);
    } else {
      this.#tesouro = novoTesouro;
    }
    this.render();

    if (this.#modoRolagem === 'auto') {
      for (const entrada of [...novoTesouro.dinheiro, ...novoTesouro.itens]) {
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
    const rotulo = `ND ${this.#nd} — ${LABEL_COLUNA[coluna]}`;
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
  /**
   * Interrompe a geração em andamento. Fecha a janela do passo aberta (o
   * fechamento já é tratado como cancelamento) e desiste da espera por um
   * jogador, se houver uma.
   */
  static #onCancelarRolagens() {
    this.#cancelarEspera?.();
    this.#dialogoPasso?.close({ animate: false });
  }

  static #onMetade(event, target) {
    const { coluna, entradaId } = target.dataset;
    const entrada = (this.#tesouro?.[coluna] ?? []).find(e => e.id === entradaId);
    if (!entrada) return;
    alternarMetadeResultado(entrada.resultado);
    this.render();
  }

  static #onDividirIgual() {
    this.#sincronizarMoedas();
    this.#dividirIgualmente();
    this.render();
  }

  static #onZerarMoedas() {
    for (const id of this.#moedas.keys()) {
      this.#moedas.set(id, Object.fromEntries(MOEDAS_CHAVES.map(m => [m, 0])));
    }
    this.render();
  }

  static #onRemoverExtra(event, target) {
    this.#sincronizarMoedas();
    this.#extras = this.#extras.filter(e => e.uid !== target.dataset.uid);
    this.render();
  }

  /** Entrega um item ao destino escolhido. */
  async #entregarItem(destinoId, dados, destinos) {
    const destino = destinos.find(d => d.id === destinoId);
    if (!destino) return;
    if (destino.estoque) {
      await stashAddItem(destino.folderId, dados, Number(dados.system?.qtd) || 1);
      return;
    }
    const actor = game.actors.get(String(destinoId).slice('actor:'.length));
    if (!actor) return;
    const [doc] = await actor.createEmbeddedDocuments('Item', [dados]);
    if (doc) await finalizarPosCriacao(doc);
  }

  /**
   * Aplica o plano montado na metade de baixo da janela.
   *
   * Valida ANTES de mexer em qualquer ficha: distribuir mais dinheiro do que o
   * tesouro tem criaria moeda do nada, e como a entrega é ator a ator, abortar
   * no meio deixaria metade do grupo pago. Ou vale tudo, ou não vale nada.
   */
  static async #onDistribuir() {
    this.#sincronizarFormulario();
    this.#sincronizarMoedas();
    if (!this.#tesouro) return;

    const destinos = this.#prepararDistribuicao();
    const totais = totalDinheiro(this.#tesouro);
    const sobra = this.#emDisputa();

    // Passou do total em alguma moeda: recusa a distribuição inteira.
    const excedidas = MOEDAS_CHAVES.filter(m => sobra[m] < 0);
    if (excedidas.length) {
      const detalhe = excedidas
        .map(m => `${-sobra[m]} ${rotuloMoeda(m)}`)
        .join(', ');
      return ui.notifications.error(loc('T20HaydGMTools.TesourosDinheiroExcedido', { detalhe }));
    }

    // Sobrou: o resto vai para o estoque do grupo, sem conversão de moeda.
    const estoque = destinos.find(d => d.estoque);
    const temSobra = MOEDAS_CHAVES.some(m => sobra[m] > 0);
    if (temSobra && estoque) {
      const bolso = this.#moedas.get(estoque.id);
      for (const m of MOEDAS_CHAVES) bolso[m] = (bolso[m] ?? 0) + sobra[m];
    }

    /* ─── Execução ─── */
    const entregues = new Map(destinos.map(d => [d.id, []]));

    for (const node of itensGerados(this.#tesouro)) {
      const destino = this.#atribuicoes.get(node.id);
      if (!destino) continue;
      await this.#entregarItem(destino, await materializarItem(node), destinos);
      entregues.get(destino)?.push({ nome: nomeDoNode(node), img: imgDoNode(node) });
    }

    for (const extra of this.#extras) {
      const item = await fromUuid(extra.uuid);
      if (!item) continue;
      const dados = item.toObject();
      delete dados._id;
      delete dados.folder;
      delete dados.sort;
      await this.#entregarItem(extra.destinoId, dados, destinos);
      entregues.get(extra.destinoId)?.push({ nome: item.name, img: item.img });
    }

    for (const d of destinos) {
      const moedas = this.#moedas.get(d.id);
      if (!moedas || !MOEDAS_CHAVES.some(m => moedas[m] > 0)) continue;
      if (d.estoque) { await stashAddMoney(d.folderId, moedas); continue; }
      const actor = game.actors.get(String(d.id).slice('actor:'.length));
      if (!actor) continue;
      const atualizacoes = {};
      for (const m of MOEDAS_CHAVES) {
        if (moedas[m]) atualizacoes[`system.dinheiro.${m}`] = (Number(actor.system?.dinheiro?.[m]) || 0) + moedas[m];
      }
      if (!foundry.utils.isEmpty(atualizacoes)) await actor.update(atualizacoes);
    }

    await this.#postarDistribuicao(destinos, entregues, totais, temSobra && !estoque ? sobra : null);
    if (temSobra && !estoque) ui.notifications.warn(loc('T20HaydGMTools.TesourosSobraSemEstoque'));
    ui.notifications.info(loc('T20HaydGMTools.TesourosDistribuido'));
    this.render();
  }

  /** Card de chat com o resultado da partilha, por pessoa. */
  async #postarDistribuicao(destinos, entregues, totais, sobraPerdida) {
    const esc = t => foundry.utils.escapeHTML(String(t ?? ''));
    const chips = moedas => MOEDAS_CHAVES
      .filter(m => (moedas?.[m] ?? 0) > 0)
      .map(m => `<span class="t20g-chip"><b>${moedas[m]}</b> ${esc(rotuloMoeda(m))}</span>`)
      .join('');

    const linhas = destinos.map(d => {
      const itens = entregues.get(d.id) ?? [];
      const moedas = this.#moedas.get(d.id) ?? {};
      const temMoeda = MOEDAS_CHAVES.some(m => (moedas[m] ?? 0) > 0);
      // Quem não recebeu nada continua na lista, marcado — o grupo enxerga
      // quem ficou de fora sem precisar conferir ficha por ficha.
      if (!itens.length && !temMoeda) {
        return `<div class="t20g-part-linha t20g-part-vazio">
          <img src="${esc(d.img)}" />
          <div class="t20g-part-info"><b>${esc(d.nome)}</b>
            <span class="t20g-part-nada">${esc(loc('T20HaydGMTools.TesourosNadaRecebido'))}</span>
          </div></div>`;
      }
      const itensHtml = itens.length
        ? `<ul class="t20g-part-itens">${itens.map(i =>
            `<li><img src="${esc(i.img)}" /> ${esc(i.nome)}</li>`).join('')}</ul>`
        : '';
      return `<div class="t20g-part-linha">
        <img src="${esc(d.img)}" />
        <div class="t20g-part-info">
          <b>${esc(d.nome)}</b>
          ${temMoeda ? `<div class="t20g-part-moedas">${chips(moedas)}</div>` : ''}
          ${itensHtml}
        </div></div>`;
    }).join('');

    const aviso = sobraPerdida
      ? `<p class="t20g-part-aviso"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(loc('T20HaydGMTools.TesourosSobraSemEstoque'))}</p>`
      : '';

    await ChatMessage.create({
      content: `
        <div class="t20g-part t20g-card">
          <div class="t20g-part-head">
            <i class="fa-solid fa-sack-dollar"></i>
            <div>
              <strong>${esc(loc('T20HaydGMTools.TesourosPartilhaTitulo'))}</strong>
              <span>${esc(loc('T20HaydGMTools.TesourosPartilhaND', { nd: this.#nd }))}</span>
            </div>
          </div>
          <div class="t20g-part-total">
            <span>${esc(loc('T20HaydGMTools.TesourosTotal'))}</span>
            <div>${chips(totais) || `<span class="t20g-part-nada">—</span>`}</div>
          </div>
          ${linhas}
          ${aviso}
        </div>`,
      speaker: { alias: loc('T20HaydGMTools.TesourosGeradorTitulo') }
    });
  }

  static async #onPostar() {
    this.#sincronizarFormulario();
    if (!this.#tesouro) return;
    const destinatario = this.#escopo || this.#estoqueFolderId
      ? game.folders.get(this.#escopo || this.#estoqueFolderId)?.name ?? null
      : null;
    await postarCardTesouro(this.#tesouro, { titulo: loc('T20HaydGMTools.TesourosCardTitulo'), destinatario });
  }
}

export function abrirGeradorTesouros(opcoes = {}) {
  return TesourosGeradorApp.abrir(opcoes);
}
