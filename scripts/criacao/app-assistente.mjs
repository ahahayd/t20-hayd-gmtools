/**
 * Assistente de Criação de Personagem.
 *
 * Uma janela com as etapas do Livro Básico (cap. 1, "Construção de
 * Personagem"): atributos, raça, classe, origem, divindade (com as magias
 * que cada uma dá) e equipamento, e um resumo no fim. Nada vai para a ficha antes do botão
 * "Criar personagem" — até lá, o que o jogador montou vive num rascunho
 * guardado no próprio ator, e fechar a janela não perde nada.
 *
 * Cada etapa tem, à direita, uma lista de sugestões tirada das fontes que o
 * Mestre ligou (poderes da raça, habilidades da classe, poderes da origem,
 * concedidos da divindade...). Tudo pode ser arrastado da lista, da barra
 * de compêndios ou da aba Itens para dentro da janela.
 */
import { MODULE_ID, carregarCatalogo, TIPOS_EQUIPAMENTO } from './fontes.mjs';
import {
  DIVINDADES, divindadePorNome, concedidoPelaDivindade, lerPericiasDaClasse, regraDaRaca,
  nivelDaHabilidade, lerMagiasIniciais, magiasAdicionaisIniciais, contarEscolhasDaClasse, normalizar, subtipoDe,
  outrasDivindades, CATEGORIAS_GERAIS, categoriaGeral, saldoDoEquipamento, chaveDeNome,
  modificadoresAbertos, racialAberto, formatarTibares, formatarMoedas
} from './regras.mjs';
import { aplicarCriacao, anunciarPersonagem, FLAG_RASCUNHO, FLAG_CONCLUIDA, PROFICIENCIAS } from './aplicar.mjs';
import { escolherAtributos, metodosDeAtributos } from '../../t20-hayd-atributos.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const TextEditorImpl = () => foundry.applications.ux.TextEditor.implementation;

const PASTA = `modules/${MODULE_ID}/templates/criacao`;
export const TEMPLATES_CRIACAO = [
  `${PASTA}/assistente.hbs`,
  `${PASTA}/atributos.hbs`, `${PASTA}/raca.hbs`, `${PASTA}/classe.hbs`, `${PASTA}/origem.hbs`,
  `${PASTA}/complicacao.hbs`, `${PASTA}/divindade.hbs`, `${PASTA}/equipamento.hbs`, `${PASTA}/resumo.hbs`,
  `${PASTA}/partes/pericias.hbs`, `${PASTA}/partes/zona.hbs`, `${PASTA}/partes/sugestoes.hbs`,
  `${PASTA}/partes/magias.hbs`
];

const ETAPAS = [
  { id: 'atributos', rotulo: 'Atributos', icone: 'fa-dice-d20' },
  { id: 'raca', rotulo: 'Raça', icone: 'fa-person' },
  { id: 'classe', rotulo: 'Classe', icone: 'fa-shield-halved' },
  { id: 'origem', rotulo: 'Origem', icone: 'fa-scroll' },
  { id: 'complicacao', rotulo: 'Complicação', icone: 'fa-skull', opcional: true },
  { id: 'divindade', rotulo: 'Divindade', icone: 'fa-sun', opcional: true },
  { id: 'equipamento', rotulo: 'Equipamento', icone: 'fa-sack' },
  { id: 'resumo', rotulo: 'Resumo', icone: 'fa-flag-checkered' }
];

export const ICONES_ATR = {
  for: 'fa-hand-fist', des: 'fa-person-running', con: 'fa-heart-pulse',
  int: 'fa-brain', sab: 'fa-eye', car: 'fa-comments'
};

/** Onde cada coisa arrastada pode cair, e em que lugar do estado mora. */
const ZONAS = {
  racaPoderes: { etapa: 'raca', chave: 'poderes', aceita: ['poder'], rotulo: 'Habilidades da raça' },
  racaMagias: { etapa: 'raca', chave: 'magias', aceita: ['magia'], rotulo: 'Magias da raça' },
  classePoderes: { etapa: 'classe', chave: 'poderes', aceita: ['poder'], rotulo: 'Habilidades da classe' },
  classeMagias: { etapa: 'classe', chave: 'magias', aceita: ['magia'], rotulo: 'Magias da classe' },
  origemPoderes: { etapa: 'origem', chave: 'poderes', aceita: ['poder'], rotulo: 'Poderes da origem' },
  origemMagias: { etapa: 'origem', chave: 'magias', aceita: ['magia'], rotulo: 'Magias da origem' },
  origemItens: { etapa: 'origem', chave: 'itens', aceita: TIPOS_EQUIPAMENTO, rotulo: 'Itens da origem' },
  complicacaoPoderes: { etapa: 'complicacao', chave: 'poderes', aceita: ['poder'], rotulo: 'Complicação' },
  complicacaoTroca: { etapa: 'complicacao', chave: 'troca', aceita: ['poder'], rotulo: 'Poder geral em troca' },
  divindadePoderes: { etapa: 'divindade', chave: 'poderes', aceita: ['poder'], rotulo: 'Poderes concedidos' },
  divindadeMagias: { etapa: 'divindade', chave: 'magias', aceita: ['magia'], rotulo: 'Magias da divindade' },
  equipItens: { etapa: 'equipamento', chave: 'itens', aceita: TIPOS_EQUIPAMENTO, rotulo: 'Equipamento' }
};

/** A aba da lista ao lado que serve cada zona (clicar na zona abre a aba). */
const ABA_DA_ZONA = {
  racaPoderes: 'raciais', racaMagias: 'magias',
  classePoderes: 'habilidades', classeMagias: 'magias',
  origemPoderes: 'daOrigem', origemMagias: 'magias', origemItens: 'itens',
  complicacaoPoderes: 'complicacoes', complicacaoTroca: 'grupo:Gerais',
  divindadePoderes: 'doDeus', divindadeMagias: 'magias',
  equipItens: 'armas'
};

/** Zona de destino de um tipo de item em cada etapa (para "+" e soltar fora de zona). */
const ZONA_PADRAO = {
  raca: { poder: 'racaPoderes', magia: 'racaMagias' },
  classe: { poder: 'classePoderes', magia: 'classeMagias' },
  origem: { poder: 'origemPoderes', magia: 'origemMagias', item: 'origemItens' },
  // Na complicação, o poder de complicação vai para a sua zona e o resto é
  // o poder geral recebido em troca (ver #adicionar).
  complicacao: { poder: 'complicacaoTroca' },
  divindade: { poder: 'divindadePoderes', magia: 'divindadeMagias' }
};

/**
 * Equipamento inicial do Livro Básico (cap. 3). Cada "vaga" é uma escolha que
 * entra na lista já como recebida, sem gastar dinheiro; trocar a escolha
 * troca o item. Os nomes são procurados nas fontes ligadas.
 */
const KIT_BASICO = ['Mochila', 'Saco de dormir', 'Traje de viajante'];
const ARMADURAS_INICIAIS = ['Armadura de couro', 'Couro batido', 'Gibão de peles'];
const ARMADURA_PESADA_INICIAL = 'Brunea';
const ESCUDO_INICIAL = 'Escudo leve';
/** Preço acima do qual uma arma não é opção de equipamento inicial: tira as
 *  armas mágicas e superiores (que também têm proficiência simples/marcial). */
const PRECO_MAX_ARMA_INICIAL = 500;

/** Sugestões entram de 30 em 30 conforme a lista rola. */
const LOTE_SUGESTOES = 30;

/* ─── Utilidades ──────────────────────────────────────────────────────── */

export function atributosDoSistema() {
  return CONFIG.T20?.atributos ?? { for: 'Força', des: 'Destreza', con: 'Constituição', int: 'Inteligência', sab: 'Sabedoria', car: 'Carisma' };
}

export function abrevAtr(k) {
  return CONFIG.T20?.atributosAbr?.[k] ?? k.charAt(0).toUpperCase() + k.slice(1);
}

export function sinal(n) {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0';
}

export function rotulosPericias() {
  const out = {};
  for (const [k, p] of Object.entries(CONFIG.T20?.pericias ?? {})) out[k] = game.i18n.localize(p.label);
  return out;
}

export function chavesOficio() {
  return [...(CONFIG.T20?.oficios ?? [])];
}

export function ref(doc) {
  const r = { uuid: doc.uuid, nome: doc.name ?? doc.nome, img: doc.img, type: doc.type };
  if (TIPOS_EQUIPAMENTO.includes(doc.type)) r.preco = Number((doc.system ?? doc.sistema)?.preco) || 0;
  return r;
}

/** Os modificadores fixos da raça em chips ("+2 Con", "−1 Des"). */
function chipsDeRaca(sistema, abertas = false) {
  const chips = [];
  if (abertas) {
    for (const v of modificadoresAbertos(sistema?.atributos)) chips.push({ texto: sinal(v), negativo: v < 0 });
  }
  for (const k of abertas ? [] : Object.keys(atributosDoSistema())) {
    const v = Number(sistema?.atributos?.[k]) || 0;
    if (v) chips.push({ texto: `${sinal(v)} ${abrevAtr(k)}`, negativo: v < 0 });
  }
  const din = sistema?.atributosDinamicos;
  const temDin = Array.isArray(din?.value) ? din.value.length : din?.value?.size;
  if (temDin) chips.push({ texto: din.description || 'atributos à escolha', dinamico: true });
  return chips;
}

function estadoInicial(actor) {
  const bases = {};
  let temBase = false;
  for (const k of Object.keys(atributosDoSistema())) {
    bases[k] = Number(actor.system.atributos?.[k]?.base) || 0;
    if (bases[k]) temBase = true;
  }
  return {
    versao: 1,
    passo: 'atributos',
    atributos: { metodo: null, bases: temBase ? bases : null, resumo: temBase ? 'Valores que já estavam na ficha.' : '' },
    raca: { sel: null, escolhidos: {}, poderes: [], magias: [], pericias: [] },
    classe: { sel: null, poderes: [], magias: [], pericias: [] },
    origem: { nome: actor.system.detalhes?.origem ?? '', poderes: [], magias: [], pericias: [], itens: [], dinheiro: '' },
    complicacao: { poderes: [], troca: [] },
    divindade: { nome: actor.system.detalhes?.divindade ?? '', poderes: [], magias: [] },
    equipamento: {
      itens: [], dinheiro: '', comprar: true,
      // Todo personagem sabe usar armas simples e armaduras leves.
      prof: { simples: true, leve: true }
    },
    ficha: { nome: actor.name, img: actor.img }
  };
}

/** Rascunho do formato anterior (com a etapa Magias) para o atual. */
function migrarRascunho(est) {
  if (est.magias?.lista?.length) {
    est.classe ??= {};
    est.classe.magias = [...(est.classe.magias ?? []), ...est.magias.lista];
  }
  delete est.magias;
  if (est.passo === 'magias') est.passo = 'classe';
  return est;
}

/* ─── A janela ────────────────────────────────────────────────────────── */

export class CriacaoAssistenteApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** Uma janela por ator. */
  static #abertas = new Map();

  static abrir(actor) {
    if (!actor || actor.type !== 'character') {
      ui.notifications.warn('O Assistente de Criação vale apenas para Personagens de Jogador.');
      return null;
    }
    if (!actor.isOwner) {
      ui.notifications.warn('Você não pode editar este personagem.');
      return null;
    }
    let app = this.#abertas.get(actor.uuid);
    if (!app) {
      app = new CriacaoAssistenteApp(actor);
      this.#abertas.set(actor.uuid, app);
    }
    app.render({ force: true });
    if (app.rendered) app.bringToFront();
    return app;
  }

  static DEFAULT_OPTIONS = {
    classes: ['t20g-criacao'],
    window: { icon: 'fa-solid fa-wand-magic-sparkles', resizable: true },
    position: { width: 1080, height: 780 },
    actions: {
      passo: CriacaoAssistenteApp.#onPasso,
      proximo: CriacaoAssistenteApp.#onProximo,
      anterior: CriacaoAssistenteApp.#onAnterior,
      metodo: CriacaoAssistenteApp.#onMetodo,
      escolherRaca: CriacaoAssistenteApp.#onEscolherRaca,
      trocarRaca: CriacaoAssistenteApp.#onTrocarRaca,
      escolherClasse: CriacaoAssistenteApp.#onEscolherClasse,
      trocarClasse: CriacaoAssistenteApp.#onTrocarClasse,
      dinamico: CriacaoAssistenteApp.#onDinamico,
      aberto: CriacaoAssistenteApp.#onAberto,
      habilidadesNivel1: CriacaoAssistenteApp.#onHabilidadesNivel1,
      dinamicoPasso: CriacaoAssistenteApp.#onDinamicoPasso,
      pericia: CriacaoAssistenteApp.#onPericia,
      remover: CriacaoAssistenteApp.#onRemover,
      quantidade: CriacaoAssistenteApp.#onQuantidade,
      abrirItem: CriacaoAssistenteApp.#onAbrirItem,
      adicionar: CriacaoAssistenteApp.#onAdicionar,
      aba: CriacaoAssistenteApp.#onAba,
      divindade: CriacaoAssistenteApp.#onDivindade,
      origemSugerida: CriacaoAssistenteApp.#onOrigemSugerida,
      kitBasico: CriacaoAssistenteApp.#onKitBasico,
      escudoInicial: CriacaoAssistenteApp.#onEscudoInicial,
      escolherVaga: CriacaoAssistenteApp.#onEscolherVaga,
      focarZona: CriacaoAssistenteApp.#onFocarZona,
      tirarVaga: CriacaoAssistenteApp.#onTirarVaga,
      gratis: CriacaoAssistenteApp.#onGratis,
      comprar: CriacaoAssistenteApp.#onComprar,
      proficiencia: CriacaoAssistenteApp.#onProficiencia,
      abaDeuses: CriacaoAssistenteApp.#onAbaDeuses,
      rolarDinheiro: CriacaoAssistenteApp.#onRolarDinheiro,
      retrato: CriacaoAssistenteApp.#onRetrato,
      niveis: CriacaoAssistenteApp.#onNiveis,
      recomecar: CriacaoAssistenteApp.#onRecomecar,
      concluir: CriacaoAssistenteApp.#onConcluir
    }
  };

  static PARTS = {
    corpo: {
      template: `${PASTA}/assistente.hbs`,
      // Toda área com rolagem própria entra aqui: redesenhar a janela (o que
      // acontece a cada escolha) não pode jogar o jogador de volta ao topo.
      // A lista de sugestões é montada depois do render e cuida da própria
      // rolagem (ver #montarSugestoes).
      scrollable: ['.t20g-cc-principal', '.t20g-cc-grade', '.t20g-cc-deuses--outras', '.t20g-cc-atalhos']
    }
  };

  /** @type {Actor} */
  actor;
  #estado;
  #catalogo = null;
  /** Aba de sugestões ativa por etapa. */
  #aba = {};
  /** Texto das buscas, por campo, para sobreviver aos re-renders. */
  #busca = {};
  /** uuid → nível, das habilidades da classe escolhida (lido das descrições). */
  #niveis = new Map();
  #mostrarNiveis = false;
  /** O que a habilidade "Magias (Classe)" diz: { tipo, iniciais, nome } */
  #infoMagias = null;
  /** uuid → magias a mais no 1º nível (o Caminho do Arcanista: Mago dá +1). */
  #magiasExtras = new Map();
  #salvarDepois = null;
  #ocupado = false;
  #sugestoesAtuais = [];
  /** Valores dos filtros por "etapa:aba". */
  #filtros = {};
  /** Última subaba usada em cada grupo, por "etapa:grupo". */
  #ultimaSubaba = {};
  /** uuid → entrada do catálogo (montado na primeira consulta). */
  #indiceUuid = null;
  /** Rolagem da lista de sugestões: { chave, mostrados, topo } da última montagem. */
  #rolagemLista = null;
  /** Depois do próximo render, pôr o cursor na busca da lista ao lado. */
  #focarBusca = false;
  /** Vaga do equipamento inicial sendo escolhida pela lista ao lado. */
  #vagaAtiva = null;
  /** Aba da grade de divindades: 'panteao' ou 'outras'. */
  #abaDeuses = 'panteao';

  constructor(actor, options = {}) {
    super({ ...options, id: `t20g-criacao-${actor.id}` });
    this.actor = actor;
    this.#estado = this.#lerRascunho() ?? estadoInicial(actor);
    // Mestre e jogador podem estar com o mesmo rascunho aberto: o que um
    // grava aparece para o outro (a etapa em que cada um está fica).
    this.#ganchoSync = Hooks.on('updateActor', (doc, mudou, opcoes, userId) => {
      if (doc !== this.actor || userId === game.userId) return;
      // Alguém concluiu a criação noutra janela: esta fecha sem gravar, para
      // ninguém aplicar a mesma criação duas vezes.
      if (foundry.utils.getProperty(mudou, `flags.${MODULE_ID}.${FLAG_CONCLUIDA}`)) {
        this.#concluido = true;
        ui.notifications.info(`${this.actor.name} foi criado por ${game.users.get(userId)?.name ?? 'outra pessoa'}.`);
        this.close();
        return;
      }
      if (!foundry.utils.hasProperty(mudou, `flags.${MODULE_ID}.${FLAG_RASCUNHO}`)) return;
      const novo = this.#lerRascunho();
      if (!novo) return;
      novo.passo = this.#estado.passo;
      this.#estado = novo;
      if (this.rendered) this.render();
    });
  }

  #ganchoSync = null;

  get title() {
    return `Criação de Personagem — ${this.actor.name}`;
  }

  /* ─── Rascunho ─────────────────────────────────────────────────────── */

  #lerRascunho() {
    const bruto = this.actor.getFlag(MODULE_ID, FLAG_RASCUNHO);
    if (!bruto) return null;
    try {
      const est = typeof bruto === 'string' ? JSON.parse(bruto) : bruto;
      if (est?.versao !== 1) return null;
      return foundry.utils.mergeObject(estadoInicial(this.actor), migrarRascunho(est), { inplace: false });
    } catch { return null; }
  }

  /** Guarda o rascunho no ator. Como texto, para o merge de flags do
   *  Foundry não ressuscitar chaves que o jogador já tirou. */
  #salvar(imediato = false) {
    clearTimeout(this.#salvarDepois);
    const gravar = () => {
      if (!this.actor.isOwner || !game.actors.has(this.actor.id)) return;
      this.actor.update({ [`flags.${MODULE_ID}.${FLAG_RASCUNHO}`]: JSON.stringify(this.#estado) }, { render: false })
        .catch(err => console.warn(`${MODULE_ID} | Falha ao salvar o rascunho da criação`, err));
    };
    if (imediato) gravar();
    else this.#salvarDepois = setTimeout(gravar, 700);
  }

  #mudou() {
    this.#salvar();
    this.render();
  }

  async close(options) {
    if (!this.#concluido) this.#salvar(true);
    Hooks.off('updateActor', this.#ganchoSync);
    CriacaoAssistenteApp.#abertas.delete(this.actor.uuid);
    return super.close(options);
  }

  #concluido = false;

  /* ─── Cálculos ─────────────────────────────────────────────────────── */

  /** Racial final: fixos da raça (ou, com Raças Abertas, as peças onde o
   *  jogador as colocou) mais os dinâmicos escolhidos. */
  #racial() {
    const out = {};
    const sel = this.#estado.raca.sel;
    if (sel?.aberta) {
      return racialAberto(Object.keys(atributosDoSistema()), sel.pecas ?? [], this.#estado.raca.abertos ?? [], this.#estado.raca.escolhidos);
    }
    for (const k of Object.keys(atributosDoSistema())) {
      out[k] = (Number(sel?.fixos?.[k]) || 0) + (sel ? (Number(this.#estado.raca.escolhidos[k]) || 0) : 0);
    }
    return out;
  }

  #regraClasse() {
    const sel = this.#estado.classe.sel;
    if (!sel) return null;
    return lerPericiasDaClasse(sel.inatas, rotulosPericias(), chavesOficio());
  }

  /** Perícias marcadas em cada etapa: { raca: [...], classe: [...], origem: [...] } */
  #periciasPorEtapa() {
    return {
      raca: this.#estado.raca.pericias,
      classe: this.#estado.classe.pericias,
      origem: this.#estado.origem.pericias
    };
  }

  #todasPericias() {
    const s = new Set();
    for (const l of Object.values(this.#periciasPorEtapa())) for (const k of l) s.add(k);
    return s;
  }

  #dinamicosOk() {
    const sel = this.#estado.raca.sel;
    if (sel?.aberta && (sel.pecas ?? []).some((_, i) => !this.#estado.raca.abertos?.[i])) return false;
    if (!sel?.regra || !sel.permitidos?.length) return true;
    const marcados = Object.values(this.#estado.raca.escolhidos).filter(v => v).length;
    return marcados === sel.regra.quantos;
  }

  #feita(id) {
    const e = this.#estado;
    switch (id) {
      case 'atributos': return !!e.atributos.bases;
      case 'raca': return !!e.raca.sel && this.#dinamicosOk();
      case 'classe': return !!e.classe.sel;
      case 'origem': return !!e.origem.nome?.trim();
      case 'complicacao': return e.complicacao.poderes.length > 0 && e.complicacao.troca.length > 0;
      case 'divindade': return !!e.divindade.nome?.trim() || e.divindade.poderes.length > 0;
      case 'equipamento': return (e.equipamento.itens.length > 0 || this.#saldo().inicial > 0) && this.#saldo().sobra >= 0;
      default: return false;
    }
  }

  /** Dinheiro inicial, gasto nas compras e o que sobra. */
  /** Dinheiro inicial (o rolado mais o que a origem dá), gasto nas compras e o que sobra. */
  #saldo() {
    const eq = this.#estado.equipamento;
    const daOrigem = Math.max(0, Number(this.#estado.origem.dinheiro) || 0);
    const rolado = Math.max(0, Number(eq.dinheiro) || 0);
    return { ...saldoDoEquipamento(eq.itens, rolado + daOrigem, eq.comprar !== false), daOrigem };
  }

  /** Todas as magias escolhidas, de todas as etapas. */
  #todasMagias() {
    const e = this.#estado;
    return [...e.raca.magias, ...e.classe.magias, ...e.origem.magias, ...e.divindade.magias];
  }

  /** Pendências para o resumo: o que falta, sem impedir a criação. */
  #pendencias() {
    const e = this.#estado;
    const p = [];
    if (!e.atributos.bases) p.push({ passo: 'atributos', texto: 'Os atributos ainda não foram definidos.' });
    if (!e.raca.sel) p.push({ passo: 'raca', texto: 'Nenhuma raça escolhida.' });
    else if (!this.#dinamicosOk()) {
      const faltaPeca = e.raca.sel.aberta && (e.raca.sel.pecas ?? []).some((_, i) => !e.raca.abertos?.[i]);
      p.push({
        passo: 'raca',
        texto: faltaPeca
          ? `Raças Abertas: coloque os modificadores da raça (${e.raca.sel.pecas.map(sinal).join(', ')}) nos atributos.`
          : `Escolha os atributos da raça (${e.raca.sel.descDin}).`
      });
    }
    if (!e.classe.sel) p.push({ passo: 'classe', texto: 'Nenhuma classe escolhida.' });
    else {
      const regra = this.#regraClasse();
      if (regra?.escolha) {
        const n = contarEscolhasDaClasse(e.classe.pericias, regra);
        const int = Math.max(0, (e.atributos.bases?.int ?? 0) + this.#racial().int);
        if (n < regra.escolha + int) {
          p.push({
            passo: 'classe',
            texto: int
              ? `Perícias à escolha: ${n} de ${regra.escolha + int} (${regra.escolha} da classe + ${int} pela Inteligência).`
              : `Perícias à escolha da classe: ${n} de ${regra.escolha}.`
          });
        }
      }
      for (const grupo of regra?.fixas ?? []) {
        if (grupo.length > 1 && !grupo.some(k => e.classe.pericias.includes(k))) {
          const r = rotulosPericias();
          p.push({ passo: 'classe', texto: `Escolha entre ${grupo.slice(0, 3).map(k => r[k]).join(' ou ')}${grupo.length > 3 ? '…' : ''}.` });
        }
      }
    }
    if (!e.origem.nome?.trim()) p.push({ passo: 'origem', texto: 'A origem está sem nome.' });
    if (e.complicacao.poderes.length && !e.complicacao.troca.length) {
      p.push({ passo: 'complicacao', texto: 'Complicação: falta o poder geral que você ganha em troca.' });
    } else if (!e.complicacao.poderes.length && e.complicacao.troca.length) {
      p.push({ passo: 'complicacao', texto: 'Complicação: falta o poder de complicação (o poder geral só vem em troca dela).' });
    }
    const iniciais = this.#magiasIniciais();
    if (iniciais && e.classe.magias.length < iniciais.total) {
      p.push({ passo: 'classe', texto: `Magias da classe: ${e.classe.magias.length} de ${iniciais.total}.` });
    }
    const saldo = this.#saldo();
    if (saldo.sobra < 0) {
      p.push({
        passo: 'equipamento', bloqueia: true,
        texto: `As compras passam do dinheiro inicial em ${formatarMoedas(-saldo.sobra)}. Tire algum item ou marque-o como recebido.`
      });
    }
    return p;
  }

  /** Alguma pendência impede a criação? (só o dinheiro negativo) */
  #bloqueio() {
    return this.#pendencias().find(p => p.bloqueia) ?? null;
  }

  /* ─── Contexto ─────────────────────────────────────────────────────── */

  async _prepareContext() {
    this.#catalogo ??= await carregarCatalogo();
    if (this.#estado.classe.sel && !this.#infoMagias) await this.#lerClasse();

    const e = this.#estado;
    const passo = e.passo;
    const idx = ETAPAS.findIndex(x => x.id === passo);
    const racial = this.#racial();
    const atrs = atributosDoSistema();

    const ctx = {
      passo,
      etapas: ETAPAS.map((x, i) => ({
        ...x, n: i + 1, ativa: x.id === passo, feita: x.id !== 'resumo' && this.#feita(x.id)
      })),
      primeiro: idx === 0,
      ultimo: idx === ETAPAS.length - 1,
      proximoRotulo: ETAPAS[idx + 1]?.rotulo,
      rodape: {
        atributos: Object.keys(atrs).map(k => ({
          abr: abrevAtr(k),
          total: e.atributos.bases ? sinal((e.atributos.bases[k] ?? 0) + racial[k]) : '–'
        })),
        identidade: [e.raca.sel?.nome, e.classe.sel?.nome].filter(Boolean).join(' · ') || null
      },
      bloqueio: this.#bloqueio()?.texto ?? null,
      ocupado: this.#ocupado
    };

    const prep = {
      atributos: () => this.#ctxAtributos(racial),
      raca: () => this.#ctxRaca(),
      classe: () => this.#ctxClasse(),
      origem: () => this.#ctxOrigem(),
      complicacao: () => this.#ctxComplicacao(),
      divindade: () => this.#ctxDivindade(),
      equipamento: () => this.#ctxEquipamento(),
      resumo: () => this.#ctxResumo(racial)
    }[passo];
    ctx[passo] = await prep();
    if (ctx[passo]) ctx[passo].numero = idx + 1;
    ctx.temSugestoes = !!ctx[passo]?.sugestoes;
    return ctx;
  }

  #ctxAtributos(racial) {
    const e = this.#estado;
    const atrs = atributosDoSistema();
    return {
      metodos: metodosDeAtributos().map(m => ({ ...m, usado: m.key === e.atributos.metodo })),
      definido: !!e.atributos.bases,
      resumo: e.atributos.resumo,
      temRaca: !!e.raca.sel,
      tabela: Object.entries(atrs).map(([k, nome]) => {
        const base = e.atributos.bases?.[k] ?? 0;
        return {
          k, nome, icone: ICONES_ATR[k] ?? 'fa-star',
          base: e.atributos.bases ? sinal(base) : '–',
          racial: racial[k] ? sinal(racial[k]) : '',
          total: e.atributos.bases ? sinal(base + racial[k]) : '–',
          negativo: e.atributos.bases && base + racial[k] < 0
        };
      })
    };
  }

  #ctxPericias(etapa, regra = null) {
    const marcadas = this.#periciasPorEtapa();
    const aqui = new Set(marcadas[etapa]);
    const outras = {};
    for (const [et, lista] of Object.entries(marcadas)) {
      if (et === etapa) continue;
      for (const k of lista) outras[k] = ETAPAS.find(x => x.id === et)?.rotulo;
    }
    const fixas = new Set();
    const grupos = new Set();
    for (const g of regra?.fixas ?? []) {
      if (g.length === 1) fixas.add(g[0]);
      else for (const k of g) grupos.add(k);
    }
    const opcoes = new Set(regra?.opcoes ?? []);
    const oficios = new Set(chavesOficio());
    const atrDe = (k) => CONFIG.T20.pericias[k]?.abl;
    const item = ([k, rotulo]) => ({
      k,
      rotulo: oficios.has(k) ? rotulo.replace(/^Ofício:\s*/, '') : rotulo,
      abr: abrevAtr(atrDe(k) ?? ''),
      marcada: aqui.has(k),
      bloqueada: !aqui.has(k) && !!outras[k],
      deOnde: outras[k] ?? null,
      fixa: fixas.has(k),
      grupo: grupos.has(k),
      opcao: opcoes.has(k),
      apagada: !!regra && !fixas.has(k) && !grupos.has(k) && !opcoes.has(k)
    });
    const todas = Object.entries(rotulosPericias()).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
    const listaOficios = todas.filter(([k]) => oficios.has(k)).map(item);
    return {
      etapa,
      gerais: todas.filter(([k]) => !oficios.has(k)).map(item),
      oficios: listaOficios,
      // Aberto quando há ofício marcado aqui ou quando a classe pede um.
      oficiosAbertos: listaOficios.some(o => o.marcada || o.grupo),
      total: aqui.size
    };
  }

  #zona(id) {
    const z = ZONAS[id];
    const lista = this.#estado[z.etapa][z.chave];
    // Só a lista de equipamento entra no orçamento; os itens da origem são dados.
    const compras = id === 'equipItens' && this.#estado.equipamento.comprar !== false;
    return {
      id, rotulo: z.rotulo,
      itens: lista.map((r, i) => {
        const qtd = r.qtd ?? 1;
        return { ...r, i, qtd, custo: formatarMoedas((Number(r.preco) || 0) * qtd), gratis: !!r.gratis };
      }),
      vazia: !lista.length,
      itensFisicos: TIPOS_EQUIPAMENTO.some(t => z.aceita.includes(t)),
      compras
    };
  }

  /** Lista de cards (raças ou classes) com busca. */
  #grade(lista, tipo) {
    return lista.map(x => ({
      uuid: x.uuid, nome: x.nome, img: x.img, fonte: x.fonte,
      chips: tipo === 'race' ? chipsDeRaca(x.sistema, this.#racasAbertas())
        : [{ texto: `${x.sistema?.pvPorNivel ?? '?'} PV/nv` }, { texto: `${x.sistema?.pmPorNivel ?? '?'} PM/nv` }]
    }));
  }

  /**
   * Sugestões da etapa: abas (agrupadas por `grupo`) e, por aba, filtros
   * opcionais. Cada filtro é `{ id, rotulo, opcoes: [{v, r}], padrao }`; a
   * escolha fica guardada por etapa e aba, e `lista(valores)` a recebe. A
   * lista em si é montada no DOM, de 30 em 30.
   */
  #sugestoes(etapa, abas) {
    const ativa = abas.find(a => a.id === this.#aba[etapa]) ?? abas[0];
    this.#aba[etapa] = ativa.id;
    const chave = `${etapa}:${ativa.id}`;
    const salvos = this.#filtros[chave] ?? {};
    const valores = {};
    for (const f of ativa.filtros ?? []) {
      const v = salvos[f.id];
      valores[f.id] = v !== undefined && f.opcoes.some(o => o.v === v) ? v : (f.padrao ?? '');
    }
    this.#sugestoesAtuais = ativa.lista(valores);

    // Dois níveis: abas com `grupo` viram UMA aba principal (o grupo) e, só
    // quando ela está ativa, uma linha de subabas embaixo. O clique na aba do
    // grupo volta para a última subaba usada nele.
    if (ativa.grupo) this.#ultimaSubaba[`${etapa}:${ativa.grupo}`] = ativa.id;
    const principais = [];
    for (const a of abas) {
      if (!a.grupo) {
        principais.push({ id: a.id, rotulo: a.rotulo, titulo: a.titulo ?? a.rotulo, icone: a.icone ?? null, ativa: a.id === ativa.id });
        continue;
      }
      if (principais.some(p => p.grupo === a.grupo)) continue;
      const doGrupo = abas.filter(x => x.grupo === a.grupo);
      const lembrada = this.#ultimaSubaba[`${etapa}:${a.grupo}`];
      principais.push({
        id: doGrupo.some(x => x.id === lembrada) ? lembrada : doGrupo[0].id,
        grupo: a.grupo, rotulo: a.grupo, titulo: a.grupo, icone: a.iconeGrupo ?? null,
        ativa: ativa.grupo === a.grupo
      });
    }
    const subabas = ativa.grupo
      ? abas.filter(x => x.grupo === ativa.grupo).map(x => ({ id: x.id, rotulo: x.rotulo, ativa: x.id === ativa.id }))
      : null;
    return {
      etapa,
      principais,
      // Com quatro abas ou mais, as inativas mostram só o ícone (o nome fica na dica).
      compacta: principais.length >= 4,
      subabas,
      filtros: (ativa.filtros ?? []).map(f => ({
        id: f.id, rotulo: f.rotulo,
        opcoes: f.opcoes.map(o => ({ ...o, sel: o.v === valores[f.id] }))
      })),
      dica: ativa.dica ?? null,
      busca: this.#busca[`sug-${etapa}`] ?? '',
      niveis: ativa.niveis ? { mostrar: this.#mostrarNiveis } : null,
      acao: ativa.acao ?? null
    };
  }

  #poderes(filtro) {
    return this.#catalogo.poderes.filter(filtro);
  }

  /** As abas de poderes gerais por categoria (Destino, Combate...). */
  #abasGerais() {
    return CATEGORIAS_GERAIS.map(c => ({
      id: `geral-${c.id}`, rotulo: c.rotulo, grupo: 'Gerais', iconeGrupo: 'fa-bolt',
      lista: () => this.#poderes(p => p.tipo === 'geral' && categoriaGeral(p.subtipo) === c.id),
      dica: c.id === 'geral' ? 'Poderes gerais sem categoria (ou de categorias menores, como Montaria e Parceiros).' : null
    }));
  }

  /** Aba "Todos" de poderes, com filtro por tipo e, escolhido o tipo, por subtipo. */
  #abaTodosPoderes() {
    const tipos = Object.entries(CONFIG.T20?.powerType ?? {}).map(([v, r]) => ({ v, r: game.i18n.localize(r) }));
    const tipoSalvo = this.#filtros[`${this.#estado.passo}:todos`]?.tipo ?? '';
    const subtipos = new Map();
    if (tipoSalvo) {
      for (const p of this.#catalogo.poderes) {
        if (p.tipo !== tipoSalvo || !p.subtipo) continue;
        const k = normalizar(p.subtipo);
        if (!subtipos.has(k)) subtipos.set(k, p.subtipo);
      }
    }
    const filtros = [{ id: 'tipo', rotulo: 'Tipo', padrao: '', opcoes: [{ v: '', r: 'Todos os tipos' }, ...tipos] }];
    if (subtipos.size) {
      filtros.push({
        id: 'subtipo', rotulo: 'Subtipo', padrao: '',
        opcoes: [{ v: '', r: 'Todos' }, ...[...subtipos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(s => ({ v: s, r: s }))]
      });
    }
    return {
      id: 'todos', rotulo: 'Todos', icone: 'fa-list', titulo: 'Todos os poderes', filtros,
      lista: (f) => this.#poderes(p => (!f.tipo || p.tipo === f.tipo)
        && (!f.subtipo || normalizar(p.subtipo) === normalizar(f.subtipo)))
    };
  }

  /** Aba de magias com filtros de círculo, tipo e escola. */
  #abaMagias({ circulo = '', tipo = '', dica = null } = {}) {
    const loc = (o) => Object.entries(o ?? {}).map(([v, r]) => ({ v, r: game.i18n.localize(r) }));
    return {
      id: 'magias', rotulo: 'Magias', icone: 'fa-wand-sparkles', dica,
      filtros: [
        { id: 'circulo', rotulo: 'Círculo', padrao: circulo, opcoes: [{ v: '', r: 'Todos' }, ...[1, 2, 3, 4, 5].map(n => ({ v: String(n), r: `${n}º` }))] },
        { id: 'tipo', rotulo: 'Tipo', padrao: tipo, opcoes: [{ v: '', r: 'Todos' }, ...loc(CONFIG.T20?.spellType)] },
        { id: 'escola', rotulo: 'Escola', padrao: '', opcoes: [{ v: '', r: 'Todas' }, ...loc(CONFIG.T20?.spellSchools)] }
      ],
      // Universais servem a arcanos e divinos.
      lista: (f) => this.#catalogo.magias.filter(m => (!f.circulo || String(m.sistema?.circulo) === f.circulo)
        && (!f.tipo || m.sistema?.tipo === f.tipo || (m.sistema?.tipo === 'uni' && ['arc', 'div'].includes(f.tipo)))
        && (!f.escola || m.sistema?.escola === f.escola))
    };
  }

  async #ctxRaca() {
    const e = this.#estado;
    if (!e.raca.sel) {
      return { escolher: true, grade: this.#grade(this.#catalogo.racas, 'race'), busca: this.#busca.grade ?? '' };
    }
    const sel = e.raca.sel;
    const atrs = atributosDoSistema();
    let din = null;
    if (sel.permitidos?.length) {
      const marcados = Object.values(e.raca.escolhidos).filter(v => v).length;
      din = {
        descricao: sel.descDin,
        livre: !sel.regra,
        quantos: sel.regra?.quantos ?? null,
        marcados,
        completo: !!sel.regra && marcados === sel.regra.quantos,
        opcoes: sel.permitidos.map(k => {
          const v = Number(e.raca.escolhidos[k]) || 0;
          return {
            k, nome: atrs[k], abr: abrevAtr(k), valor: v, valorTexto: sinal(v),
            marcado: !!v,
            cheio: !!sel.regra && !v && marcados >= sel.regra.quantos,
            bonus: sel.regra ? sinal(sel.regra.valor) : null
          };
        })
      };
    }
    let aberta = null;
    if (sel.aberta && sel.pecas?.length) {
      const colocados = e.raca.abertos ?? [];
      aberta = {
        completo: sel.pecas.every((_, i) => colocados[i]),
        pecas: sel.pecas.map((v, i) => ({
          i, texto: sinal(v), negativo: v < 0,
          celulas: Object.keys(atrs).map(k => ({
            k, abr: abrevAtr(k), nome: atrs[k],
            marcado: colocados[i] === k,
            // Uma peça por atributo. O bônus à escolha soma por cima: o
            // meio-elfo põe o +1 em Int e ainda escolhe Int nos dois +1.
            ocupado: colocados[i] !== k && colocados.some((c, j) => j !== i && c === k)
          }))
        }))
      };
    }
    return {
      sel: { ...sel, chips: sel.aberta ? chipsDeRaca({ atributos: Object.fromEntries((sel.pecas ?? []).map((v, i) => [i, v])) }, true) : chipsDeRaca({ atributos: sel.fixos }) },
      aberta,
      din,
      zona: this.#zona('racaPoderes'),
      magias: { zona: this.#zona('racaMagias'), dica: 'Se a raça (ou um poder dela) te dá uma magia, solte-a aqui.' },
      pericias: this.#ctxPericias('raca'),
      sugestoes: this.#sugestoes('raca', [
        {
          id: 'raciais', rotulo: 'Raciais', titulo: `Poderes raciais de ${sel.nome}`, icone: 'fa-person',
          lista: () => this.#poderes(p => p.tipo === 'racial' && subtipoDe(p.subtipo, sel.nome)),
          dica: `Poderes raciais de ${sel.nome}. Os que a raça já concede entram sozinhos.`
        },
        ...this.#abasGerais(),
        this.#abaConcedidos(),
        this.#abaTodosPoderes(),
        this.#abaMagias()
      ])
    };
  }

  async #lerClasse() {
    const sel = this.#estado.classe.sel;
    this.#niveis.clear();
    this.#magiasExtras.clear();
    this.#infoMagias = null;
    if (!sel) return;
    this.#catalogo ??= await carregarCatalogo();
    const habilidades = this.#catalogo.poderes.filter(p => p.tipo === 'ability' && subtipoDe(p.subtipo, sel.nome));
    await Promise.all(habilidades.map(async h => {
      try {
        const doc = await fromUuid(h.uuid);
        const desc = doc?.system?.description?.value ?? '';
        this.#niveis.set(h.uuid, nivelDaHabilidade(desc));
        const extras = magiasAdicionaisIniciais(desc);
        if (extras) this.#magiasExtras.set(h.uuid, extras);
        if (/^magias\b/.test(normalizar(h.nome)) && !this.#infoMagias) {
          const info = lerMagiasIniciais(desc);
          if (info.tipo || info.iniciais) this.#infoMagias = { ...info, nome: h.nome, uuid: h.uuid };
        }
      } catch { /* habilidade ilegível: fica como 1º nível */ }
    }));
    this.#infoMagias ??= { tipo: null, iniciais: null };
  }

  /** Magias no 1º nível: base da habilidade "Magias" + extras das habilidades escolhidas (o caminho). */
  #magiasIniciais() {
    const base = this.#infoMagias?.iniciais ?? 0;
    if (!base) return null;
    const extras = this.#estado.classe.poderes
      .filter(r => this.#magiasExtras.get(r.uuid))
      .map(r => ({ nome: r.nome, n: this.#magiasExtras.get(r.uuid) }));
    return { base, extras, total: base + extras.reduce((t, x) => t + x.n, 0) };
  }

  async #ctxClasse() {
    const e = this.#estado;
    if (!e.classe.sel) {
      return { escolher: true, grade: this.#grade(this.#catalogo.classes, 'classe'), busca: this.#busca.grade ?? '' };
    }
    const sel = e.classe.sel;
    const regra = this.#regraClasse();
    const r = rotulosPericias();
    const int = (this.#estado.atributos.bases?.int ?? 0) + this.#racial().int;
    let contagem = null;
    if (regra?.escolha) {
      contagem = {
        feitas: contarEscolhasDaClasse(e.classe.pericias, regra),
        escolha: regra.escolha,
        int: int > 0 ? int : 0
      };
      contagem.completo = contagem.feitas >= contagem.escolha + contagem.int;
    }
    const ou = (regra?.fixas ?? []).filter(g => g.length > 1).map(g => ({
      texto: g.length > 3 ? 'um Ofício' : g.map(k => r[k]).join(' ou '),
      ok: g.some(k => e.classe.pericias.includes(k))
    }));
    const daClasse = (p) => subtipoDe(p.subtipo, sel.nome);
    const info = this.#infoMagias;
    const tipoMagia = info?.tipo ?? '';
    const iniciais = this.#magiasIniciais();
    return {
      sel,
      regra: !!regra,
      inatas: sel.inatas,
      contagem,
      ou,
      zona: this.#zona('classePoderes'),
      magias: {
        zona: this.#zona('classeMagias'),
        info: iniciais ? { ...info, ...iniciais, tipoTexto: tipoMagia === 'arc' ? 'arcanas' : tipoMagia === 'div' ? 'divinas' : '' } : null,
        contagem: iniciais
          ? { feitas: e.classe.magias.length, de: iniciais.total, completo: e.classe.magias.length >= iniciais.total }
          : null,
        dica: info?.iniciais ? null : `${sel.nome} não lança magias no 1º nível — deixe vazio, ou solte aqui uma magia que algum poder te dê.`
      },
      pericias: this.#ctxPericias('classe', regra),
      sugestoes: this.#sugestoes('classe', [
        {
          id: 'habilidades', rotulo: 'Habilidades', icone: 'fa-star', niveis: true,
          lista: () => this.#poderes(p => p.tipo === 'ability' && daClasse(p))
            .map(p => ({ ...p, nivel: this.#niveis.get(p.uuid) ?? 1 }))
            .filter(p => this.#mostrarNiveis || p.nivel <= 1)
            .sort((a, b) => a.nivel - b.nivel || a.nome.localeCompare(b.nome, 'pt-BR')),
          dica: 'Habilidades de 1º nível. Quando a classe pede uma escolha (um Caminho, por exemplo), pegue só a sua.',
          acao: { id: 'habilidadesNivel1', rotulo: 'Adicionar todas as de 1º nível', icone: 'fa-angles-down' }
        },
        this.#abaPoderesDeClasse(sel.nome),
        this.#abaTodosPoderes(),
        this.#abaMagias({
          circulo: info?.iniciais ? '1' : '',
          tipo: tipoMagia,
          dica: info?.iniciais ? `Já filtrado para magias ${tipoMagia === 'arc' ? 'arcanas' : 'divinas'} de 1º círculo, as que ${sel.nome} conhece.` : null
        })
      ])
    };
  }

  /**
   * Poderes de classe, com a classe escolhível: classes variantes (as dos
   * suplementos) usam os poderes de outra classe.
   */
  #abaPoderesDeClasse(nomeDaClasse) {
    const classes = new Map();
    for (const p of this.#catalogo.poderes) {
      if (p.tipo !== 'classe' || !p.subtipo) continue;
      const k = normalizar(p.subtipo);
      if (!classes.has(k)) classes.set(k, p.subtipo);
    }
    const opcoes = [...classes.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(c => ({ v: c, r: c }));
    const propria = opcoes.find(o => subtipoDe(o.v, nomeDaClasse))?.v ?? '';
    return {
      id: 'poderes', rotulo: 'Poderes', icone: 'fa-shield-halved',
      filtros: [{
        id: 'classe', rotulo: 'Da classe', padrao: propria,
        opcoes: [...(propria ? [] : [{ v: '', r: '— escolha —' }]), ...opcoes]
      }],
      lista: (f) => f.classe ? this.#poderes(p => p.tipo === 'classe' && subtipoDe(p.subtipo, f.classe)) : [],
      dica: 'Poderes de classe chegam a partir do 2º nível. Classe variante? Escolha a classe de origem dos poderes.'
    };
  }

  #nomesDeOrigem() {
    const s = new Set();
    for (const p of this.#catalogo.poderes) if (p.tipo === 'origem' && p.subtipo) s.add(p.subtipo);
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  async #ctxOrigem() {
    const e = this.#estado;
    const nome = e.origem.nome?.trim() ?? '';
    const nomes = this.#nomesDeOrigem();
    const conhecida = nomes.find(n => normalizar(n) === normalizar(nome)) ?? null;
    return {
      nome,
      nomes,
      conhecida,
      populares: nome ? [] : nomes,
      zona: this.#zona('origemPoderes'),
      zonaItens: this.#zona('origemItens'),
      dinheiro: e.origem.dinheiro ?? '',
      magias: { zona: this.#zona('origemMagias'), dica: 'Se a origem (ou um poder dela) te dá uma magia, solte-a aqui.' },
      pericias: this.#ctxPericias('origem'),
      sugestoes: this.#sugestoes('origem', [
        {
          id: 'daOrigem', rotulo: 'Origem', titulo: conhecida ? `Poderes de ${conhecida}` : 'Poderes de origem', icone: 'fa-scroll',
          lista: () => this.#poderes(p => p.tipo === 'origem' && (!conhecida || normalizar(p.subtipo) === normalizar(conhecida))),
          dica: conhecida ? 'O poder exclusivo desta origem.' : 'Poderes de origem de todas as origens.'
        },
        ...this.#abasGerais(),
        this.#abaTodosPoderes(),
        this.#abaMagias(),
        { id: 'itens', rotulo: 'Itens', icone: 'fa-sack', lista: () => this.#catalogo.itens, dica: 'Os itens que a origem dá. Solte-os em "Itens da origem".' }
      ])
    };
  }

  /** A regra "Raças Abertas" do sistema está ligada no mundo? */
  #racasAbertas() {
    try { return !!game.settings.get('tormenta20', 'openRaces'); } catch { return false; }
  }

  /** Aba de poderes concedidos com filtro por divindade (maiores e menores). */
  #abaConcedidos(id = 'concedidos', rotulo = 'Concedidos') {
    const outras = this.#outrasDivindades();
    return {
      id, rotulo, icone: id === 'todos' ? 'fa-list' : 'fa-hands-praying', titulo: 'Poderes concedidos, com filtro por divindade',
      filtros: [{
        id: 'deus', rotulo: 'Divindade', padrao: '',
        opcoes: [{ v: '', r: 'Todas' },
          ...DIVINDADES.map(d => ({ v: d.nome, r: d.nome })),
          ...outras.map(d => ({ v: `menor:${d.nome}`, r: `${d.nome} (menor)` }))]
      }],
      lista: (f) => {
        if (!f.deus) return this.#poderes(p => p.tipo === 'concedido');
        const alvo = f.deus.startsWith('menor:') ? { nome: f.deus.slice(6) } : divindadePorNome(f.deus);
        return this.#poderes(p => p.tipo === 'concedido' && concedidoPelaDivindade(p.subtipo, alvo));
      }
    };
  }

  async #ctxComplicacao() {
    return {
      zona: this.#zona('complicacaoPoderes'),
      zonaTroca: this.#zona('complicacaoTroca'),
      sugestoes: this.#sugestoes('complicacao', [
        {
          id: 'complicacoes', rotulo: 'Complicações', icone: 'fa-skull', titulo: 'Poderes de complicação',
          lista: () => this.#poderes(p => p.tipo === 'complicacao'),
          dica: 'Poderes de complicação. Solte o escolhido em "Complicação".'
        },
        ...this.#abasGerais(),
        this.#abaConcedidos(),
        this.#abaTodosPoderes()
      ])
    };
  }

  /** Os deuses menores dos suplementos, lidos dos poderes concedidos. */
  #outrasDivindades() {
    return outrasDivindades(this.#poderes(p => p.tipo === 'concedido').map(p => p.subtipo));
  }

  /** A divindade escrita no campo: uma das vinte, uma menor, ou nenhuma conhecida. */
  #divindadeEscolhida() {
    const nome = this.#estado.divindade.nome?.trim() ?? '';
    const maior = divindadePorNome(nome);
    if (maior) return { ...maior, maior: true };
    const menor = this.#outrasDivindades().find(d => chaveDeNome(d.nome) === chaveDeNome(nome));
    return menor ? { ...menor, maior: false } : null;
  }

  async #ctxDivindade() {
    const e = this.#estado;
    const nome = e.divindade.nome?.trim() ?? '';
    const deus = this.#divindadeEscolhida();
    const outras = this.#outrasDivindades();
    // Abre na aba da divindade escolhida; sem escolha, na que o jogador deixou.
    const aba = deus ? (deus.maior ? 'panteao' : 'outras') : this.#abaDeuses;
    return {
      nome,
      deus,
      aba,
      divindades: DIVINDADES.map(d => ({ ...d, ativa: deus?.maior && deus.nome === d.nome })),
      outras: outras.map(d => ({ ...d, ativa: deus && !deus.maior && chaveDeNome(deus.nome) === chaveDeNome(d.nome) })),
      nomesLista: [...DIVINDADES.map(d => ({ nome: d.nome, extra: d.dominio })), ...outras.map(d => ({ nome: d.nome, extra: d.epiteto ?? '' }))],
      zona: this.#zona('divindadePoderes'),
      magias: { zona: this.#zona('divindadeMagias'), dica: 'Se um poder concedido te dá uma magia, solte-a aqui.' },
      dobro: ['clerigo', 'druida'].some(c => normalizar(e.classe.sel?.nome ?? '').startsWith(c)),
      sugestoes: this.#sugestoes('divindade', [
        {
          id: 'doDeus', rotulo: deus ? deus.nome : 'Concedidos', titulo: deus ? `Poderes de ${deus.nome}` : 'Poderes concedidos', icone: 'fa-sun',
          lista: () => this.#poderes(p => p.tipo === 'concedido' && (!deus || concedidoPelaDivindade(p.subtipo, deus))),
          dica: deus
            ? (deus.maior ? `Poderes de ${deus.nome} (ou do domínio ${deus.dominio}).` : `Poderes de ${deus.nome}${deus.epiteto ? `, ${deus.epiteto}` : ''}.`)
            : 'Escolha uma divindade para filtrar.'
        },
        this.#abaConcedidos('todos', 'Todos'),
        this.#abaMagias()
      ])
    };
  }

  /** Item do catálogo pelo nome exato (sem acento/caixa). */
  #itemPorNome(nome) {
    return this.#catalogo.itens.find(i => normalizar(i.nome) === normalizar(nome)) ?? null;
  }

  /** Armas de uma proficiência que servem de equipamento inicial. */
  #armasIniciais(proficiencia) {
    return this.#catalogo.itens.filter(i => i.type === 'arma' && i.sistema?.proficiencia === proficiencia
      && normalizar(i.nome) !== 'ataque desarmado'
      && (Number(i.sistema?.preco) || 0) <= PRECO_MAX_ARMA_INICIAL);
  }

  /** As vagas do equipamento inicial que existem para este personagem. */
  #vagasEquipamento() {
    const e = this.#estado;
    const prof = e.equipamento.prof ?? {};
    const arcanista = normalizar(e.classe.sel?.nome ?? '').startsWith('arcanista');
    const armaduras = [...ARMADURAS_INICIAIS, ...(prof.pesada ? [ARMADURA_PESADA_INICIAL] : [])];
    return [
      { id: 'kit', rotulo: 'Mochila, saco de dormir e traje de viajante', botao: true, acao: 'kitBasico' },
      {
        id: 'armaSimples', rotulo: 'Uma arma simples', curto: 'Arma simples',
        ajuda: 'Qualquer arma simples. Armas mágicas e superiores ficam de fora.',
        fora: 'não é uma arma simples (ou é mágica/superior). Confira com o Mestre.',
        opcoes: () => this.#armasIniciais('simples')
      },
      prof.marcial ? {
        id: 'armaMarcial', rotulo: 'Uma arma marcial', curto: 'Arma marcial',
        ajuda: 'Qualquer arma marcial (você tem proficiência). Armas mágicas e superiores ficam de fora.',
        fora: 'não é uma arma marcial (ou é mágica/superior). Confira com o Mestre.',
        opcoes: () => this.#armasIniciais('marcial')
      } : null,
      arcanista
        ? { id: 'armadura', rotulo: 'Armadura', nota: 'Arcanistas começam sem armadura.' }
        : {
          id: 'armadura', rotulo: 'Uma armadura', curto: 'Armadura',
          ajuda: `Uma destas: ${armaduras.join(', ')}.${prof.pesada ? '' : ' Com proficiência em armaduras pesadas, também a brunea.'}`,
          fora: `não está entre as armaduras iniciais (${armaduras.join(', ')}). Confira com o Mestre.`,
          opcoes: () => armaduras.map(n => this.#itemPorNome(n)).filter(Boolean)
        },
      prof.escudo && this.#itemPorNome(ESCUDO_INICIAL)
        ? { id: 'escudo', rotulo: 'Um escudo leve', botao: true, acao: 'escudoInicial' }
        : null
    ].filter(Boolean);
  }

  /* ─── Filtros das listas de equipamento ─────────────────────────────── */

  #filtroPreco() {
    const sobra = Math.max(0, this.#saldo().sobra);
    return {
      // Por padrão, até T$ 500: tira da frente os itens mágicos e superiores.
      id: 'preco', rotulo: 'Preço', padrao: '500',
      opcoes: [
        { v: '', r: 'Qualquer' },
        { v: 'saldo', r: `Cabe no meu dinheiro (${formatarMoedas(sobra)})` },
        ...[10, 50, 100, 300, 500, 1000].map(n => ({ v: String(n), r: `Até T$ ${n}` }))
      ]
    };
  }

  #filtroOrdem() {
    return {
      id: 'ordem', rotulo: 'Ordem', padrao: '',
      opcoes: [{ v: '', r: 'Nome' }, { v: 'barato', r: 'Mais barato' }, { v: 'caro', r: 'Mais caro' }]
    };
  }

  /** Aplica os filtros de preço e a ordem a uma lista de itens do catálogo. */
  #precoEOrdem(lista, f) {
    const preco = (i) => Number(i.sistema?.preco) || 0;
    let teto = null;
    if (f.preco === 'saldo') teto = Math.max(0, this.#saldo().sobra);
    else if (f.preco) teto = Number(f.preco);
    let out = teto === null ? lista : lista.filter(i => preco(i) <= teto);
    if (f.ordem === 'barato') out = [...out].sort((a, b) => preco(a) - preco(b) || a.nome.localeCompare(b.nome, 'pt-BR'));
    else if (f.ordem === 'caro') out = [...out].sort((a, b) => preco(b) - preco(a) || a.nome.localeCompare(b.nome, 'pt-BR'));
    return out;
  }

  /** Rótulos de uma tabela do sistema (CONFIG.T20.x), só com as chaves pedidas. */
  #rotulosDe(tabela, chaves) {
    const cfg = CONFIG.T20?.[tabela] ?? {};
    return chaves.map(v => ({ v, r: cfg[v] ? game.i18n.localize(cfg[v]) : v }));
  }

  #abaArmas() {
    const prof = this.#estado.equipamento.prof ?? {};
    return {
      id: 'armas', rotulo: 'Armas', icone: 'fa-khanda',
      filtros: [
        {
          id: 'prof', rotulo: 'Proficiência', padrao: '',
          opcoes: [{ v: '', r: 'Todas' }, { v: 'minhas', r: 'Que sei usar' },
            ...this.#rotulosDe('weaponTypes', ['simples', 'marcial', 'exotica', 'fogo'])]
        },
        {
          id: 'alcance', rotulo: 'Alcance', padrao: '',
          opcoes: [{ v: '', r: 'Todos' }, { v: 'cac', r: 'Corpo a corpo' }, { v: 'dist', r: 'À distância' }]
        },
        {
          id: 'maos', rotulo: 'Empunhadura', padrao: '',
          opcoes: [{ v: '', r: 'Todas' }, { v: 'leve', r: 'Leve' }, { v: 'uma', r: 'Uma mão' }, { v: 'duas', r: 'Duas mãos' }]
        },
        this.#filtroPreco(),
        this.#filtroOrdem()
      ],
      lista: (f) => {
        const minhas = PROFICIENCIAS.filter(p => p.campo === 'profArmas' && prof[p.id]).map(p => p.valor);
        const lista = this.#catalogo.itens.filter(i => {
          if (i.type !== 'arma') return false;
          const s = i.sistema ?? {};
          const pr = s.propriedades ?? {};
          if (f.prof === 'minhas' && !minhas.includes(s.proficiencia)) return false;
          if (f.prof && f.prof !== 'minhas' && s.proficiencia !== f.prof) return false;
          const distancia = !!(pr.ataqueDistancia || pr.dst);
          if (f.alcance === 'cac' && distancia) return false;
          if (f.alcance === 'dist' && !distancia) return false;
          const maos = pr.duasMaos ? 'duas' : pr.leve ? 'leve' : 'uma';
          if (f.maos && maos !== f.maos) return false;
          return true;
        });
        return this.#precoEOrdem(lista, f);
      }
    };
  }

  #abaEquipamentos() {
    const prof = this.#estado.equipamento.prof ?? {};
    const tipos = ['leve', 'pesada', 'escudo', 'traje', 'acessorio', 'ferramenta', 'esoterico'];
    return {
      id: 'equip', rotulo: 'Equipamento', icone: 'fa-shirt',
      filtros: [
        {
          id: 'tipo', rotulo: 'Tipo', padrao: '',
          opcoes: [{ v: '', r: 'Todos' }, { v: 'armaduras', r: 'Armaduras e escudos' },
            { v: 'minhas', r: 'Armaduras que sei usar' }, ...this.#rotulosDe('armorTypes', tipos)]
        },
        this.#filtroPreco(),
        this.#filtroOrdem()
      ],
      lista: (f) => {
        const sei = { leve: !!prof.leve, pesada: !!prof.pesada, escudo: !!prof.escudo };
        const lista = this.#catalogo.itens.filter(i => {
          if (i.type !== 'equipamento') return false;
          const t = i.tipo;
          if (f.tipo === 'armaduras') return ['leve', 'pesada', 'escudo'].includes(t);
          if (f.tipo === 'minhas') return !!sei[t];
          return !f.tipo || t === f.tipo;
        });
        return this.#precoEOrdem(lista, f);
      }
    };
  }

  #abaConsumiveis() {
    const tipos = { potion: 'Poção', alchemy: 'Alquímico', ammo: 'Munição', food: 'Comida', material: 'Material' };
    return {
      id: 'consumiveis', rotulo: 'Consumíveis', icone: 'fa-flask',
      filtros: [
        { id: 'tipo', rotulo: 'Tipo', padrao: '', opcoes: [{ v: '', r: 'Todos' }, ...Object.entries(tipos).map(([v, r]) => ({ v, r }))] },
        this.#filtroPreco(),
        this.#filtroOrdem()
      ],
      lista: (f) => this.#precoEOrdem(this.#catalogo.itens.filter(i => i.type === 'consumivel' && (!f.tipo || i.tipo === f.tipo)), f)
    };
  }

  async #ctxEquipamento() {
    const e = this.#estado;
    const eq = e.equipamento;
    let formula = '4d6';
    try { formula = game.settings.get(MODULE_ID, 'criacaoDinheiroInicial') || ''; } catch { /* sem configuração */ }
    const de = (tipos) => () => this.#catalogo.itens.filter(i => tipos.includes(i.type));
    const prof = eq.prof ?? {};
    const naVaga = (id) => eq.itens.find(r => r.vaga === id) ?? null;
    const kitPronto = KIT_BASICO.every(n => eq.itens.some(r => normalizar(r.nome) === normalizar(n)));
    const todas = this.#vagasEquipamento();
    // A vaga ativa deixa de existir se a proficiência dela foi desmarcada.
    if (this.#vagaAtiva && !todas.some(v => v.id === this.#vagaAtiva && v.opcoes)) this.#vagaAtiva = null;
    const vagas = todas.map(v => {
      const item = naVaga(v.id);
      return {
        id: v.id, rotulo: v.rotulo, nota: v.nota ?? null, ajuda: v.ajuda ?? null,
        botao: !!v.botao, acao: v.acao ?? null,
        feito: v.id === 'kit' ? kitPronto : !!item,
        escolha: !!v.opcoes,
        item: item ? { ...item, i: eq.itens.indexOf(item), aviso: this.#foraDaVaga(v, item) } : null,
        ativa: this.#vagaAtiva === v.id
      };
    });
    const ativa = todas.find(v => v.id === this.#vagaAtiva);
    // Sem vaga ativa, a aba dela some; a lista volta para as armas.
    if (!ativa && this.#aba.equipamento === 'vaga') this.#aba.equipamento = 'armas';
    const saldo = this.#saldo();
    return {
      zona: this.#zona('equipItens'),
      // Só para ver: o que a origem dá, editado na etapa Origem.
      daOrigem: {
        itens: e.origem.itens.map(r => ({ ...r, qtd: r.qtd > 1 ? r.qtd : null })),
        dinheiro: Number(e.origem.dinheiro) > 0 ? formatarMoedas(e.origem.dinheiro) : null,
        nome: e.origem.nome?.trim() || null
      },
      dinheiro: eq.dinheiro,
      comprar: eq.comprar !== false,
      // Para mostrar: até duas casas e vírgula (a conta em si é feita em #saldo).
      saldo: {
        inicial: formatarMoedas(saldo.inicial), gasto: formatarMoedas(saldo.gasto), sobra: formatarMoedas(saldo.sobra),
        daOrigem: saldo.daOrigem ? formatarMoedas(saldo.daOrigem) : null, negativo: saldo.sobra < 0
      },
      profs: PROFICIENCIAS.map(p => ({ ...p, marcada: !!prof[p.id] })),
      vagas,
      formula,
      sugestoes: this.#sugestoes('equipamento', [
        ...(ativa ? [{
          id: 'vaga', rotulo: ativa.curto, icone: 'fa-campground', titulo: `Equipamento inicial: ${ativa.curto}`,
          lista: ativa.opcoes,
          dica: `Escolhendo: ${ativa.rotulo.toLowerCase()}. Clique em + (ou dê dois cliques) para pôr na vaga — sem gastar dinheiro.`
        }] : []),
        this.#abaArmas(),
        this.#abaEquipamentos(),
        this.#abaConsumiveis(),
        // Muitos itens gerais (mochila, saco de dormir, ferramentas) estão como "tesouro" no sistema.
        {
          id: 'tesouros', rotulo: 'Tesouros', icone: 'fa-gem', titulo: 'Tesouros e itens gerais',
          filtros: [this.#filtroPreco(), this.#filtroOrdem()],
          lista: (f) => this.#precoEOrdem(this.#catalogo.itens.filter(i => i.type === 'tesouro'), f)
        }
      ])
    };
  }

  /** Entrada do catálogo pelo uuid (para ícone, círculo, espaços…). */
  #doCatalogo(uuid) {
    if (!this.#indiceUuid) {
      this.#indiceUuid = new Map();
      for (const lista of Object.values(this.#catalogo ?? {})) for (const x of lista) this.#indiceUuid.set(x.uuid, x);
    }
    return this.#indiceUuid.get(uuid) ?? null;
  }

  async #ctxResumo(racial) {
    const e = this.#estado;
    const r = rotulosPericias();
    const atrs = atributosDoSistema();
    const loc = (tabela, chave) => { const v = CONFIG.T20?.[tabela]?.[chave]; return v ? game.i18n.localize(v) : null; };

    // Atributos: total em destaque, a conta embaixo.
    const atributos = Object.entries(atrs).map(([k, nome]) => {
      const base = e.atributos.bases?.[k] ?? 0;
      const total = base + racial[k];
      return {
        abr: abrevAtr(k), nome, icone: ICONES_ATR[k] ?? 'fa-star',
        definido: !!e.atributos.bases,
        total: e.atributos.bases ? sinal(total) : '–',
        tom: !e.atributos.bases ? '' : total > 0 ? 'pos' : total < 0 ? 'neg' : '',
        conta: e.atributos.bases && racial[k] ? `${sinal(base)} base ${racial[k] > 0 ? '+' : '−'} ${Math.abs(racial[k])} raça` : null
      };
    });

    // Selos de identidade.
    const selos = [
      e.raca.sel && { tom: 'raca', icone: 'fa-person', img: e.raca.sel.img, texto: e.raca.sel.nome, rotulo: 'Raça' },
      e.classe.sel && { tom: 'classe', icone: 'fa-shield-halved', img: e.classe.sel.img, texto: `${e.classe.sel.nome} 1`, rotulo: 'Classe' },
      e.origem.nome?.trim() && { tom: 'origem', icone: 'fa-scroll', texto: e.origem.nome.trim(), rotulo: 'Origem' },
      e.complicacao.poderes.length && { tom: 'complicacao', icone: 'fa-skull', texto: e.complicacao.poderes.map(p => p.nome).join(', '), rotulo: 'Complicação' },
      e.divindade.nome?.trim() && { tom: 'divindade', icone: 'fa-sun', texto: e.divindade.nome.trim(), rotulo: 'Devoto de' }
    ].filter(Boolean);

    // Poderes agrupados por onde vieram.
    const poder = (p, extra = null) => ({ uuid: p.uuid, nome: p.nome, img: p.img, extra });
    const gruposPoderes = [
      { tom: 'raca', icone: 'fa-person', rotulo: e.raca.sel ? `Raça · ${e.raca.sel.nome}` : 'Raça', itens: e.raca.poderes.map(p => poder(p)) },
      { tom: 'classe', icone: 'fa-shield-halved', rotulo: e.classe.sel ? `Classe · ${e.classe.sel.nome}` : 'Classe', itens: e.classe.poderes.map(p => poder(p)) },
      { tom: 'origem', icone: 'fa-scroll', rotulo: e.origem.nome?.trim() ? `Origem · ${e.origem.nome.trim()}` : 'Origem', itens: e.origem.poderes.map(p => poder(p)) },
      { tom: 'complicacao', icone: 'fa-skull', rotulo: 'Complicação', itens: [...e.complicacao.poderes.map(p => poder(p, 'complicação')), ...e.complicacao.troca.map(p => poder(p, 'em troca'))] },
      { tom: 'divindade', icone: 'fa-sun', rotulo: e.divindade.nome?.trim() ? `Divindade · ${e.divindade.nome.trim()}` : 'Divindade', itens: e.divindade.poderes.map(p => poder(p)) }
    ].filter(g => g.itens.length);

    // Magias, com círculo, tipo e escola (quando o catálogo conhece a magia).
    const magiasDe = (lista, tom, rotulo) => lista.map(m => {
      const s = this.#doCatalogo(m.uuid)?.sistema ?? {};
      return {
        uuid: m.uuid, nome: m.nome, img: m.img, tom, rotulo,
        circulo: s.circulo ? `${s.circulo}º` : null,
        detalhe: [loc('spellType', s.tipo), loc('spellSchools', s.escola)].filter(Boolean).join(' · ')
      };
    });
    const magias = [
      ...magiasDe(e.raca.magias, 'raca', 'Raça'), ...magiasDe(e.classe.magias, 'classe', 'Classe'),
      ...magiasDe(e.origem.magias, 'origem', 'Origem'), ...magiasDe(e.divindade.magias, 'divindade', 'Divindade')
    ];

    // Perícias, cada uma com a cor da etapa que a deu.
    const de = { raca: 'Raça', classe: 'Classe', origem: 'Origem' };
    const pericias = Object.entries(this.#periciasPorEtapa())
      .flatMap(([etapa, lista]) => lista.map(k => ({ rotulo: r[k], tom: etapa, de: de[etapa] })))
      .filter(p => p.rotulo)
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

    // Equipamento: o da origem e o do equipamento, numa tabela só.
    const saldo = this.#saldo();
    const comprar = e.equipamento.comprar !== false;
    let espacosTotal = 0;
    const linhaItem = (it, daOrigem) => {
      const s = this.#doCatalogo(it.uuid)?.sistema ?? {};
      const qtd = Math.max(1, Number(it.qtd) || 1);
      const esp = (Number(s.espacos) || 0) * qtd;
      espacosTotal += esp;
      const gratis = daOrigem || it.gratis || !comprar;
      return {
        uuid: it.uuid, nome: it.nome, img: it.img, qtd,
        espacos: esp ? formatarTibares(esp) : '—',
        situacao: daOrigem ? 'origem' : gratis ? 'recebido' : 'comprado',
        preco: gratis ? null : formatarMoedas((Number(it.preco) || 0) * qtd)
      };
    };
    const equipamento = [...e.origem.itens.map(it => linhaItem(it, true)), ...e.equipamento.itens.map(it => linhaItem(it, false))];

    const substitui = [
      e.raca.sel && this.actor.items.some(i => i.type === 'race') ? 'raça' : null,
      e.classe.sel && this.actor.items.some(i => i.type === 'classe') ? 'classe' : null
    ].filter(Boolean);
    const pendencias = this.#pendencias();
    return {
      ficha: e.ficha,
      selos,
      atributos,
      atributosDefinidos: !!e.atributos.bases,
      gruposPoderes,
      totalPoderes: gruposPoderes.reduce((t, g) => t + g.itens.length, 0),
      magias,
      pericias,
      proficiencias: PROFICIENCIAS.filter(p => e.equipamento.prof?.[p.id]).map(p => p.rotulo),
      equipamento,
      espacosTotal: formatarTibares(espacosTotal),
      dinheiro: {
        sobra: formatarMoedas(Math.max(0, saldo.sobra)),
        negativo: saldo.sobra < 0,
        gasto: comprar && saldo.gasto ? formatarMoedas(saldo.gasto) : null
      },
      pendencias,
      bloqueio: pendencias.some(p => p.bloqueia),
      substitui: substitui.length ? substitui.join(' e ') : null
    };
  }

  /* ─── Render ───────────────────────────────────────────────────────── */

  /** Arrastar e soltar: no elemento da janela, que sobrevive aos re-renders —
   *  por isso uma vez só, aqui, e não a cada render. */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    const el = this.element;
    const limpar = () => el.querySelectorAll('.t20g-cc-zona--alvo').forEach(z => z.classList.remove('t20g-cc-zona--alvo'));
    el.addEventListener('dragover', ev => {
      ev.preventDefault();
      const alvo = ev.target.closest?.('[data-zona]');
      if (alvo?.classList.contains('t20g-cc-zona--alvo')) return;
      limpar();
      alvo?.classList.add('t20g-cc-zona--alvo');
    });
    el.addEventListener('dragleave', ev => { if (!el.contains(ev.relatedTarget)) limpar(); });
    el.addEventListener('drop', ev => this.#onSoltar(ev));
  }

  #passoRenderizado = null;

  async _onRender(context, options) {
    await super._onRender(context, options);
    const el = this.element;

    // Etapa nova começa do topo; a mesma etapa mantém a rolagem.
    if (this.#passoRenderizado !== this.#estado.passo) {
      this.#passoRenderizado = this.#estado.passo;
      const principal = el.querySelector('.t20g-cc-principal');
      if (principal) principal.scrollTop = 0;
    }

    // Busca da grade de raças/classes: filtra no DOM, sem re-render.
    const buscaGrade = el.querySelector('input[data-busca="grade"]');
    if (buscaGrade) {
      const filtrar = () => {
        const q = normalizar(buscaGrade.value);
        this.#busca.grade = buscaGrade.value;
        el.querySelectorAll('.t20g-cc-card[data-nome]').forEach(c => {
          c.hidden = !!q && !normalizar(c.dataset.nome).includes(q);
        });
      };
      buscaGrade.addEventListener('input', filtrar);
      filtrar();
    }

    // Lista de sugestões: montada aqui (pode ter milhares de entradas).
    const lista = el.querySelector('.t20g-cc-sug-lista');
    if (lista) {
      const busca = el.querySelector('input[data-busca="sugestoes"]');
      const montar = () => this.#montarSugestoes(lista, busca?.value ?? '');
      busca?.addEventListener('input', () => {
        this.#busca[`sug-${this.#estado.passo}`] = busca.value;
        montar();
      });
      montar();
    }

    // Filtros das abas de sugestões ("Todos", "Magias", "Poderes" da classe).
    el.querySelectorAll('select[data-filtro]').forEach(sel => sel.addEventListener('change', () => {
      const chave = `${this.#estado.passo}:${this.#aba[this.#estado.passo]}`;
      this.#filtros[chave] = { ...(this.#filtros[chave] ?? {}), [sel.dataset.filtro]: sel.value };
      // Trocar o tipo zera o subtipo, que dependia dele.
      if (sel.dataset.filtro === 'tipo') delete this.#filtros[chave].subtipo;
      this.render();
    }));

    // Escolhas do equipamento inicial (arma simples, marcial, armadura).
    el.querySelectorAll('select[data-vaga]').forEach(sel => sel.addEventListener('change', () => this.#onVaga(sel.dataset.vaga, sel.value)));

    // Campos de texto que mudam o estado.
    el.querySelectorAll('[data-campo]').forEach(inp => {
      inp.addEventListener('change', () => this.#onCampo(inp));
    });

    if (this.#focarBusca) {
      this.#focarBusca = false;
      el.querySelector('input[data-busca="sugestoes"]')?.focus();
    }

    // Descrições sob o cursor.
    el.querySelectorAll('[data-desc]').forEach(n => n.addEventListener('pointerenter', () => this.#descricao(n), { once: true }));
  }

  /**
   * Monta a lista de sugestões: os primeiros 30 e, conforme a lista rola
   * perto do fim, mais 30 — milhares de poderes não viram milhares de nós de
   * uma vez.
   */
  #montarSugestoes(lista, consulta) {
    const q = normalizar(consulta);
    const todos = this.#sugestoesAtuais;
    const filtrados = q ? todos.filter(x => normalizar(x.nome).includes(q) || normalizar(x.subtipo).includes(q)) : todos;
    // A MESMA lista (etapa, aba, filtros e busca iguais) redesenhada — depois
    // de adicionar um item, por exemplo — volta com o que já estava carregado
    // e na mesma rolagem. Só uma lista diferente começa do topo.
    const etapa = this.#estado.passo;
    const aba = this.#aba[etapa];
    const chave = JSON.stringify([etapa, aba, q, this.#filtros[`${etapa}:${aba}`] ?? {}, this.#vagaAtiva]);
    const anterior = this.#rolagemLista?.chave === chave ? this.#rolagemLista : null;
    this.#rolagemLista = { chave, mostrados: 0, topo: 0 };
    lista.innerHTML = '';
    lista.scrollTop = 0;
    if (!filtrados.length) {
      lista.innerHTML = `<li class="t20g-vazio t20g-cc-sug-vazio"><i class="fa-solid fa-magnifying-glass"></i><span class="t20g-vazio__texto">${todos.length ? 'Nada com esse nome.' : 'Nada nas fontes ligadas para esta lista.'}</span></li>`;
      return;
    }
    let mostrados = 0;
    const mais = () => {
      if (mostrados >= filtrados.length) return;
      this.#anexarSugestoes(lista, filtrados.slice(mostrados, mostrados + LOTE_SUGESTOES));
      mostrados += LOTE_SUGESTOES;
      this.#rolagemLista.mostrados = mostrados;
      lista.querySelector('.t20g-cc-sug-mais')?.remove();
      if (mostrados < filtrados.length) {
        lista.insertAdjacentHTML('beforeend', `<li class="t20g-cc-sug-mais"><i class="fa-solid fa-ellipsis"></i> ${filtrados.length - mostrados} a mais — role para ver</li>`);
      }
    };
    mais();
    while (anterior && mostrados < Math.min(anterior.mostrados, filtrados.length)) mais();
    if (anterior) {
      lista.scrollTop = anterior.topo;
      this.#rolagemLista.topo = lista.scrollTop;
    }
    // A lista é trocada inteira a cada montagem, mas o <ul> é o mesmo até o
    // próximo render: o ouvinte antigo sai antes de o novo entrar.
    if (lista._t20gRolar) lista.removeEventListener('scroll', lista._t20gRolar);
    lista._t20gRolar = () => {
      this.#rolagemLista.topo = lista.scrollTop;
      if (lista.scrollTop + lista.clientHeight >= lista.scrollHeight - 120) mais();
    };
    lista.addEventListener('scroll', lista._t20gRolar, { passive: true });
  }

  #anexarSugestoes(lista, itens) {
    const usados = new Set();
    for (const z of Object.values(ZONAS)) for (const r of this.#estado[z.etapa][z.chave]) usados.add(r.uuid);
    const esc = foundry.utils.escapeHTML;
    const html = itens.map(x => {
      const sub = this.#linhaDeApoio(x);
      const nivel = x.nivel > 1 ? `<span class="t20g-chip t20g-cc-nivel">${x.nivel}º nv</span>` : '';
      const usado = usados.has(x.uuid);
      return `<li class="t20g-cc-sug ${usado ? 't20g-cc-sug--usada' : ''}" draggable="true" data-uuid="${esc(x.uuid)}" data-desc="${esc(x.uuid)}">
        <img src="${esc(x.img)}" alt="" loading="lazy">
        <span class="t20g-cc-sug-texto"><b>${esc(x.nome)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>
        ${nivel}
        ${usado
          ? '<i class="fa-solid fa-check t20g-cc-sug-ok" data-tooltip="Já escolhido"></i>'
          : `<button type="button" class="t20g-btn t20g-btn--icone t20g-btn--fantasma" data-action="adicionar" data-uuid="${esc(x.uuid)}" data-tooltip="Adicionar"><i class="fa-solid fa-plus"></i></button>`}
      </li>`;
    }).join('');
    const molde = document.createElement('template');
    molde.innerHTML = html;
    for (const li of molde.content.querySelectorAll('.t20g-cc-sug')) {
      li.addEventListener('dragstart', ev => {
        ev.dataTransfer.setData('text/plain', JSON.stringify({ type: 'Item', uuid: li.dataset.uuid }));
      });
      li.addEventListener('dblclick', () => this.#adicionarPorUuid(li.dataset.uuid));
      li.addEventListener('pointerenter', () => this.#descricao(li), { once: true });
    }
    const marcador = lista.querySelector('.t20g-cc-sug-mais');
    if (marcador) marcador.before(molde.content);
    else lista.append(molde.content);
  }

  /** A linha pequena sob o nome na lista de sugestões. */
  #linhaDeApoio(x) {
    const s = x.sistema ?? {};
    const partes = [];
    if (x.type === 'magia') {
      const tipo = CONFIG.T20?.spellType?.[s.tipo];
      const escola = CONFIG.T20?.spellSchools?.[s.escola];
      if (s.circulo) partes.push(`${s.circulo}º círculo`);
      if (tipo) partes.push(game.i18n.localize(tipo));
      if (escola) partes.push(game.i18n.localize(escola));
    } else if (TIPOS_EQUIPAMENTO.includes(x.type)) {
      if (Number(s.preco) > 0) partes.push(formatarMoedas(s.preco));
      if (Number(s.espacos) > 0) partes.push(`${s.espacos} esp.`);
    } else if (x.subtipo) {
      partes.push(x.subtipo);
    }
    if (x.fonte) partes.push(x.fonte);
    return partes.join(' · ');
  }

  /** Tooltip com a descrição do item, carregada na primeira passada do cursor. */
  async #descricao(el) {
    const uuid = el.dataset.desc;
    if (!uuid || el.dataset.tooltipHtml) return;
    const doc = await fromUuid(uuid).catch(() => null);
    if (!doc) return;
    const desc = await TextEditorImpl().enrichHTML(doc.system?.description?.value ?? '', { secrets: false });
    const html = `<div class="t20g-cc-dica"><h4>${foundry.utils.escapeHTML(doc.name)}</h4>${desc || '<p><em>Sem descrição.</em></p>'}</div>`;
    el.dataset.tooltipHtml = html;
    el.dataset.tooltipDirection = el.closest('.t20g-cc-sugestoes') ? 'LEFT' : 'UP';
    el.dataset.tooltipClass = 't20g-cc-tooltip';
    if (el.matches(':hover')) game.tooltip.activate(el, { html, direction: el.dataset.tooltipDirection, cssClass: 't20g-cc-tooltip' });
  }

  /* ─── Entradas ─────────────────────────────────────────────────────── */

  #onCampo(inp) {
    const e = this.#estado;
    const v = inp.value;
    switch (inp.dataset.campo) {
      case 'origem': e.origem.nome = v; break;
      case 'divindade': e.divindade.nome = v; break;
      case 'dinheiro': e.equipamento.dinheiro = v === '' ? '' : Math.max(0, Math.floor(Number(v) || 0)); break;
      case 'origemDinheiro': e.origem.dinheiro = v === '' ? '' : Math.max(0, Math.floor(Number(v) || 0)); break;
      case 'nome': e.ficha.nome = v; break;
      default: return;
    }
    // O `change` dispara no mousedown de um botão fora do campo: re-renderizar
    // agora trocaria o botão no meio do clique, e o clique se perderia
    // ("Próximo" logo depois de digitar a origem). O estado já está salvo;
    // o desenho espera o clique terminar.
    this.#salvar();
    setTimeout(() => { if (this.rendered) this.render(); }, 180);
  }

  async #onSoltar(ev) {
    ev.preventDefault();
    this.element.querySelectorAll('.t20g-cc-zona--alvo').forEach(z => z.classList.remove('t20g-cc-zona--alvo'));
    const dados = TextEditorImpl().getDragEventData(ev);
    if (dados?.type !== 'Item') return;
    let item;
    try { item = await Item.implementation.fromDropData(dados); } catch { item = null; }
    if (!item) return;
    const zona = ev.target.closest?.('[data-zona]')?.dataset.zona ?? null;
    await this.#adicionar(item, zona);
  }

  async #adicionarPorUuid(uuid) {
    const item = await fromUuid(uuid).catch(() => null);
    if (item) await this.#adicionar(item, null);
  }

  /** Coloca um item arrastado/sugerido no lugar certo da etapa. */
  async #adicionar(item, zonaPedida) {
    const e = this.#estado;
    // Equipamento inicial: soltar numa vaga, ou "+" com a aba da vaga ativa.
    const vaga = zonaPedida?.startsWith('vaga-') ? zonaPedida.slice(5)
      : (!zonaPedida && e.passo === 'equipamento' && this.#vagaAtiva && this.#aba.equipamento === 'vaga') ? this.#vagaAtiva
        : null;
    if (vaga) return this.#porNaVaga(vaga, item);
    if (item.type === 'race') return this.#selecionarRaca(item);
    if (item.type === 'classe') return this.#selecionarClasse(item);

    let zona = zonaPedida && ZONAS[zonaPedida]?.aceita.includes(item.type) ? zonaPedida : null;
    // Na etapa Complicação, poder de complicação vai para a zona dela; o resto
    // é o poder geral recebido em troca.
    if (!zona && e.passo === 'complicacao' && item.type === 'poder') {
      zona = item.system?.tipo === 'complicacao' ? 'complicacaoPoderes' : 'complicacaoTroca';
    }
    if (!zona) {
      const padrao = ZONA_PADRAO[e.passo] ?? {};
      if (item.type === 'poder') zona = padrao.poder ?? null;
      // Magia fora das etapas que têm magias vai para a da classe.
      else if (item.type === 'magia') zona = padrao.magia ?? 'classeMagias';
      else if (TIPOS_EQUIPAMENTO.includes(item.type)) zona = padrao.item ?? 'equipItens';
    }
    if (!zona) {
      return ui.notifications.warn(item.type === 'poder'
        ? 'Poderes entram nas etapas Raça, Classe, Origem e Divindade.'
        : `O assistente não usa itens do tipo "${item.type}".`);
    }
    const z = ZONAS[zona];
    const lista = e[z.etapa][z.chave];
    const fisico = TIPOS_EQUIPAMENTO.includes(item.type);
    // Item físico só soma quantidade se for o MESMO item: dois "Bálsamo restaurador"
    // de fontes diferentes são itens diferentes. Poder repetido pelo nome é o mesmo poder.
    const existente = lista.find(r => r.uuid === item.uuid || (!fisico && r.nome === item.name && r.type === item.type));
    if (existente) {
      if (fisico) existente.qtd = (existente.qtd ?? 1) + 1;
      else return ui.notifications.info(`${item.name} já está em ${z.rotulo}.`);
    } else {
      if (!fisico) {
        const outra = Object.entries(ZONAS).find(([id, oz]) => id !== zona
          && e[oz.etapa][oz.chave].some(r => r.nome === item.name && r.type === item.type));
        if (outra) ui.notifications.info(`${item.name} também está em ${outra[1].rotulo}.`);
      }
      // No equipamento, o que entra pela lista ou arrastado é compra (paga
      // com o dinheiro inicial); o jogador marca "recebido" se ganhou.
      const gratis = zona === 'equipItens' ? e.equipamento.comprar === false : undefined;
      lista.push({ ...ref(item), ...(fisico ? { qtd: 1 } : {}), ...(gratis !== undefined ? { gratis } : {}) });
    }
    if (z.etapa !== e.passo) ui.notifications.info(`${item.name} foi para ${z.rotulo}.`);
    this.#mudou();
  }

  async #selecionarRaca(doc) {
    if (doc.type !== 'race') return;
    const s = doc.system;
    const atrs = Object.keys(atributosDoSistema());
    const abertas = !!game.settings.get('tormenta20', 'openRaces');
    let din = s.atributosDinamicos?.value ? [...s.atributosDinamicos.value] : [];
    const zeros = Object.fromEntries(atrs.map(k => [k, 0]));
    // Raças Abertas (variante do Heróis de Arton): os modificadores fixos
    // viram peças que o jogador põe onde quiser; os dinâmicos seguem iguais.
    const pecas = abertas ? modificadoresAbertos(s.atributos) : [];
    // O "+1 em dois outros atributos" exclui os da raça (Int, no meio-elfo);
    // com as peças soltas essa exclusão perde o sentido, então eles voltam.
    if (abertas && din.length) {
      const daRaca = Object.keys(s.atributos ?? {}).filter(k => Number(s.atributos[k]));
      din = atrs.filter(k => din.includes(k) || daRaca.includes(k));
    }
    const sel = {
      uuid: doc.uuid, nome: doc.name, img: doc.img,
      aberta: abertas, pecas,
      fixos: abertas ? zeros : { ...zeros, ...s.atributos },
      permitidos: din,
      regra: regraDaRaca(din, s.atributosDinamicos?.description),
      descDin: din.length ? s.atributosDinamicos?.description ?? '' : ''
    };
    // Os poderes que a raça concede entram já escolhidos, como o sistema faria.
    const poderes = [];
    for (const grant of s.grants ?? []) {
      for (const escolha of grant.choices ?? []) {
        const p = await fromUuid(escolha.uuid).catch(() => null);
        if (p && !poderes.some(x => x.uuid === p.uuid)) poderes.push(ref(p));
      }
    }
    this.#estado.raca = { sel, escolhidos: {}, abertos: pecas.map(() => ''), poderes, magias: this.#estado.raca.magias ?? [], pericias: this.#estado.raca.pericias ?? [] };
    this.#estado.passo = 'raca';
    this.#passoRenderizado = null;
    this.#mudou();
  }

  async #selecionarClasse(doc) {
    if (doc.type !== 'classe') return;
    const s = doc.system;
    const sel = {
      uuid: doc.uuid, nome: doc.name, img: doc.img,
      pv: s.pvPorNivel, pm: s.pmPorNivel,
      inatas: s.pericias?.inatas ?? '', numero: s.pericias?.numero ?? 0
    };
    this.#estado.classe = { sel, poderes: [], magias: this.#estado.classe.magias ?? [], pericias: [] };
    // As perícias fixas (sem "ou") já entram marcadas.
    const regra = this.#regraClasse();
    const outras = new Set([...this.#estado.raca.pericias, ...this.#estado.origem.pericias]);
    for (const g of regra?.fixas ?? []) if (g.length === 1 && !outras.has(g[0])) this.#estado.classe.pericias.push(g[0]);
    this.#estado.passo = 'classe';
    this.#passoRenderizado = null;
    this.#mostrarNiveis = false;
    await this.#lerClasse();
    this.#mudou();
  }

  /* ─── Ações ────────────────────────────────────────────────────────── */

  #irPara(passo) {
    if (!ETAPAS.some(x => x.id === passo)) return;
    this.#estado.passo = passo;
    this.#mudou();
  }

  static #onPasso(ev, btn) { this.#irPara(btn.dataset.passo); }

  static #onProximo() {
    const i = ETAPAS.findIndex(x => x.id === this.#estado.passo);
    if (i < ETAPAS.length - 1) this.#irPara(ETAPAS[i + 1].id);
  }

  static #onAnterior() {
    const i = ETAPAS.findIndex(x => x.id === this.#estado.passo);
    if (i > 0) this.#irPara(ETAPAS[i - 1].id);
  }

  static async #onMetodo(ev, btn) {
    const r = await escolherAtributos(this.actor, btn.dataset.metodo);
    if (!r) return;
    this.#estado.atributos = { metodo: btn.dataset.metodo, bases: r.bases, resumo: r.resumo };
    this.#mudou();
  }

  static async #onEscolherRaca(ev, btn) {
    const doc = await fromUuid(btn.dataset.uuid).catch(() => null);
    if (doc) await this.#selecionarRaca(doc);
  }

  static #onTrocarRaca() {
    this.#passoRenderizado = null;
    this.#estado.raca = { sel: null, escolhidos: {}, poderes: [], magias: this.#estado.raca.magias, pericias: this.#estado.raca.pericias };
    this.#busca.grade = '';
    this.#mudou();
  }

  static async #onEscolherClasse(ev, btn) {
    const doc = await fromUuid(btn.dataset.uuid).catch(() => null);
    if (doc) await this.#selecionarClasse(doc);
  }

  static #onTrocarClasse() {
    this.#passoRenderizado = null;
    this.#estado.classe = { sel: null, poderes: [], magias: this.#estado.classe.magias ?? [], pericias: [] };
    this.#infoMagias = null;
    this.#niveis.clear();
    this.#busca.grade = '';
    this.#mudou();
  }

  static #onDinamico(ev, btn) {
    const sel = this.#estado.raca.sel;
    if (!sel?.regra) return;
    const k = btn.dataset.attr;
    const esc = this.#estado.raca.escolhidos;
    if (esc[k]) delete esc[k];
    else {
      if (Object.values(esc).filter(v => v).length >= sel.regra.quantos) {
        return ui.notifications.warn(`A raça permite ${sel.regra.quantos} atributo(s). Desmarque um antes.`);
      }
      esc[k] = sel.regra.valor;
    }
    this.#mudou();
  }

  /**
   * Raças Abertas: põe a peça i no atributo k (ou tira, se já estava lá).
   * Se outra peça ocupava o atributo, as duas trocam de lugar.
   */
  static #onAberto(ev, btn) {
    const raca = this.#estado.raca;
    const i = Number(btn.dataset.indice);
    const k = btn.dataset.attr;
    if (!raca.sel?.aberta || !Number.isInteger(i)) return;
    raca.abertos ??= raca.sel.pecas.map(() => '');
    if (raca.abertos[i] === k) raca.abertos[i] = '';
    else {
      const j = raca.abertos.findIndex((c, x) => x !== i && c === k);
      if (j >= 0) raca.abertos[j] = raca.abertos[i];
      raca.abertos[i] = k;
    }
    this.#mudou();
  }

  /**
   * Põe na classe todas as habilidades de 1º nível que ainda não estão lá.
   * Classes com escolha no 1º nível (os Caminhos do Arcanista, as Linhagens
   * do feiticeiro) trazem as alternativas juntas — o aviso lembra de tirar.
   */
  static #onHabilidadesNivel1() {
    const sel = this.#estado.classe.sel;
    if (!sel) return;
    const lista = this.#estado.classe.poderes;
    const novas = this.#poderes(p => p.tipo === 'ability' && subtipoDe(p.subtipo, sel.nome)
      && (this.#niveis.get(p.uuid) ?? 1) <= 1
      && !lista.some(r => r.uuid === p.uuid || r.nome === p.nome));
    if (!novas.length) return ui.notifications.info('As habilidades de 1º nível já estão todas na lista.');
    for (const p of novas) lista.push({ uuid: p.uuid, nome: p.nome, img: p.img, type: p.type });
    ui.notifications.info(`${novas.length} habilidade(s) adicionada(s). Se a classe pede uma escolha (um Caminho, por exemplo), tire as que não são a sua.`);
    this.#mudou();
  }

  static #onDinamicoPasso(ev, btn) {
    const k = btn.dataset.attr;
    const esc = this.#estado.raca.escolhidos;
    esc[k] = Math.clamp((Number(esc[k]) || 0) + Number(btn.dataset.delta), -5, 5);
    if (!esc[k]) delete esc[k];
    this.#mudou();
  }

  static #onPericia(ev, btn) {
    const etapa = btn.closest('[data-pericias]')?.dataset.pericias;
    const lista = this.#periciasPorEtapa()[etapa];
    if (!lista) return;
    if (btn.classList.contains('bloqueada')) {
      return ui.notifications.info('Essa perícia já vem de outra etapa. Pela regra, quem ganharia a mesma perícia duas vezes escolhe outra.');
    }
    const k = btn.dataset.pericia;
    const i = lista.indexOf(k);
    if (i >= 0) lista.splice(i, 1);
    else lista.push(k);
    this.#mudou();
  }

  static #onRemover(ev, btn) {
    const z = ZONAS[btn.dataset.lista];
    if (!z) return;
    this.#estado[z.etapa][z.chave].splice(Number(btn.dataset.indice), 1);
    this.#mudou();
  }

  static #onQuantidade(ev, btn) {
    const z = ZONAS[btn.dataset.lista];
    const r = z && this.#estado[z.etapa][z.chave][Number(btn.dataset.indice)];
    if (!r) return;
    r.qtd = Math.max(1, (r.qtd ?? 1) + Number(btn.dataset.delta));
    this.#mudou();
  }

  static async #onAbrirItem(ev, btn) {
    const doc = await fromUuid(btn.dataset.uuid).catch(() => null);
    doc?.sheet?.render(true);
  }

  static #onAdicionar(ev, btn) {
    this.#adicionarPorUuid(btn.dataset.uuid);
  }

  static #onAba(ev, btn) {
    this.#aba[this.#estado.passo] = btn.dataset.aba;
    this.render();
  }

  static #onDivindade(ev, btn) {
    const nome = btn.dataset.nome ?? '';
    this.#estado.divindade.nome = normalizar(this.#estado.divindade.nome) === normalizar(nome) ? '' : nome;
    this.#aba.divindade = 'doDeus';
    this.#mudou();
  }

  static #onOrigemSugerida(ev, btn) {
    this.#estado.origem.nome = btn.dataset.nome;
    this.#aba.origem = 'daOrigem';
    this.#mudou();
  }

  /** Item do catálogo para a lista de equipamento, como recebido (grátis). */
  #itemRecebido(achado, vaga) {
    return {
      uuid: achado.uuid, nome: achado.nome, img: achado.img, type: achado.type, qtd: 1,
      preco: Number(achado.sistema?.preco) || 0, gratis: true, vaga
    };
  }

  static async #onKitBasico() {
    let n = 0;
    const lista = this.#estado.equipamento.itens;
    for (const nome of KIT_BASICO) {
      const achado = this.#itemPorNome(nome);
      if (!achado || lista.some(r => normalizar(r.nome) === normalizar(achado.nome))) continue;
      lista.push(this.#itemRecebido(achado, 'kit'));
      n++;
    }
    if (!n) return ui.notifications.info('O kit já está na lista (ou não foi achado nas fontes ligadas).');
    this.#mudou();
  }

  static #onEscudoInicial() {
    const lista = this.#estado.equipamento.itens;
    const i = lista.findIndex(r => r.vaga === 'escudo');
    if (i >= 0) lista.splice(i, 1);
    else {
      const achado = this.#itemPorNome(ESCUDO_INICIAL);
      if (!achado) return;
      lista.push(this.#itemRecebido(achado, 'escudo'));
    }
    this.#mudou();
  }

  /** Arma simples/marcial ou armadura escolhida: troca o item daquela vaga. */
  #onVaga(vaga, uuid) {
    const lista = this.#estado.equipamento.itens;
    const i = lista.findIndex(r => r.vaga === vaga);
    if (i >= 0) lista.splice(i, 1);
    const achado = uuid ? this.#catalogo.itens.find(x => x.uuid === uuid) : null;
    if (achado) lista.push(this.#itemRecebido(achado, vaga));
    this.#mudou();
  }

/**
   * Põe o item na vaga. Qualquer item físico serve — a mesa pode ter
   * combinado outra coisa; fora das opções do livro, a vaga só mostra um
   * aviso (ver #foraDaVaga). Poder ou magia não é equipamento e não entra.
   */
  #porNaVaga(vagaId, item) {
    const vaga = this.#vagasEquipamento().find(v => v.id === vagaId && v.opcoes);
    if (!vaga) return;
    if (!TIPOS_EQUIPAMENTO.includes(item.type)) {
      return ui.notifications.warn(`${item.name} não é equipamento — a vaga "${vaga.rotulo.toLowerCase()}" recebe itens.`);
    }
    const lista = this.#estado.equipamento.itens;
    const i = lista.findIndex(r => r.vaga === vagaId);
    if (i >= 0) lista.splice(i, 1);
    lista.push({ ...ref(item), qtd: 1, gratis: true, vaga: vagaId });
    this.#vagaAtiva = null;
    this.#mudou();
  }

  /** O aviso da vaga quando o item não é uma das opções do livro, ou null. */
  #foraDaVaga(vaga, item) {
    if (!vaga.opcoes || !item) return null;
    const ok = vaga.opcoes().some(o => o.uuid === item.uuid || (normalizar(o.nome) === normalizar(item.nome) && o.type === item.type));
    return ok ? null : `${item.nome} ${vaga.fora ?? 'não está entre as opções desta vaga.'}`;
  }

  /** Clique numa zona: a lista ao lado vai para a aba que a serve. */
  static #onFocarZona(ev, alvo) {
    // Clique num item da zona (marcar recebido, nome, quantidade) é do item.
    if (ev.target.closest('.t20g-cc-zitem')) return;
    const etapa = this.#estado.passo;
    let aba = ABA_DA_ZONA[alvo.dataset.zona];
    if (!aba) return;
    // Grupo de abas (os poderes gerais): volta para a última categoria usada.
    if (aba.startsWith('grupo:')) aba = this.#ultimaSubaba[`${etapa}:${aba.slice(6)}`] ?? 'geral-destino';
    this.#aba[etapa] = aba;
    this.#focarBusca = true;
    this.render();
  }

  static #onEscolherVaga(ev, btn) {
    const id = btn.dataset.vaga;
    this.#vagaAtiva = this.#vagaAtiva === id ? null : id;
    // A lista ao lado abre na vaga, só com as opções válidas.
    if (this.#vagaAtiva) this.#aba.equipamento = 'vaga';
    this.#busca['sug-equipamento'] = '';
    this.render();
  }

  static #onTirarVaga(ev, btn) {
    const lista = this.#estado.equipamento.itens;
    const i = lista.findIndex(r => r.vaga === btn.dataset.vaga);
    if (i >= 0) lista.splice(i, 1);
    this.#mudou();
  }

  static #onGratis(ev, btn) {
    const r = this.#estado.equipamento.itens[Number(btn.dataset.indice)];
    if (!r) return;
    r.gratis = !r.gratis;
    this.#mudou();
  }

  static #onComprar() {
    const eq = this.#estado.equipamento;
    eq.comprar = eq.comprar === false;
    this.#mudou();
  }

  static #onProficiencia(ev, btn) {
    const eq = this.#estado.equipamento;
    eq.prof ??= {};
    const id = btn.dataset.prof;
    eq.prof[id] = !eq.prof[id];
    // Sem a proficiência, a vaga que dependia dela (arma marcial, escudo,
    // brunea) deixa de existir — e o item dela sai da lista.
    if (!eq.prof[id]) {
      const vagas = { marcial: ['armaMarcial'], escudo: ['escudo'] }[id] ?? [];
      eq.itens = eq.itens.filter(r => !vagas.includes(r.vaga)
        && !(id === 'pesada' && r.vaga === 'armadura' && normalizar(r.nome) === normalizar(ARMADURA_PESADA_INICIAL)));
    }
    this.#mudou();
  }

  static #onAbaDeuses(ev, btn) {
    this.#abaDeuses = btn.dataset.aba;
    // Trocar de aba com uma divindade da outra escolhida limpa a escolha.
    const deus = this.#divindadeEscolhida();
    if (deus && (deus.maior ? 'panteao' : 'outras') !== this.#abaDeuses) this.#estado.divindade.nome = '';
    this.#mudou();
  }

  static async #onRolarDinheiro() {
    let formula = '4d6';
    try { formula = game.settings.get(MODULE_ID, 'criacaoDinheiroInicial') || '4d6'; } catch { /* padrão */ }
    let roll;
    try { roll = await new Roll(formula).evaluate(); }
    catch { return ui.notifications.error(`Fórmula de dinheiro inicial inválida: ${formula}`); }
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `Dinheiro inicial (${formula} T$)` });
    this.#estado.equipamento.dinheiro = roll.total;
    this.#mudou();
  }

  static #onRetrato() {
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: 'image',
      current: this.#estado.ficha.img,
      callback: (caminho) => { this.#estado.ficha.img = caminho; this.#mudou(); }
    });
    fp.browse();
  }

  static #onNiveis() {
    this.#mostrarNiveis = !this.#mostrarNiveis;
    this.render();
  }

  static async #onRecomecar() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: 'Recomeçar a criação?' },
      content: '<p>Tudo o que foi escolhido no assistente será descartado. A ficha não é alterada.</p>',
      rejectClose: false
    });
    if (!ok) return;
    this.#estado = estadoInicial(this.actor);
    this.#infoMagias = null;
    this.#niveis.clear();
    this.#mudou();
  }

  static async #onConcluir() {
    if (this.#ocupado) return;
    const bloqueio = this.#bloqueio();
    if (bloqueio) return ui.notifications.warn(bloqueio.texto);
    const pend = this.#pendencias();
    if (pend.length) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: 'Ainda há pendências', icon: 'fa-solid fa-triangle-exclamation' },
        content: `<p>O personagem será criado assim mesmo — dá para acertar o resto na ficha depois.</p>
          <ul>${pend.map(p => `<li>${foundry.utils.escapeHTML(p.texto)}</li>`).join('')}</ul>`,
        yes: { label: 'Criar assim mesmo', icon: 'fa-solid fa-check' },
        no: { label: 'Voltar' },
        rejectClose: false
      });
      if (!ok) return;
    }
    this.#ocupado = true;
    this.render();
    const e = this.#estado;
    try {
      const { faltando } = await aplicarCriacao(this.actor, e, {
        racial: this.#racial(),
        pericias: this.#todasPericias(),
        zonas: Object.keys(ZONAS).map(id => [id, e[ZONAS[id].etapa][ZONAS[id].chave]]),
        dinheiro: this.#saldo().sobra
      });
      if (faltando.length) ui.notifications.warn(`Não foram achados (apagados das fontes?): ${faltando.join(', ')}.`);
      await anunciarPersonagem(this.actor, e);
      this.#concluido = true;
      clearTimeout(this.#salvarDepois);
      ui.notifications.info(`${this.actor.name} está pronto para a aventura!`);
      await this.close();
      this.actor.sheet?.render(true);
    } catch (err) {
      console.error(`${MODULE_ID} | Falha ao criar o personagem`, err);
      ui.notifications.error('Algo deu errado ao gravar o personagem — veja o console (F12).');
      this.#ocupado = false;
      this.render();
    }
  }
}

export function abrirAssistenteCriacao(actor) {
  return CriacaoAssistenteApp.abrir(actor);
}
