/**
 * Planejador de Níveis.
 *
 * Uma janela no mesmo padrão do Assistente de Criação: à esquerda, os níveis
 * de 1 a 20; no meio, o nível escolhido; à direita, a lista de sugestões.
 *
 *  - Nível 1: o resumo do personagem, lido da própria ficha.
 *  - Níveis já alcançados: o que a ficha anotou naquele nível (anotação de
 *    origem do T20 Hayd UI) e a lista do que ainda não tem nível, para o
 *    jogador dizer em que nível pegou cada coisa.
 *  - Níveis adiante: o planejamento — a classe que recebe o nível, as
 *    habilidades daquele nível (destacadas na lista), poderes, magias, perícias e
 *    proficiências. O próximo nível pode ser aplicado na ficha.
 *
 * O planejamento fica salvo no ator (flag `planoNiveis`, em texto).
 */
import { MODULE_ID, carregarCatalogo } from '../criacao/fontes.mjs';
import {
  normalizar, subtipoDe, nivelDaHabilidade, lerMagiasIniciais, CATEGORIAS_GERAIS, categoriaGeral,
  DIVINDADES, divindadePorNome, concedidoPelaDivindade, outrasDivindades, formatarMoedas
} from '../criacao/regras.mjs';
import {
  atributosDoSistema, abrevAtr, sinal, rotulosPericias, chavesOficio, ref, ICONES_ATR
} from '../criacao/app-assistente.mjs';
import { PROFICIENCIAS } from '../criacao/aplicar.mjs';
import { NIVEL_MAXIMO, PATAMARES, patamarDe, projetarNiveis, circuloMaximo, magiasNoNivel } from './regras-niveis.mjs';
import {
  aplicarNivel, anunciarNiveis, escalasDaClasse, uiAtivo, UI_ID, FLAG_PLANO, CATEGORIA_POR_TIPO
} from './aplicar-nivel.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const TextEditorImpl = () => foundry.applications.ux.TextEditor.implementation;

const PASTA = `modules/${MODULE_ID}/templates/niveis`;
export const TEMPLATES_NIVEIS = [`${PASTA}/janela.hbs`, `${PASTA}/resumo.hbs`, `${PASTA}/alcancado.hbs`, `${PASTA}/plano.hbs`];

const LOTE = 30;

/** As listas de um nível planejado. */
const ZONAS = {
  nvHabilidades: { chave: 'habilidades', aceita: ['poder'], rotulo: 'Habilidades da classe', aba: 'habilidades' },
  nvPoderes: { chave: 'poderes', aceita: ['poder'], rotulo: 'Poderes', aba: 'poderes' },
  nvMagias: { chave: 'magias', aceita: ['magia'], rotulo: 'Magias', aba: 'magias' }
};

const ROTULO_CATEGORIA = { raca: 'Raça', origem: 'Origem', complicacao: 'Complicação', devocao: 'Devoção', nivel: 'Nível', bonus: 'Bônus' };

function planoVazio() {
  return { classe: null, habilidades: [], poderes: [], magias: [], pericias: [], prof: {} };
}

/** A anotação de origem do T20 Hayd UI num item, ou null. */
function origemDe(item) {
  const o = item.flags?.[UI_ID]?.origemPoder;
  if (!o || typeof o !== 'object') return null;
  const nivel = Number(o.nivel);
  return { categoria: o.categoria || '', nivel: Number.isInteger(nivel) && nivel >= 1 ? nivel : null };
}

export class NiveisApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static #abertas = new Map();

  static abrir(actor) {
    if (actor?.type !== 'character') return ui.notifications.warn('O planejador de níveis vale para Personagens de Jogador.');
    let app = this.#abertas.get(actor.uuid);
    if (!app) { app = new NiveisApp(actor); this.#abertas.set(actor.uuid, app); }
    app.render({ force: true });
    return app;
  }

  static DEFAULT_OPTIONS = {
    classes: ['t20g-criacao', 't20g-niveis'],
    window: { icon: 'fa-solid fa-stairs', resizable: true },
    position: { width: 1160, height: 800 },
    actions: {
      nivel: NiveisApp.#onNivel,
      classeExistente: NiveisApp.#onClasseExistente,
      novaClasse: NiveisApp.#onNovaClasse,
      escolherClasse: NiveisApp.#onEscolherClasse,
      tirarClasse: NiveisApp.#onTirarClasse,
      remover: NiveisApp.#onRemover,
      abrirItem: NiveisApp.#onAbrirItem,
      adicionar: NiveisApp.#onAdicionar,
      aba: NiveisApp.#onAba,
      niveis: NiveisApp.#onNiveisMaiores,
      focarZona: NiveisApp.#onFocarZona,
      pericia: NiveisApp.#onPericia,
      proficiencia: NiveisApp.#onProficiencia,
      subir: NiveisApp.#onSubir,
      limparNivel: NiveisApp.#onLimparNivel,
      anotarNivel: NiveisApp.#onAnotarNivel,
      tirarAnotacao: NiveisApp.#onTirarAnotacao,
      vincularClasse: NiveisApp.#onVincularClasse,
      desvincularClasse: NiveisApp.#onDesvincularClasse,
      quantidade: () => {}
    }
  };

  static PARTS = {
    corpo: {
      template: `${PASTA}/janela.hbs`,
      // Toda área com rolagem própria: um clique não pode jogar a lista ao topo.
      scrollable: ['.t20g-cc-principal', '.t20g-nv-lateral', '.t20g-nv-sem-nivel']
    }
  };

  actor;
  #plano;
  #nivelVisto;
  #catalogo = null;
  #escolhendoClasse = false;
  #aba = 'habilidades';
  #filtros = {};
  #mostrarNiveis = false;
  #busca = '';
  #sugestoes = [];
  #rolagem = null;
  /** uuid → nível da habilidade, lido da descrição. */
  #niveisHab = new Map();
  /** Texto e tipo da habilidade "Magias (Classe)", por nome de classe. */
  #magiasDaClasse = new Map();
  #infoMagias = null;
  #salvarDepois = null;
  #ganchos = [];
  #ocupado = false;
  /** A lista "sem nível anotado" fica aberta entre redesenhos se o jogador a abriu. */
  #semNivelAberto = false;

  constructor(actor, options = {}) {
    super({ ...options, id: `t20g-niveis-${actor.id}` });
    this.actor = actor;
    this.#plano = this.#lerPlano();
    this.#nivelVisto = Math.min(this.#nivelAtual() + 1, NIVEL_MAXIMO);
    // A ficha mudou (outra janela subiu o nível, item novo): redesenha.
    const redesenhar = foundry.utils.debounce(() => { if (this.rendered && !this.#ocupado) this.render(); }, 50);
    this.#ganchos = [
      ['updateActor', (doc) => { if (doc === this.actor) redesenhar(); }],
      ...['createItem', 'updateItem', 'deleteItem'].map(h => [h, (item) => { if (item.parent === this.actor) redesenhar(); }])
    ].map(([h, fn]) => [h, Hooks.on(h, fn)]);
  }

  get title() { return `Níveis — ${this.actor.name}`; }

  async close(options) {
    clearTimeout(this.#salvarDepois);
    this.#gravarPlano();
    for (const [h, id] of this.#ganchos) Hooks.off(h, id);
    NiveisApp.#abertas.delete(this.actor.uuid);
    return super.close(options);
  }

  /* ─── Plano ────────────────────────────────────────────────────────── */

  #lerPlano() {
    try {
      const bruto = this.actor.getFlag(MODULE_ID, FLAG_PLANO);
      const p = typeof bruto === 'string' ? JSON.parse(bruto) : bruto;
      if (p?.versao === 1) return p;
    } catch { /* plano ilegível: recomeça */ }
    return { versao: 1, niveis: {} };
  }

  #gravarPlano() {
    if (!this.actor.isOwner || !game.actors.has(this.actor.id)) return;
    this.actor.update({ [`flags.${MODULE_ID}.${FLAG_PLANO}`]: JSON.stringify(this.#plano) }, { render: false })
      .catch(err => console.warn(`${MODULE_ID} | Falha ao salvar o plano de níveis`, err));
  }

  #mudou() {
    clearTimeout(this.#salvarDepois);
    this.#salvarDepois = setTimeout(() => this.#gravarPlano(), 600);
    this.render();
  }

  #planoDo(n) {
    this.#plano.niveis[n] ??= planoVazio();
    return this.#plano.niveis[n];
  }

  /* ─── Ficha ────────────────────────────────────────────────────────── */

  #classesDaFicha() {
    return this.actor.items.filter(i => i.type === 'classe');
  }

  /**
   * Nível de classe de um nível já alcançado. Guardado quando o planejador
   * subiu o nível; num vínculo feito à mão, só dá para contar se todos os
   * níveis até ele têm classe — senão fica sem número.
   */
  #nivelClasseAlcancado(n) {
    const ap = this.#plano.aplicados ?? {};
    const c = ap[n]?.classe;
    if (!c) return null;
    if (c.nivel && !c.manual) return c.nivel;
    let conta = 0;
    for (let k = 1; k <= n; k++) {
      if (!ap[k]?.classe) return null;
      if (ap[k].classe.nome === c.nome) conta++;
    }
    return conta;
  }

  #nivelAtual() {
    const soma = this.#classesDaFicha().reduce((t, c) => t + (Number(c.system.niveis) || 0), 0);
    return Math.max(1, soma || Number(this.actor.system.attributes?.nivel?.value) || 1);
  }

  #projecao() {
    const atuais = Object.fromEntries(this.#classesDaFicha().map(c => [c.name, Number(c.system.niveis) || 0]));
    return { atuais, porNivel: projetarNiveis(atuais, this.#nivelAtual(), this.#plano.niveis, NIVEL_MAXIMO) };
  }

  /** Imagem de uma classe pelo nome (da ficha, do plano ou do catálogo). */
  #imgClasse(nome) {
    const daFicha = this.#classesDaFicha().find(c => c.name === nome);
    if (daFicha) return daFicha.img;
    for (const p of Object.values(this.#plano.niveis)) if (p.classe?.nome === nome) return p.classe.img;
    return this.#catalogo?.classes.find(c => c.nome === nome)?.img ?? 'icons/svg/mystery-man.svg';
  }

  /* ─── Contexto ─────────────────────────────────────────────────────── */

  async _prepareContext() {
    this.#catalogo ??= await carregarCatalogo();
    const atual = this.#nivelAtual();
    const n = this.#nivelVisto;
    const { porNivel } = this.#projecao();
    const contagem = {};
    for (const item of this.actor.items) {
      const o = origemDe(item);
      if (o?.nivel) contagem[o.nivel] = (contagem[o.nivel] ?? 0) + 1;
    }

    const lateral = [];
    for (let i = 1; i <= NIVEL_MAXIMO; i++) {
      const plano = this.#plano.niveis[i];
      const proj = porNivel[i];
      const estado = i <= atual ? 'alcancado' : i === atual + 1 ? 'proximo' : plano?.classe ? 'planejado' : 'livre';
      const aplicado = i <= atual ? this.#plano.aplicados?.[i]?.classe : null;
      lateral.push({
        n: i, estado, ativo: i === n,
        classe: aplicado ? { nome: aplicado.nome, img: this.#imgClasse(aplicado.nome), nivel: this.#nivelClasseAlcancado(i) ?? '' }
          : i > atual && proj?.classe ? { nome: proj.classe, img: this.#imgClasse(proj.classe), nivel: proj.nivelClasse } : null,
        itens: i <= atual ? contagem[i] ?? 0 : (plano ? plano.habilidades.length + plano.poderes.length + plano.magias.length : 0)
      });
    }

    // A lateral separada pelos patamares de jogo, cada um mais lendário.
    const patamarAtual = patamarDe(Math.max(atual, 1)).id;
    const patamares = PATAMARES.map(p => ({
      ...p, alcancado: atual >= p.de, atual: p.id === patamarAtual,
      niveis: lateral.filter(l => l.n >= p.de && l.n <= p.ate)
    }));
    const ctx = { lateral, patamares, nivel: n, atual, ocupado: this.#ocupado };
    if (n === 1) ctx.resumo = this.#ctxResumo();
    if (n <= atual) ctx.alcancado = this.#ctxAlcancado(n);
    else ctx.plano = await this.#ctxPlano(n, porNivel);
    ctx.temSugestoes = !!ctx.plano?.sugestoes;
    ctx.sugestoes = ctx.plano?.sugestoes ?? null;
    return ctx;
  }

  #ctxResumo() {
    const a = this.actor;
    const s = a.system;
    const r = rotulosPericias();
    const raca = a.items.find(i => i.type === 'race');
    return {
      img: a.img, nome: a.name,
      raca: raca ? { nome: raca.name, img: raca.img } : null,
      classes: this.#classesDaFicha().map(c => ({ nome: c.name, img: c.img, niveis: c.system.niveis })),
      origem: s.detalhes?.origem || null,
      divindade: s.detalhes?.divindade || null,
      atributos: Object.entries(atributosDoSistema()).map(([k, nome]) => {
        const v = Number(s.atributos?.[k]?.value) || 0;
        return { abr: abrevAtr(k), nome, icone: ICONES_ATR[k], total: sinal(v), tom: v > 0 ? 'pos' : v < 0 ? 'neg' : '' };
      }),
      recursos: [
        { rotulo: 'PV', valor: `${s.attributes?.pv?.value ?? '?'} / ${s.attributes?.pv?.max ?? '?'}`, tom: 'pv' },
        { rotulo: 'PM', valor: `${s.attributes?.pm?.value ?? '?'} / ${s.attributes?.pm?.max ?? '?'}`, tom: 'pm' },
        { rotulo: 'Defesa', valor: s.attributes?.defesa?.value ?? '?', tom: '' },
        { rotulo: 'Dinheiro', valor: formatarMoedas((Number(s.dinheiro?.tp) || 0) + (Number(s.dinheiro?.tc) || 0) / 10 + (Number(s.dinheiro?.to) || 0) * 10), tom: '' }
      ],
      pericias: Object.entries(s.pericias ?? {}).filter(([, p]) => p?.treinado).map(([k]) => r[k]).filter(Boolean).sort((x, y) => x.localeCompare(y, 'pt-BR'))
    };
  }

  /** Item da ficha para as listas de nível. */
  #linhaItem(item) {
    const o = origemDe(item);
    return {
      id: item.id, nome: item.name, img: item.img, uuid: item.uuid,
      tipo: item.type === 'magia' ? `Magia · ${item.system?.circulo ?? '?'}º círculo` : (CONFIG.T20?.powerType?.[item.system?.tipo] ? game.i18n.localize(CONFIG.T20.powerType[item.system.tipo]) : 'Poder'),
      categoria: o?.categoria ? (ROTULO_CATEGORIA[o.categoria] ?? o.categoria) : null,
      // Dentro de um grupo já nomeado: só o que distingue (o círculo da magia, o tipo do poder).
      sub: item.type === 'magia' ? `${item.system?.circulo ?? '?'}º círculo` : (CONFIG.T20?.powerType?.[item.system?.tipo] ? game.i18n.localize(CONFIG.T20.powerType[item.system.tipo]) : '')
    };
  }

  /**
   * Nível já alcançado: o que foi obtido nele, separado em listas curtas —
   * no Tormenta um nível dá pouca coisa (uma habilidade de classe, um poder,
   * uma ou outra magia). Perícias e proficiências só aparecem nos níveis
   * subidos pelo planejador, que guarda o que marcou.
   */
  #ctxAlcancado(n) {
    const anotaveis = this.actor.items.filter(i => ['poder', 'magia'].includes(i.type));
    const doNivel = anotaveis.filter(i => origemDe(i)?.nivel === n);
    const ordem = (x, y) => x.nome.localeCompare(y.nome, 'pt-BR');
    const linhas = (f) => doNivel.filter(f).map(i => this.#linhaItem(i)).sort(ordem);
    const semNivel = anotaveis.filter(i => !origemDe(i)?.nivel).map(i => this.#linhaItem(i)).sort(ordem);
    const aplicado = this.#plano.aplicados?.[n] ?? null;
    const r = rotulosPericias();
    const pericias = (aplicado?.pericias ?? []).map(k => r[k] ?? k);
    const profs = PROFICIENCIAS.filter(p => aplicado?.prof?.[p.id]).map(p => p.rotulo);
    const grupos = [
      { id: 'habilidades', rotulo: 'Habilidade de classe', rotuloVarios: 'Habilidades de classe', icone: 'fa-star', itens: linhas(i => i.type === 'poder' && i.system?.tipo === 'ability') },
      { id: 'poderes', rotulo: 'Poder', rotuloVarios: 'Poderes', icone: 'fa-bolt', itens: linhas(i => i.type === 'poder' && i.system?.tipo !== 'ability') },
      { id: 'magias', rotulo: 'Magia', rotuloVarios: 'Magias', icone: 'fa-wand-sparkles', itens: linhas(i => i.type === 'magia') }
    ].filter(g => g.itens.length).map(g => ({ ...g, titulo: g.itens.length > 1 ? g.rotuloVarios : g.rotulo }));
    const etiquetas = [
      { id: 'pericias', titulo: pericias.length > 1 ? 'Perícias' : 'Perícia', icone: 'fa-list-check', itens: pericias },
      { id: 'profs', titulo: profs.length > 1 ? 'Proficiências' : 'Proficiência', icone: 'fa-shield', itens: profs }
    ].filter(g => g.itens.length);
    const patamar = patamarDe(n);
    return {
      n, ui: uiAtivo(),
      classe: aplicado?.classe ? { ...aplicado.classe, img: this.#imgClasse(aplicado.classe.nome), nivel: this.#nivelClasseAlcancado(n) ?? '' } : null,
      vincular: this.#ctxVincular(n),
      patamar: { ...patamar, novo: n > 1 && n === patamar.de },
      grupos, etiquetas, vazio: !grupos.length && !etiquetas.length,
      semNivel, semNivelAberto: this.#semNivelAberto
    };
  }

  /**
   * Nível alcançado sem classe (ficha antiga, ou subido fora do planejador):
   * o jogador diz em que classe foi. Uma classe com todos os níveis já
   * vinculados fica travada. Vínculo feito à mão pode ser trocado.
   */
  #ctxVincular(n) {
    const atual = this.#plano.aplicados?.[n]?.classe;
    if (atual && !atual.manual) return null;
    const usados = {};
    for (const [k, a] of Object.entries(this.#plano.aplicados ?? {})) {
      // Só os níveis já alcançados contam (um plano antigo pode ter entradas acima).
      if (a?.classe && Number(k) !== n && Number(k) <= this.#nivelAtual()) usados[a.classe.nome] = (usados[a.classe.nome] ?? 0) + 1;
    }
    const opcoes = this.#classesDaFicha().map(c => {
      const total = Number(c.system.niveis) || 0;
      const ja = usados[c.name] ?? 0;
      return { nome: c.name, img: c.img, total, ja, cheia: ja >= total, ativa: atual?.nome === c.name };
    });
    return { opcoes, vinculada: !!atual };
  }

  async #lerNiveisHabilidades(nomeClasse) {
    const habs = this.#catalogo.poderes.filter(p => p.tipo === 'ability' && subtipoDe(p.subtipo, nomeClasse) && !this.#niveisHab.has(p.uuid));
    await Promise.all(habs.map(async h => {
      const doc = await fromUuid(h.uuid).catch(() => null);
      const desc = doc?.system?.description?.value ?? '';
      this.#niveisHab.set(h.uuid, nivelDaHabilidade(desc));
      const tipo = /\bmagias\b/.test(normalizar(h.nome)) ? lerMagiasIniciais(desc).tipo : null;
      if (tipo && !this.#magiasDaClasse.has(nomeClasse)) this.#magiasDaClasse.set(nomeClasse, { tipo, desc });
    }));
  }

  async #ctxPlano(n, porNivel) {
    const atual = this.#nivelAtual();
    const plano = this.#planoDo(n);
    const proj = porNivel[n];
    const antes = n - 1 > atual ? porNivel[n - 1].classes : this.#projecao().atuais;
    const opcoesClasse = Object.entries(antes).map(([nome, niveis]) => ({
      nome, img: this.#imgClasse(nome), de: niveis, para: niveis + 1, ativa: plano.classe?.nome === nome
    }));
    const patamar = patamarDe(n);
    const ctx = {
      n, proximo: n === atual + 1, deNivel: atual + 1,
      // Todos os níveis do próximo até este já têm classe: dá para subir de uma vez.
      subirAte: n > atual + 1 && Array.from({ length: n - atual }, (_, i) => atual + 1 + i).every(k => this.#plano.niveis[k]?.classe) ? n - atual : 0,
      novoPatamar: n > 1 && n === patamar.de ? patamar : null, bloqueado: n > atual + 1 && Object.keys(porNivel).some(k => Number(k) < n && !porNivel[k].classe),
      opcoesClasse,
      escolhendoClasse: this.#escolhendoClasse || !opcoesClasse.length,
      gradeClasses: this.#catalogo.classes.filter(c => !(c.nome in antes)).map(c => ({ uuid: c.uuid, nome: c.nome, img: c.img, fonte: c.fonte })),
      classe: plano.classe ? { ...plano.classe, nivel: proj.nivelClasse, nova: !(plano.classe.nome in antes) } : null
    };
    if (!plano.classe) return ctx;

    const nomeClasse = plano.classe.nome;
    const L = proj.nivelClasse;
    await this.#lerNiveisHabilidades(nomeClasse);
    // Classe que lança magias: tipo, círculo alcançado e quantas aprende neste nível.
    const mc = this.#magiasDaClasse.get(nomeClasse);
    const circulo = mc ? circuloMaximo(mc.desc, L) : null;
    this.#infoMagias = mc && circulo ? {
      tipo: mc.tipo, tipoTexto: mc.tipo === 'arc' ? 'arcanas' : 'divinas', circulo, novas: magiasNoNivel(mc.desc, L),
      novoCirculo: L > 1 && circulo > (circuloMaximo(mc.desc, L - 1) ?? 1)
    } : null;
    // A habilidade de magias da classe é tratada na seção Magias, não aqui.
    const escalas = escalasDaClasse(this.actor, nomeClasse, L)
      .filter(e => !(mc && /\bmagias\b/.test(normalizar(e.item.name))))
      .map(e => ({
      nome: e.item.name, img: e.item.img, uuid: e.item.uuid, trecho: e.escala.trecho,
      auto: e.alvo !== null && e.atual !== e.alvo ? `${e.atual}d${e.escala.incremento.faces} → ${e.alvo}d${e.escala.incremento.faces}` : null,
      igual: e.alvo !== null && e.atual === e.alvo
    }));

    // Perícias: já treinadas na ficha ou em outro nível planejado ficam travadas.
    const r = rotulosPericias();
    const oficios = new Set(chavesOficio());
    const treinadas = new Set(Object.entries(this.actor.system.pericias ?? {}).filter(([, p]) => p?.treinado).map(([k]) => k));
    const outrasPlan = {};
    for (const [k, p] of Object.entries(this.#plano.niveis)) if (Number(k) !== n && Number(k) > atual) for (const s of p.pericias ?? []) outrasPlan[s] = `nível ${k}`;
    const item = ([k, rotulo]) => {
      const marcada = plano.pericias.includes(k);
      const deOnde = treinadas.has(k) ? 'ficha' : outrasPlan[k] ?? null;
      return {
        k, rotulo: oficios.has(k) ? rotulo.replace(/^Ofício:\s*/, '') : rotulo,
        abr: abrevAtr(CONFIG.T20.pericias[k]?.abl ?? ''), marcada, bloqueada: !marcada && !!deOnde, deOnde
      };
    };
    const todas = Object.entries(r).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
    const listaOficios = todas.filter(([k]) => oficios.has(k)).map(item);
    const profAtuais = new Set([...(this.actor.system.tracos?.profArmas?.value ?? []), ...(this.actor.system.tracos?.profArmaduras?.value ?? [])]);

    return {
      ...ctx,
      L,
      zonaHab: this.#zona(n, 'nvHabilidades'),
      zonaPod: this.#zona(n, 'nvPoderes'),
      zonaMag: this.#zona(n, 'nvMagias'),
      infoMagias: this.#infoMagias,
      escalas,
      pericias: { etapa: 'nivel', gerais: todas.filter(([k]) => !oficios.has(k)).map(item), oficios: listaOficios, oficiosAbertos: listaOficios.some(o => o.marcada), total: plano.pericias.length },
      profs: PROFICIENCIAS.map(p => ({ ...p, marcada: !!plano.prof?.[p.id], tem: profAtuais.has(p.valor) })),
      sugestoes: this.#ctxSugestoes(n, nomeClasse, L)
    };
  }

  #zona(n, id) {
    const z = ZONAS[id];
    const lista = this.#planoDo(n)[z.chave];
    return { id, rotulo: z.rotulo, itens: lista.map((r, i) => ({ ...r, i, qtd: 1 })), vazia: !lista.length, itensFisicos: false, compras: false };
  }

  /* ─── Sugestões ────────────────────────────────────────────────────── */

  #poderes(f) { return this.#catalogo.poderes.filter(f); }

  #abas(nomeClasse, L) {
    const im = this.#infoMagias;
    const loc = (o) => Object.entries(o ?? {}).map(([v, r]) => ({ v, r: game.i18n.localize(r) }));
    const tiposPoder = loc(CONFIG.T20?.powerType);
    const outras = outrasDivindades(this.#poderes(p => p.tipo === 'concedido').map(p => p.subtipo));
    const classesDePoder = [...new Map(this.#catalogo.poderes.filter(p => p.tipo === 'classe' && p.subtipo).map(p => [normalizar(p.subtipo), p.subtipo])).values()]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const propria = classesDePoder.find(c => subtipoDe(c, nomeClasse)) ?? '';
    return [
      {
        id: 'habilidades', rotulo: 'Habilidades', icone: 'fa-star', niveis: true,
        titulo: `Habilidades de ${nomeClasse}`,
        dica: `Habilidades de ${nomeClasse} até o ${L}º nível. As do ${L}º nível ficam destacadas no topo — pegue as que valem para você.`,
        lista: () => this.#poderes(p => p.tipo === 'ability' && subtipoDe(p.subtipo, nomeClasse))
          .map(p => { const nivel = this.#niveisHab.get(p.uuid) ?? 1; return { ...p, nivel, desteNivel: nivel === L }; })
          .filter(p => this.#mostrarNiveis || p.nivel <= L)
          .sort((a, b) => b.nivel - a.nivel || a.nome.localeCompare(b.nome, 'pt-BR'))
      },
      {
        id: 'poderes', rotulo: 'Poderes', icone: 'fa-shield-halved', titulo: 'Poderes de classe',
        dica: 'Poderes de classe. Classe variante? Escolha a classe de origem dos poderes.',
        filtros: [{ id: 'classe', rotulo: 'Da classe', padrao: propria, opcoes: [...(propria ? [] : [{ v: '', r: '— escolha —' }]), ...classesDePoder.map(c => ({ v: c, r: c }))] }],
        lista: (f) => f.classe ? this.#poderes(p => p.tipo === 'classe' && subtipoDe(p.subtipo, f.classe)) : []
      },
      ...CATEGORIAS_GERAIS.map(c => ({
        id: `geral-${c.id}`, rotulo: c.rotulo, grupo: 'Gerais', iconeGrupo: 'fa-bolt',
        lista: () => this.#poderes(p => p.tipo === 'geral' && categoriaGeral(p.subtipo) === c.id)
      })),
      {
        id: 'concedidos', rotulo: 'Concedidos', icone: 'fa-hands-praying', titulo: 'Poderes concedidos',
        filtros: [{
          id: 'deus', rotulo: 'Divindade', padrao: divindadePorNome(this.actor.system.detalhes?.divindade)?.nome ?? '',
          opcoes: [{ v: '', r: 'Todas' }, ...DIVINDADES.map(d => ({ v: d.nome, r: d.nome })), ...outras.map(d => ({ v: `menor:${d.nome}`, r: `${d.nome} (menor)` }))]
        }],
        lista: (f) => {
          if (!f.deus) return this.#poderes(p => p.tipo === 'concedido');
          const alvo = f.deus.startsWith('menor:') ? { nome: f.deus.slice(6) } : divindadePorNome(f.deus);
          return this.#poderes(p => p.tipo === 'concedido' && concedidoPelaDivindade(p.subtipo, alvo));
        }
      },
      {
        id: 'todos', rotulo: 'Todos', icone: 'fa-list', titulo: 'Todos os poderes, com filtro',
        filtros: [{ id: 'tipo', rotulo: 'Tipo', padrao: '', opcoes: [{ v: '', r: 'Todos os tipos' }, ...tiposPoder] }],
        lista: (f) => this.#poderes(p => !f.tipo || p.tipo === f.tipo)
      },
      {
        id: 'magias', rotulo: 'Magias', icone: 'fa-wand-sparkles',
        dica: im ? `Já filtrado para magias ${im.tipoTexto} até o ${im.circulo}º círculo — as que um ${nomeClasse} de ${L}º nível lança.` : null,
        filtros: [
          { id: 'circulo', rotulo: 'Círculo', padrao: im ? 'acesso' : '', opcoes: [
            { v: '', r: 'Todos' },
            ...(im ? [{ v: 'acesso', r: `Até o ${im.circulo}º` }] : []),
            ...[1, 2, 3, 4, 5].map(c => ({ v: String(c), r: `${c}º` }))
          ] },
          { id: 'tipo', rotulo: 'Tipo', padrao: im?.tipo ?? '', opcoes: [{ v: '', r: 'Todos' }, ...loc(CONFIG.T20?.spellType)] },
          { id: 'escola', rotulo: 'Escola', padrao: '', opcoes: [{ v: '', r: 'Todas' }, ...loc(CONFIG.T20?.spellSchools)] }
        ],
        lista: (f) => this.#catalogo.magias.filter(m => (!f.circulo || (f.circulo === 'acesso' ? Number(m.sistema?.circulo) <= im.circulo : String(m.sistema?.circulo) === f.circulo))
          && (!f.tipo || m.sistema?.tipo === f.tipo || (m.sistema?.tipo === 'uni' && ['arc', 'div'].includes(f.tipo)))
          && (!f.escola || m.sistema?.escola === f.escola))
      }
    ];
  }

  #ultimaSub = null;

  #ctxSugestoes(n, nomeClasse, L) {
    const abas = this.#abas(nomeClasse, L);
    const ativa = abas.find(a => a.id === this.#aba) ?? abas[0];
    this.#aba = ativa.id;
    if (ativa.grupo) this.#ultimaSub = ativa.id;
    const salvos = this.#filtros[ativa.id] ?? {};
    const valores = {};
    for (const f of ativa.filtros ?? []) {
      const v = salvos[f.id];
      valores[f.id] = v !== undefined && f.opcoes.some(o => o.v === v) ? v : (f.padrao ?? '');
    }
    this.#sugestoes = ativa.lista(valores);
    const principais = [];
    for (const a of abas) {
      if (!a.grupo) { principais.push({ id: a.id, rotulo: a.rotulo, titulo: a.titulo ?? a.rotulo, icone: a.icone ?? null, ativa: a.id === ativa.id }); continue; }
      if (principais.some(p => p.grupo === a.grupo)) continue;
      const doGrupo = abas.filter(x => x.grupo === a.grupo);
      principais.push({
        id: doGrupo.some(x => x.id === this.#ultimaSub) ? this.#ultimaSub : doGrupo[0].id,
        grupo: a.grupo, rotulo: a.grupo, titulo: a.grupo, icone: a.iconeGrupo ?? null, ativa: ativa.grupo === a.grupo
      });
    }
    return {
      principais, compacta: principais.length >= 4,
      subabas: ativa.grupo ? abas.filter(x => x.grupo === ativa.grupo).map(x => ({ id: x.id, rotulo: x.rotulo, ativa: x.id === ativa.id })) : null,
      filtros: (ativa.filtros ?? []).map(f => ({ id: f.id, rotulo: f.rotulo, opcoes: f.opcoes.map(o => ({ ...o, sel: o.v === valores[f.id] })) })),
      dica: ativa.dica ?? null, busca: this.#busca,
      niveis: ativa.niveis ? { mostrar: this.#mostrarNiveis } : null
    };
  }

  /* ─── Render ───────────────────────────────────────────────────────── */

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
    el.addEventListener('drop', async ev => {
      ev.preventDefault();
      limpar();
      const dados = TextEditorImpl().getDragEventData(ev);
      if (dados?.type !== 'Item') return;
      const item = await Item.implementation.fromDropData(dados).catch(() => null);
      if (item) this.#adicionar(item, ev.target.closest?.('[data-zona]')?.dataset.zona ?? null);
    });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const el = this.element;
    el.querySelector('.t20g-nv-sem-nivel-caixa')?.addEventListener('toggle', (ev) => { this.#semNivelAberto = ev.currentTarget.open; });
    const lista = el.querySelector('.t20g-cc-sug-lista');
    if (lista) {
      const busca = el.querySelector('input[data-busca="sugestoes"]');
      busca?.addEventListener('input', () => { this.#busca = busca.value; this.#montar(lista); });
      this.#montar(lista);
    }
    el.querySelectorAll('select[data-filtro]').forEach(sel => sel.addEventListener('change', () => {
      this.#filtros[this.#aba] = { ...(this.#filtros[this.#aba] ?? {}), [sel.dataset.filtro]: sel.value };
      this.render();
    }));
    el.querySelectorAll('[data-desc]').forEach(n => n.addEventListener('pointerenter', () => this.#descricao(n), { once: true }));
  }

  /** Lista de sugestões de 30 em 30, guardando a rolagem entre redesenhos. */
  #montar(lista) {
    const q = normalizar(this.#busca);
    const todos = this.#sugestoes;
    const filtrados = q ? todos.filter(x => normalizar(x.nome).includes(q) || normalizar(x.subtipo).includes(q)) : todos;
    const chave = JSON.stringify([this.#nivelVisto, this.#aba, q, this.#filtros[this.#aba] ?? {}, this.#mostrarNiveis]);
    const anterior = this.#rolagem?.chave === chave ? this.#rolagem : null;
    this.#rolagem = { chave, mostrados: 0, topo: 0 };
    lista.innerHTML = '';
    if (!filtrados.length) {
      lista.innerHTML = `<li class="t20g-vazio t20g-cc-sug-vazio"><i class="fa-solid fa-magnifying-glass"></i><span class="t20g-vazio__texto">${todos.length ? 'Nada com esse nome.' : 'Nada nas fontes ligadas para esta lista.'}</span></li>`;
      return;
    }
    const plano = this.#plano.niveis[this.#nivelVisto] ?? planoVazio();
    const usados = new Set([...plano.habilidades, ...plano.poderes, ...plano.magias].map(r => r.uuid));
    const naFicha = new Set(this.actor.items.map(i => normalizar(i.name)));
    const esc = foundry.utils.escapeHTML;
    let mostrados = 0;
    const mais = () => {
      if (mostrados >= filtrados.length) return;
      const html = filtrados.slice(mostrados, mostrados + LOTE).map(x => {
        const usado = usados.has(x.uuid);
        const tem = !usado && naFicha.has(normalizar(x.nome));
        const sub = [x.type === 'magia' && x.sistema?.circulo ? `${x.sistema.circulo}º círculo` : x.subtipo, x.fonte].filter(Boolean).join(' · ');
        const nivel = x.nivel ? `<span class="t20g-chip t20g-cc-nivel"${x.desteNivel ? ' data-tooltip="Habilidade deste nível da classe"' : ''}>${x.nivel}º nv</span>` : '';
        return `<li class="t20g-cc-sug ${usado || tem ? 't20g-cc-sug--usada' : ''} ${x.desteNivel ? 't20g-nv-sug--nivel' : ''}" draggable="true" data-uuid="${esc(x.uuid)}" data-desc="${esc(x.uuid)}">
          <img src="${esc(x.img)}" alt="" loading="lazy">
          <span class="t20g-cc-sug-texto"><b>${esc(x.nome)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>
          ${nivel}
          ${usado ? '<i class="fa-solid fa-check t20g-cc-sug-ok" data-tooltip="Já planejado"></i>'
            : tem ? '<i class="fa-solid fa-user-check t20g-cc-sug-ok" data-tooltip="Já está na ficha"></i>'
              : `<button type="button" class="t20g-btn t20g-btn--icone t20g-btn--fantasma" data-action="adicionar" data-uuid="${esc(x.uuid)}" data-tooltip="Adicionar"><i class="fa-solid fa-plus"></i></button>`}
        </li>`;
      }).join('');
      const molde = document.createElement('template');
      molde.innerHTML = html;
      for (const li of molde.content.querySelectorAll('.t20g-cc-sug')) {
        li.addEventListener('dragstart', ev => ev.dataTransfer.setData('text/plain', JSON.stringify({ type: 'Item', uuid: li.dataset.uuid })));
        li.addEventListener('dblclick', () => this.#adicionarPorUuid(li.dataset.uuid));
        li.addEventListener('pointerenter', () => this.#descricao(li), { once: true });
      }
      lista.querySelector('.t20g-cc-sug-mais')?.remove();
      lista.append(molde.content);
      mostrados += LOTE;
      this.#rolagem.mostrados = mostrados;
      if (mostrados < filtrados.length) lista.insertAdjacentHTML('beforeend', `<li class="t20g-cc-sug-mais"><i class="fa-solid fa-ellipsis"></i> ${filtrados.length - mostrados} a mais — role para ver</li>`);
    };
    mais();
    while (anterior && mostrados < Math.min(anterior.mostrados, filtrados.length)) mais();
    if (anterior) { lista.scrollTop = anterior.topo; this.#rolagem.topo = lista.scrollTop; }
    lista.onscroll = () => {
      this.#rolagem.topo = lista.scrollTop;
      if (lista.scrollTop + lista.clientHeight >= lista.scrollHeight - 120) mais();
    };
  }

  async #descricao(el) {
    const uuid = el.dataset.desc;
    if (!uuid || el.dataset.tooltipHtml) return;
    const doc = await fromUuid(uuid).catch(() => null);
    if (!doc) return;
    const desc = await TextEditorImpl().enrichHTML(doc.system?.description?.value ?? '', { secrets: false });
    const html = `<div class="t20g-cc-dica"><h4>${foundry.utils.escapeHTML(doc.name)}</h4>${desc || '<p><em>Sem descrição.</em></p>'}</div>`;
    el.dataset.tooltipHtml = html;
    el.dataset.tooltipDirection = el.closest('.t20g-cc-sugestoes') ? 'LEFT' : 'UP';
    if (el.matches(':hover')) game.tooltip.activate(el, { html, direction: el.dataset.tooltipDirection, cssClass: 't20g-cc-tooltip' });
  }

  /* ─── Adicionar ────────────────────────────────────────────────────── */

  async #adicionarPorUuid(uuid) {
    const item = await fromUuid(uuid).catch(() => null);
    if (item) this.#adicionar(item, null);
  }

  #adicionar(item, zonaPedida) {
    const n = this.#nivelVisto;
    if (n <= this.#nivelAtual()) return;
    if (item.type === 'classe') return this.#definirClasse(item);
    const plano = this.#planoDo(n);
    if (!plano.classe) return ui.notifications.info('Escolha antes a classe que recebe este nível.');
    let zona = zonaPedida && ZONAS[zonaPedida]?.aceita.includes(item.type) ? zonaPedida : null;
    if (!zona) {
      if (item.type === 'magia') zona = 'nvMagias';
      else if (item.type === 'poder') zona = item.system?.tipo === 'ability' ? 'nvHabilidades' : 'nvPoderes';
    }
    if (!zona) return ui.notifications.warn(`O planejador usa poderes e magias — "${item.name}" é outro tipo de item.`);
    const lista = plano[ZONAS[zona].chave];
    if (lista.some(r => r.uuid === item.uuid || r.nome === item.name)) return ui.notifications.info(`${item.name} já está neste nível.`);
    if (this.actor.items.some(i => i.name === item.name && i.type === item.type)) ui.notifications.info(`${item.name} já está na ficha — confira se não é repetido.`);
    lista.push(ref(item));
    this.#mudou();
  }

  async #definirClasse(doc) {
    const n = this.#nivelVisto;
    const plano = this.#planoDo(n);
    plano.classe = { uuid: doc.uuid, nome: doc.name ?? doc.nome, img: doc.img };
    this.#escolhendoClasse = false;
    await this.#prepararHabilidades(n);
    delete this.#filtros.magias;
    this.#aba = 'habilidades';
    this.#mudou();
  }

  /**
   * Trocar de classe esvazia as habilidades planejadas (eram da outra classe).
   * Nada entra sozinho: classes como o arcanista escolhem entre as habilidades
   * do nível, então a lista só destaca as deste nível e o jogador pega as suas.
   */
  async #prepararHabilidades(n) {
    const plano = this.#planoDo(n);
    plano.habilidades = [];
    if (!plano.classe) return;
    this.#catalogo ??= await carregarCatalogo();
    await this.#lerNiveisHabilidades(plano.classe.nome);
  }

  /* ─── Ações ────────────────────────────────────────────────────────── */

  static #onNivel(ev, btn) {
    this.#nivelVisto = Number(btn.dataset.nivel);
    this.#escolhendoClasse = false;
    this.render();
  }

  static async #onClasseExistente(ev, btn) {
    const nome = btn.dataset.nome;
    const daFicha = this.#classesDaFicha().find(c => c.name === nome);
    const plano = Object.values(this.#plano.niveis).find(p => p.classe?.nome === nome)?.classe;
    const doc = daFicha ? { uuid: daFicha.flags?.core?.sourceId ?? daFicha._stats?.compendiumSource ?? daFicha.uuid, name: nome, img: daFicha.img } : plano ? { uuid: plano.uuid, name: nome, img: plano.img } : null;
    if (doc) await this.#definirClasse(doc);
  }

  static #onNovaClasse() {
    this.#escolhendoClasse = !this.#escolhendoClasse;
    this.render();
  }

  static async #onEscolherClasse(ev, btn) {
    const doc = await fromUuid(btn.dataset.uuid).catch(() => null);
    if (doc) await this.#definirClasse(doc);
  }

  static #onTirarClasse() {
    this.#plano.niveis[this.#nivelVisto] = planoVazio();
    this.#mudou();
  }

  static #onLimparNivel() {
    this.#plano.niveis[this.#nivelVisto] = planoVazio();
    this.#mudou();
  }

  static #onRemover(ev, btn) {
    const z = ZONAS[btn.dataset.lista];
    if (!z) return;
    this.#planoDo(this.#nivelVisto)[z.chave].splice(Number(btn.dataset.indice), 1);
    this.#mudou();
  }

  static async #onAbrirItem(ev, btn) {
    const doc = await fromUuid(btn.dataset.uuid).catch(() => null);
    doc?.sheet?.render(true);
  }

  static #onAdicionar(ev, btn) { this.#adicionarPorUuid(btn.dataset.uuid); }

  static #onAba(ev, btn) { this.#aba = btn.dataset.aba; this.render(); }

  static #onNiveisMaiores() { this.#mostrarNiveis = !this.#mostrarNiveis; this.render(); }

  static #onFocarZona(ev, alvo) {
    if (ev.target.closest('.t20g-cc-zitem')) return;
    const aba = ZONAS[alvo.dataset.zona]?.aba;
    if (!aba) return;
    this.#aba = aba;
    if (aba === 'magias') delete this.#filtros.magias;
    this.render().then(() => this.element.querySelector('input[data-busca="sugestoes"]')?.focus());
  }

  static #onPericia(ev, btn) {
    if (btn.classList.contains('bloqueada')) return ui.notifications.info('Essa perícia já é treinada (na ficha ou em outro nível planejado).');
    const lista = this.#planoDo(this.#nivelVisto).pericias;
    const k = btn.dataset.pericia;
    const i = lista.indexOf(k);
    if (i >= 0) lista.splice(i, 1); else lista.push(k);
    this.#mudou();
  }

  static #onProficiencia(ev, btn) {
    const plano = this.#planoDo(this.#nivelVisto);
    plano.prof ??= {};
    plano.prof[btn.dataset.prof] = !plano.prof[btn.dataset.prof];
    this.#mudou();
  }

  /** Anota em que nível o personagem pegou um poder ou magia já na ficha. */
  static async #onAnotarNivel(ev, btn) {
    if (!uiAtivo()) return;
    const item = this.actor.items.get(btn.dataset.item);
    if (!item) return;
    const o = origemDe(item);
    const categoria = o?.categoria || CATEGORIA_POR_TIPO[item.system?.tipo] || 'nivel';
    await item.setFlag(UI_ID, 'origemPoder', { categoria, nivel: this.#nivelVisto });
  }

  static #onVincularClasse(ev, btn) {
    const n = this.#nivelVisto;
    if (n > this.#nivelAtual()) return;
    const atual = this.#plano.aplicados?.[n]?.classe;
    if (atual && !atual.manual) return;
    const c = this.#classesDaFicha().find(x => x.name === btn.dataset.nome);
    if (!c || btn.disabled) return;
    this.#plano.aplicados ??= {};
    const antigo = this.#plano.aplicados[n] ?? {};
    this.#plano.aplicados[n] = { ...antigo, classe: { nome: c.name, img: c.img, uuid: c.uuid, manual: true } };
    this.#mudou();
  }

  static #onDesvincularClasse() {
    const n = this.#nivelVisto;
    const ap = this.#plano.aplicados?.[n];
    if (!ap?.classe?.manual) return;
    delete ap.classe;
    if (!Object.keys(ap).length) delete this.#plano.aplicados[n];
    this.#mudou();
  }

  static async #onTirarAnotacao(ev, btn) {
    if (!uiAtivo()) return;
    const item = this.actor.items.get(btn.dataset.item);
    const o = item && origemDe(item);
    if (!item || !o) return;
    await item.setFlag(UI_ID, 'origemPoder', o.categoria ? { categoria: o.categoria, nivel: null } : null);
  }

  /**
   * A comemoração do nível novo: uma camada por cima do conteúdo da janela,
   * fora das partes — os redesenhos que vêm depois de gravar não a apagam.
   * Some sozinha (mais devagar ao entrar num patamar novo) ou com um clique.
   */
  async #comemorar(festa) {
    const html = await foundry.applications.handlebars.renderTemplate(`${PASTA}/festa.hbs`, festa);
    const molde = document.createElement('template');
    molde.innerHTML = html.trim();
    const camada = molde.content.firstElementChild;
    const alvo = this.element?.querySelector('.window-content');
    if (!camada || !alvo) return;
    alvo.querySelector('.t20g-nv-festa')?.remove();
    alvo.append(camada);
    let foi = false;
    const fechar = () => {
      if (foi) return;
      foi = true;
      camada.classList.add('saindo');
      setTimeout(() => camada.remove(), 400);
    };
    camada.addEventListener('click', fechar);
    setTimeout(fechar, festa.novoPatamar ? 6500 : 4200);
  }

  /**
   * Sobe do nível atual até o nível aberto — um de cada vez, na ordem, cada um
   * com o seu plano. Funciona para o próximo nível ou para vários de uma vez,
   * quando todos os do caminho já têm classe planejada.
   */
  static async #onSubir() {
    const alvo = this.#nivelVisto;
    const atual = this.#nivelAtual();
    if (alvo <= atual || this.#ocupado) return;
    const niveis = Array.from({ length: alvo - atual }, (_, i) => atual + 1 + i);
    const semClasse = niveis.find(k => !this.#plano.niveis[k]?.classe);
    if (semClasse) return ui.notifications.warn(`Escolha a classe do ${semClasse}º nível antes de subir até o ${alvo}º.`);
    const esc = foundry.utils.escapeHTML;
    const { porNivel } = this.#projecao();
    const lista = niveis.map(k => `<li><b>${k}º nível</b> · ${esc(this.#plano.niveis[k].classe.nome)} ${porNivel[k]?.nivelClasse ?? ''}</li>`).join('');
    const varios = niveis.length > 1;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: varios ? `Subir até o ${alvo}º nível?` : `Subir para o ${alvo}º nível?`, icon: 'fa-solid fa-stairs' },
      content: varios
        ? `<p>${esc(this.actor.name)} sobe ${niveis.length} níveis de uma vez, um de cada vez e na ordem, com o que foi planejado para cada um:</p><ul>${lista}</ul>`
        : `<p>${esc(this.actor.name)} recebe um nível de <b>${esc(this.#plano.niveis[alvo].classe.nome)}</b> e o que foi planejado para o ${alvo}º nível vai para a ficha.</p>`,
      yes: { label: varios ? `Subir ${niveis.length} níveis` : 'Subir de nível', icon: 'fa-solid fa-stairs' }, no: { label: 'Voltar' }, rejectClose: false
    });
    if (!ok) return;
    this.#ocupado = true;
    this.render();
    const passos = [];
    try {
      for (const n of niveis) {
        const plano = this.#plano.niveis[n];
        const r = await aplicarNivel(this.actor, n, plano);
        if (r.faltando.length) ui.notifications.warn(`${n}º nível — não foram achados: ${r.faltando.join(', ')}.`);
        this.#plano.aplicados ??= {};
        this.#plano.aplicados[n] = {
          classe: { ...plano.classe, nivel: r.nivelClasse }, itens: r.criados,
          pericias: [...(plano.pericias ?? [])], prof: { ...(plano.prof ?? {}) }
        };
        delete this.#plano.niveis[n];
        this.#gravarPlano();
        passos.push({ nivel: n, classe: { ...plano.classe, nivel: r.nivelClasse }, ajustados: r.ajustados });
      }
    } catch (err) {
      console.error(`${MODULE_ID} | Falha ao subir de nível`, err);
      ui.notifications.error('Algo deu errado ao subir de nível — veja o console (F12).');
    } finally {
      if (passos.length) {
        // O patamar mais alto em que entrou no caminho (subir do 4º ao 11º passa por Veterano e Campeão).
        const novoPatamar = passos.map(p => p.nivel).filter(k => k > 1 && k === patamarDe(k).de).map(patamarDe).at(-1) ?? null;
        const ultimo = passos.at(-1);
        await anunciarNiveis(this.actor, passos, novoPatamar);
        this.#comemorar({
          n: ultimo.nivel, de: varios ? atual : null, subiu: passos.length,
          classe: ultimo.classe, patamar: patamarDe(ultimo.nivel), novoPatamar, img: this.actor.img, nome: this.actor.name
        });
        this.#nivelVisto = Math.min(ultimo.nivel + 1, NIVEL_MAXIMO);
      }
      this.#ocupado = false;
      this.render();
    }
  }
}

export function abrirPlanejadorNiveis(actor) {
  return NiveisApp.abrir(actor);
}
