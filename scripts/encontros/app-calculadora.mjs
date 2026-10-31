/**
 * t20-hayd-gmtools | encontros/app-calculadora.mjs
 * Calculadora de Encontros: o grupo de um lado, as ameaças do outro, e no
 * meio o ND do encontro, a dificuldade em relação ao grupo e sugestões de
 * como chegar à dificuldade escolhida. Aberta pela aba do Mestre da Ficha
 * do Grupo, já com os personagens daquele grupo.
 */
import { MODULE_ID } from '../tesouros/constantes.mjs';
import { getPartyMembers, getPartyFolderIds } from '../../t20-hayd-management.mjs';
import { rolarTesouroDoEncontro, tesouroVazio, itemManual, textoMoedas, entregarParaAtor, entregarParaPasta, categoriaDoTesouro, CATEGORIAS } from './tesouro-encontro.mjs';
import { abrirTesouroEncontro, atualizarTesouroEncontro } from './tesouro-editor.mjs';
import { pastaGMTools, criarPastaDeEncontro } from './pasta-gmtools.mjs';
import { abrirBando, criarFichaBando, dadosDaBase, nomeDoBando } from './bando.mjs';
import { calcularBando, ESCALAS } from './dados-bando.mjs';
import { abrirChefeFinal, aplicarChefeFinal, ehChefeFinal } from './chefe-final.mjs';
import {
  ORDEM_ND, ndNumero, ndRotulo, calcularNDEncontro, ndDoGrupo, classificar, ndAlvo,
  FAIXAS, ALVOS, RITMOS, PERFIS_MESA, PAPEIS, parametros, validarFicha, calcularXP,
  encontrosAteSubir, ajustesChefeFinal, patamar, sugerir, avaliarCandidata, papelQueFalta,
  passosND, ESTRUTURAS, montarEstrutura, ndRecompensa, chanceDeAcerto, ajustesDeQuantidade,
  AMBIENTES, perfilDeTema, combinaTema, combinaAmbiente, temasDisponiveis
} from './regras.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const esc = s => foundry.utils.escapeHTML(String(s ?? ''));
const novoId = () => foundry.utils.randomID();
const TIPOS_AMEACA = ['npc', 'hazard'];

/** Estado por grupo: fechar e reabrir na mesma sessão não perde o encontro. */
const estados = new Map();

/** Índice das ameaças de todos os compêndios (e do mundo), feito uma vez por sessão. */
let indiceCache = null;

export async function indiceAmeacas() {
  if (indiceCache) return indiceCache;
  const out = [];
  const campos = ['system.attributes.nd', 'system.detalhes.role', 'system.detalhes.tipo', 'system.detalhes.raca', 'system.attributes.movement', 'type', 'img'];
  const get = foundry.utils.getProperty;
  for (const pack of game.packs.filter(p => p.documentName === 'Actor')) {
    let idx;
    try { idx = await pack.getIndex({ fields: campos }); } catch { continue; }
    for (const e of idx) {
      if (!TIPOS_AMEACA.includes(e.type)) continue;
      const nd = ndNumero(get(e, 'system.attributes.nd'));
      if (!nd) continue;
      out.push({
        uuid: e.uuid ?? `Compendium.${pack.collection}.Actor.${e._id}`,
        nome: e.name, img: e.img, nd,
        papelFicha: e.type === 'hazard' ? 'hazard' : (get(e, 'system.detalhes.role') || ''),
        fonte: pack.title, fonteId: pack.collection,
        ...perfilDeTema({ tipo: get(e, 'system.detalhes.tipo'), raca: get(e, 'system.detalhes.raca'), movement: get(e, 'system.attributes.movement') })
      });
    }
  }
  for (const a of game.actors.filter(x => TIPOS_AMEACA.includes(x.type))) {
    const nd = ndNumero(a.system?.attributes?.nd);
    if (!nd) continue;
    out.push({
      uuid: a.uuid, nome: a.name, img: a.img, nd,
      papelFicha: a.type === 'hazard' ? 'hazard' : (a.system?.detalhes?.role || ''),
      fonte: 'Atores do mundo', fonteId: 'world',
      ...perfilDeTema({ tipo: a.system?.detalhes?.tipo, raca: a.system?.detalhes?.raca, movement: a.system?.attributes?.movement })
    });
  }
  indiceCache = out;
  return out;
}

/** O que a calculadora precisa de uma ficha de ameaça. */
function dadosDaAmeaca(doc) {
  const s = doc.system ?? {};
  const hazard = doc.type === 'hazard';
  const papelFicha = hazard ? 'hazard' : (s.detalhes?.role || '');
  const num = v => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : null);
  return {
    uuid: doc.uuid, nome: doc.name, img: doc.img, tipo: doc.type,
    nd: ndNumero(s.attributes?.nd),
    papelFicha, papel: papelFicha || 'solo',
    pv: num(s.attributes?.pv?.max),
    defesa: num(s.attributes?.defesa?.value),
    res: ['fort', 'refl', 'vont'].map(k => num(s.pericias?.[k]?.value)),
    tesouro: s.detalhes?.tesouro || '',
    chefeAplicado: ehChefeFinal(doc),
    ehBando: !!doc.getFlag?.(MODULE_ID, 'bando')
  };
}

function nivelDoAtor(a) {
  if (a.type === 'npc') return ndNumero(a.system?.attributes?.nd) ?? 1;
  return Number(a.system?.attributes?.nivel?.value) || 1;
}

function novoTesouro() {
  return { modo: 'encontro', ndModo: 'auto', destino: 'pasta', assinatura: null, ...tesouroVazio() };
}

/** Muda quando o encontro muda — para avisar que a rolagem ficou velha. */
function assinaturaDoEncontro(ameacas) {
  return ameacas.map(a => `${a.uuid}:${a.qtd}:${a.chefe ? 1 : 0}`).sort().join('|');
}

/**
 * Transforma uma linha do encontro num bando "virtual": os números do bando
 * entram no cálculo, e a ficha só é criada na pasta de encontro (ou pelo
 * botão "Criar ficha do bando"). `base` guarda a linha original para desfazer.
 */
function aplicarBandoNaLinha(a, cfg, doc) {
  const base = a.bando?.base ?? { nd: a.nd, nome: a.nome, pv: a.pv, defesa: a.defesa, res: a.res, img: a.img };
  if (!cfg) {
    Object.assign(a, base);
    delete a.bando;
    return;
  }
  const c = calcularBando({ ...dadosDaBase(doc), ndBando: cfg.ndBando, escala: cfg.escala });
  a.bando = { ...cfg, base };
  Object.assign(a, { nd: cfg.ndBando, nome: cfg.nome || nomeDoBando(base.nome), pv: c.pv, defesa: c.defesa });
}

function novoMontador() {
  return { estrutura: 'aleatoria', fonte: '', temas: [], ambiente: '' };
}

function estadoInicial(folderId) {
  const party = folderId
    ? getPartyMembers(folderId).filter(a => a.type === 'character').map(a => a.id)
    : game.users.filter(u => u.character && !u.isGM).map(u => u.character.id);
  return {
    party, ameacas: [], titulo: '', ndModo: 'auto', alvo: 'justo', ritmo: 'normal', perfil: 'padrao', manual: 0,
    montar: novoMontador(),
    tesouro: novoTesouro(),
    busca: { aberta: false, papel: '', ndMin: '', ndMax: '', fonte: '', texto: '' }
  };
}

class EncontrosCalculadoraApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instancias = new Map();

  static abrir({ folderId = null } = {}) {
    const chave = folderId ?? '_';
    let app = this.#instancias.get(chave);
    if (!app) {
      app = new EncontrosCalculadoraApp({ id: `t20g-encontros-${chave}` });
      app.#folderId = folderId;
      if (!estados.has(chave)) estados.set(chave, estadoInicial(folderId));
      app.#estado = estados.get(chave);
      this.#instancias.set(chave, app);
    }
    app.render(true);
    return app;
  }

  static DEFAULT_OPTIONS = {
    classes: ['t20g-encontros'],
    window: { title: 'THM.EncounterCalcTitle', icon: 'fa-solid fa-scale-balanced', resizable: true },
    position: { width: 1040, height: 820 },
    actions: {
      removerPJ: EncontrosCalculadoraApp.#onRemoverPJ,
      restaurarParty: EncontrosCalculadoraApp.#onRestaurarParty,
      removerAmeaca: EncontrosCalculadoraApp.#onRemoverAmeaca,
      qtdMais: EncontrosCalculadoraApp.#onQtd,
      qtdMenos: EncontrosCalculadoraApp.#onQtd,
      abrirFicha: EncontrosCalculadoraApp.#onAbrirFicha,
      tokensSelecionados: EncontrosCalculadoraApp.#onTokensSelecionados,
      limparEncontro: EncontrosCalculadoraApp.#onLimparEncontro,
      manualMais: EncontrosCalculadoraApp.#onManual,
      manualMenos: EncontrosCalculadoraApp.#onManual,
      aplicarSugestao: EncontrosCalculadoraApp.#onAplicarSugestao,
      buscarReceita: EncontrosCalculadoraApp.#onBuscarReceita,
      abrirBusca: EncontrosCalculadoraApp.#onAbrirBusca,
      fecharBusca: EncontrosCalculadoraApp.#onFecharBusca,
      adicionarDaBusca: EncontrosCalculadoraApp.#onAdicionarDaBusca,
      recarregarIndice: EncontrosCalculadoraApp.#onRecarregarIndice,
      gerarTesouro: EncontrosCalculadoraApp.#onGerarTesouro,
      verTesouro: EncontrosCalculadoraApp.#onVerTesouro,
      limparTesouro: EncontrosCalculadoraApp.#onLimparTesouro,
      entregarTesouro: EncontrosCalculadoraApp.#onEntregarTesouro,
      montarEncontro: EncontrosCalculadoraApp.#onMontarEncontro,
      removerTema: EncontrosCalculadoraApp.#onRemoverTema,
      criarPasta: EncontrosCalculadoraApp.#onCriarPasta,
      aplicarChefe: EncontrosCalculadoraApp.#onAplicarChefe,
      bando: EncontrosCalculadoraApp.#onBando
    }
  };

  static PARTS = { body: { template: `modules/${MODULE_ID}/templates/encontros/calculadora.hbs` } };

  #folderId = null;
  #estado = null;
  /** Cartões de sugestão do último render — os botões apontam para o índice. */
  #cartoes = [];
  #carregandoIndice = false;
  /** Rolagem de cada lista, guardada antes do render e devolvida depois. */
  #rolagens = new Map();

  get title() {
    const pasta = this.#folderId ? game.folders.get(this.#folderId)?.name : null;
    const base = game.i18n.localize('THM.EncounterCalcTitle');
    return pasta ? `${base} — ${pasta}` : base;
  }

  /* ─── Dados ─────────────────────────────────────────────────────────── */

  #pjs() {
    return this.#estado.party.map(id => game.actors.get(id)).filter(Boolean);
  }

  #grupo() {
    const pjs = this.#pjs();
    const info = ndDoGrupo({
      niveis: pjs.map(nivelDoAtor),
      ritmo: this.#estado.ritmo, perfil: this.#estado.perfil, manual: this.#estado.manual
    });
    const manual = this.#estado.ndModo !== 'auto' ? ndNumero(this.#estado.ndModo) : null;
    return { ...info, ndAuto: info.nd, nd: manual ?? info.nd, manual: !!manual, pjs };
  }

  /** Ameaças que contam no ND (as criaturas de recursos do chefe ficam de fora). */
  #listaCalculo() {
    return this.#estado.ameacas.filter(a => !a.recursoDe).map(a => ({
      id: a.id, nome: a.nome, nd: a.nd, qtd: a.qtd, papel: a.papel, papelFicha: a.papelFicha, chefe: a.chefe
    }));
  }

  async _prepareContext() {
    const st = this.#estado;
    const grupo = this.#grupo();
    const lista = this.#listaCalculo();
    const enc = calcularNDEncontro(lista);
    const alvo = ndAlvo(grupo.nd, st.alvo);
    const faixa = classificar(enc.nd, grupo.nd);
    const nPJs = grupo.pjs.length;
    const pvGrupo = grupo.pjs.reduce((s, a) => s + (Number(a.system?.attributes?.pv?.max) || 0), 0);
    const defesas = grupo.pjs.map(a => Number(a.system?.attributes?.defesa?.value) || 0).filter(Boolean);
    const defesaMedia = defesas.length ? Math.round(defesas.reduce((x, y) => x + y, 0) / defesas.length) : 0;

    this.#cartoes = sugerir({
      ameacas: lista, alvo, ndGrupo: grupo.nd, nivelGrupo: Math.round(grupo.media), nPJs, defesaMediaPJ: defesaMedia, ndEncontro: enc.nd
    });

    // Contribuição de cada ameaça no cálculo (base, +1, +½, +¼, 0).
    const contrib = new Map();
    for (const g of enc.grupos) {
      for (const m of g.membros) {
        contrib.set(m, g.papelNoCalculo === 'base'
          ? { rotulo: 'base', classe: 'base' }
          : g.soma ? { rotulo: `+${g.soma === 0.5 ? '½' : g.soma === 0.25 ? '¼' : g.soma}`, classe: 'soma' }
            : { rotulo: '+0', classe: 'zero' });
      }
    }

    let danoTotal = 0, danoEsperado = 0, pvInimigos = 0, inimigos = 0;
    const ameacas = st.ameacas.map(a => {
      const linha = a.papel !== 'hazard' && a.nd ? parametros(a.papel, a.nd) : null;
      // Ficha já transformada em chefe tem os PV dobrados de verdade.
      const pv = (a.pv ?? linha?.pv ?? 0) * (a.chefe && !a.chefeAplicado ? 2 : 1);
      if (linha) {
        danoTotal += linha.dano * a.qtd;
        danoEsperado += linha.dano * a.qtd * (defesaMedia ? chanceDeAcerto(linha.ataque, defesaMedia) : 1);
        pvInimigos += pv * a.qtd;
        inimigos += a.qtd;
      }
      const desvios = validarFicha({ papel: a.papel, nd: a.nd, pv: a.pv, defesa: a.defesa, resistencias: a.res });
      const chefe = a.chefe ? ajustesChefeFinal(a.nd, a.pv) : null;
      return {
        ...a,
        ndRotulo: ndRotulo(a.nd),
        hazard: a.papel === 'hazard',
        papelRotulo: PAPEIS[a.papel]?.rotulo,
        papelIcone: PAPEIS[a.papel]?.icone,
        papelAlterado: a.papelFicha && a.papelFicha !== a.papel,
        papelFichaRotulo: PAPEIS[a.papelFicha]?.rotulo ?? 'não definido',
        papeis: ['solo', 'lackey', 'special'].map(p => ({ valor: p, rotulo: PAPEIS[p].rotulo, sel: p === a.papel })),
        contrib: contrib.get(a.id),
        linha,
        pvMostrado: pv || null,
        desvios: desvios.map(d => {
          const sinal = d.coluna.startsWith('res') ? '+' : '';
          const lado = d.delta > 0 ? 'acima' : 'abaixo';
          const n = Math.abs(d.delta);
          return `<b>${d.rotulo} ${sinal}${d.valor}</b> — o padrão é ${sinal}${d.esperado}. `
            + `É o valor de uma criatura de ND ${d.ndEquivalente} (${n} ND ${lado}).`;
        }),
        desviosTitulo: `Diferente do padrão da Tabela 2-3 para ${PAPEIS[a.papel]?.rotulo ?? 'Solo'} ND ${ndRotulo(a.nd)}:`,
        chefeInfo: chefe ? `Chefe Final: PV ${chefe.pv ?? '×2'}${chefe.rd ? `, RD ${chefe.rd}` : ''}, Maior que a Morte, ${chefe.recursos} recursos de arena; ND ${ndRotulo(chefe.ndRecompensa)} para XP e tesouro.` : null
      };
    });

    const xp = calcularXP({ ameacas: lista, ndEncontro: enc.nd, nivelGrupo: Math.round(grupo.media), nPJs });
    const nivelRef = Math.round(grupo.media) || 1;
    const temChefe = lista.some(a => a.chefe);
    const ndTesouro = Math.min(20, enc.nd + (temChefe ? 2 : 0));

    // Régua de dificuldade: posição do encontro e do alvo em −6…+6 do grupo.
    const pos = d => Math.max(0, Math.min(100, ((d + 6) / 12) * 100));
    const dEnc = enc.nd ? passosND(enc.nd) - passosND(grupo.nd) : null;
    const dAlvo = passosND(alvo) - passosND(grupo.nd);
    const faixasRegua = FAIXAS.map((f, i) => {
      const de = i ? FAIXAS[i - 1].ate + 1 : -6;
      const ate = Math.min(f.ate, 6);
      return { ...f, largura: ((ate - Math.max(de, -6) + 1) / 13) * 100 };
    });

    const pjs = grupo.pjs.map(a => ({
      id: a.id, nome: a.name, img: a.img, nivel: nivelDoAtor(a),
      pv: Number(a.system?.attributes?.pv?.max) || 0,
      classe: a.items?.filter(i => i.type === 'classe').map(i => `${i.name} ${i.system?.niveis ?? ''}`.trim()).join(' / ')
    }));
    const naParty = new Set(st.party);
    const disponiveis = game.actors.filter(a => a.type === 'character' && !naParty.has(a.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map(a => ({ id: a.id, nome: a.name, nivel: nivelDoAtor(a) }));

    return {
      st,
      pjs, disponiveis, nPJs, pvGrupo,
      grupo: {
        nd: ndRotulo(grupo.nd), ndAuto: ndRotulo(grupo.ndAuto), manual: grupo.manual,
        media: grupo.media ? grupo.media.toFixed(1).replace('.', ',') : '—',
        faixaNiveis: grupo.n ? (grupo.min === grupo.max ? `${grupo.min}` : `${grupo.min}–${grupo.max}`) : '—',
        patamar: grupo.n ? patamar(grupo.nd).rotulo : '—',
        partes: grupo.partes.map(p => ({ ...p, sinal: p === grupo.partes[0] ? String(p.valor) : (p.valor > 0 ? `+${p.valor}` : String(p.valor)) }))
      },
      opcoesND: ORDEM_ND.map(v => ({ valor: v, sel: st.ndModo === v })),
      alvos: ALVOS.map(a => ({ ...a, sel: a.id === st.alvo, nd: ndRotulo(ndAlvo(grupo.nd, a.id)) })),
      ritmos: RITMOS.map(r => ({ ...r, sel: r.id === st.ritmo })),
      perfis: PERFIS_MESA.map(p => ({ ...p, sel: p.id === st.perfil })),
      enc: {
        nd: enc.rotulo, vazio: !lista.length, passos: enc.passos,
        bruto: enc.bruto ? String(Math.round(enc.bruto * 100) / 100).replace('.', ',') : null,
        patamar: enc.nd ? patamar(enc.nd).rotulo : null
      },
      alvoND: ndRotulo(alvo),
      faixa, faixasRegua,
      marcadorEnc: dEnc === null ? null : pos(dEnc),
      marcadorAlvo: pos(dAlvo),
      ameacas, inimigos,
      ameaca: {
        dano: danoTotal, esperado: Math.round(danoEsperado), defesaMedia, pvInimigos, pvGrupo,
        rodadas: danoEsperado && pvGrupo ? Math.ceil(pvGrupo / danoEsperado) : null,
        pctDano: pvGrupo ? Math.min(100, Math.round((danoEsperado / pvGrupo) * 100)) : 0,
        acoes: `${inimigos} × ${nPJs}`
      },
      xp: {
        ...xp,
        ate: encontrosAteSubir(nivelRef, xp.porAmeacaPJ),
        temChefe
      },
      tesouro: this.#contextoTesouro(ndTesouro),
      cartoes: this.#cartoes.map((c, i) => ({
        ...c, i,
        acoes: (c.acoes ?? []).map((ac, j) => ({ ...ac, chave: `${i}:${j}` })),
        receitas: c.receitas?.map((r, k) => ({ ...r, partes: r.partes.map((p, j) => ({ ...p, chave: `${i}:${k}:${j}`, ndRotulo: ndRotulo(p.nd), papelRotulo: PAPEIS[p.papel].rotulo })) }))
      })),
      montar: this.#contextoMontar(alvo),
      busca: await this.#contextoBusca(lista, alvo)
    };
  }

  /** ND da rolagem "pelo encontro": o escolhido, ou o do encontro (+2 com chefe). */
  #ndDoTesouro() {
    const tt = this.#estado.tesouro;
    if (tt.ndModo !== 'auto') return ndNumero(tt.ndModo);
    const enc = calcularNDEncontro(this.#listaCalculo());
    return Math.min(20, enc.nd + (this.#estado.ameacas.some(a => a.chefe) ? 2 : 0));
  }

  /**
   * Tooltip do "Rolar": cada clique é uma rolagem Padrão; a categoria da
   * ficha (LB p. 327) o Mestre aplica clicando de novo ou cortando o dinheiro.
   */
  #dicaCategorias() {
    const fichas = this.#estado.ameacas.filter(a => !a.recursoDe && a.nd > 0)
      .map(a => `${esc(a.nome)}: <b>${CATEGORIAS[categoriaDoTesouro(a.tesouro)].rotulo}</b>`);
    return `Cada clique rola o tesouro uma vez (Padrão) e soma ao que já existe.<br>`
      + `<b>Dobro:</b> clique 2 vezes · <b>Triplo:</b> 3 vezes · <b>Metade:</b> role e corte o dinheiro em Ver e editar · <b>Nenhum:</b> não role.`
      + (fichas.length ? `<br><br>Na ficha:<br>${fichas.join('<br>')}` : '');
  }

  #contextoTesouro(ndAuto) {
    const st = this.#estado;
    let tt = st.tesouro;
    // Estado de uma versão anterior da janela (sem o modelo achatado): recomeça.
    if (!tt?.moedas) tt = st.tesouro = novoTesouro();
    const maior = st.ameacas.filter(a => !a.recursoDe).sort((x, y) => y.nd - x.nd)[0];
    const temAlgo = tt.itens.length || Object.values(tt.moedas).some(v => v > 0);
    const destinos = [{ id: 'pasta', rotulo: 'Pasta de itens (Hayd GMTools)' },
      ...st.ameacas.filter(a => a.papel !== 'hazard').map(a => ({ id: a.id, rotulo: `Inventário: ${a.nome}` }))];
    if (!destinos.some(d => d.id === tt.destino)) tt.destino = 'pasta';
    return {
      modo: tt.modo, ndModo: tt.ndModo, ndAuto: ndRotulo(ndAuto),
      opcoesND: ORDEM_ND.slice(0, 22).map(v => ({ valor: v, sel: v === tt.ndModo })),
      dica: this.#dicaCategorias(),
      // Prévia: a categoria escrita em cada ficha (o Mestre aplica clicando de novo).
      categoriasFicha: st.ameacas.filter(a => !a.recursoDe && a.nd > 0).map(a => {
        const id = categoriaDoTesouro(a.tesouro);
        return { nome: a.qtd > 1 ? `${a.qtd} × ${a.nome}` : a.nome, id, rotulo: CATEGORIAS[id].rotulo, texto: a.tesouro };
      }),
      gerado: !!temAlgo,
      moedas: textoMoedas(tt.moedas),
      nItens: tt.itens.length,
      nRolagens: tt.rolagens.length,
      desatualizado: !!tt.assinatura && tt.assinatura !== assinaturaDoEncontro(st.ameacas),
      destinos: destinos.map(d => ({ ...d, sel: d.id === tt.destino }))
    };
  }

  #contextoMontar(alvo) {
    const m = this.#estado.montar ??= novoMontador();
    const carregando = !this.#garantirIndice();
    const grupos = new Map();
    for (const e of ESTRUTURAS) {
      const r = montarEstrutura(e, alvo);
      const ok = r && r.dist === 0;
      if (!grupos.has(e.grupo)) grupos.set(e.grupo, []);
      grupos.get(e.grupo).push({
        id: e.id, sel: e.id === m.estrutura, disabled: !ok,
        rotulo: ok ? e.rotulo : `${e.rotulo} (inviável no ND ${ndRotulo(alvo)})`
      });
    }
    const fontes = carregando ? []
      : [...new Map(indiceCache.map(e => [e.fonteId, e.fonte])).entries()].map(([id, nome]) => ({ id, nome, sel: id === m.fonte }));
    const temas = carregando ? []
      : temasDisponiveis(indiceCache, CONFIG.T20?.creatureTypes ?? {});
    const rotulos = new Map(temas.flatMap(g => g.temas).map(t => [t.id, t.rotulo]));
    return {
      grupos: [...grupos.entries()].map(([nome, opcoes]) => ({ nome, opcoes })), aleatoria: m.estrutura === 'aleatoria',
      carregando, fontes,
      temas: temas.map(g => ({ ...g, temas: g.temas.filter(t => !m.temas.includes(t.id)) })),
      escolhidos: carregando ? [] : m.temas.map(id => ({ id, rotulo: rotulos.get(id) ?? id })),
      ambientes: AMBIENTES.map(a => ({ ...a, sel: a.id === m.ambiente })),
      filtrando: !!(m.temas.length || m.ambiente)
    };
  }

  /** Dispara a leitura dos compêndios uma vez; true quando o índice já está pronto. */
  #garantirIndice() {
    if (indiceCache) return true;
    if (!this.#carregandoIndice) {
      this.#carregandoIndice = true;
      indiceAmeacas().finally(() => { this.#carregandoIndice = false; this.render(); });
    }
    return false;
  }

  async #contextoBusca(lista, alvo) {
    const b = this.#estado.busca;
    if (!b.aberta) return { aberta: false };
    if (!this.#garantirIndice()) return { aberta: true, carregando: true, ...b };
    const desejado = b.papel || papelQueFalta(lista);
    const qtdPedida = Number(b.qtd) || 0;
    const ndMin = ndNumero(b.ndMin), ndMax = ndNumero(b.ndMax);
    const fontes = [...new Map(indiceCache.map(e => [e.fonteId, e.fonte])).entries()]
      .map(([id, nome]) => ({ id, nome, sel: id === b.fonte }));
    const resultados = indiceCache
      .filter(e => (!b.papel || (e.papelFicha || 'solo') === b.papel)
        && (!ndMin || e.nd >= ndMin) && (!ndMax || e.nd <= ndMax)
        && (!b.fonte || e.fonteId === b.fonte))
      .map(e => {
        const papel = e.papelFicha || 'solo';
        const av = avaliarCandidata(lista, alvo, { nd: e.nd, papel }, desejado);
        return { ...e, papel, av };
      })
      .sort((x, y) => x.av.pontos - y.av.pontos || x.nome.localeCompare(y.nome, 'pt-BR'))
      .slice(0, 150)
      .map(e => ({
        uuid: e.uuid, nome: e.nome, img: e.img, fonte: e.fonte, ndRotulo: ndRotulo(e.nd),
        papelRotulo: PAPEIS[e.papel]?.rotulo, papelIcone: PAPEIS[e.papel]?.icone, semPapel: !e.papelFicha,
        qtd: qtdPedida || e.av.qtd, ndResultante: ndRotulo(e.av.nd), exato: e.av.dist === 0,
        chave: e.nome.toLocaleLowerCase('pt-BR')
      }));
    return {
      aberta: true, ...b, resultados, total: indiceCache.length, fontes,
      desejado: desejado ? PAPEIS[desejado].rotulo : null,
      papeis: ['solo', 'lackey', 'special', 'hazard'].map(p => ({ valor: p, rotulo: PAPEIS[p].rotulo, sel: p === b.papel })),
      opcoesND: ORDEM_ND.map(v => ({ valor: v, min: v === b.ndMin, max: v === b.ndMax }))
    };
  }

  /* ─── Render ─────────────────────────────────────────────────────────── */

  #guardarRolagens() {
    // Ao reabrir, o v14 ainda guarda a janela antiga, fora da tela e com rolagem 0.
    if (!this.element?.isConnected) return;
    for (const el of this.element.querySelectorAll('[data-rola]')) {
      this.#rolagens.set(el.dataset.rola, el.scrollTop);
    }
  }

  async _preRender(context, options) {
    await super._preRender?.(context, options);
    this.#guardarRolagens();
  }

  /** Reabrir a janela volta para onde ela estava. */
  async _preClose(options) {
    await super._preClose?.(options);
    this.#guardarRolagens();
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const el = this.element;
    for (const r of el.querySelectorAll('[data-rola]')) {
      const top = this.#rolagens.get(r.dataset.rola);
      if (top) r.scrollTop = top;
    }

    const st = this.#estado;
    const ligar = (nome, fn) => el.querySelector(`[name="${nome}"]`)?.addEventListener('change', ev => { fn(ev.currentTarget.value); this.render(); });
    ligar('ndModo', v => { st.ndModo = v; });
    ligar('alvo', v => { st.alvo = v; });
    ligar('ritmo', v => { st.ritmo = v; });
    ligar('perfil', v => { st.perfil = v; });
    ligar('adicionarPJ', v => { if (v && !st.party.includes(v)) st.party.push(v); });
    ligar('buscaPapel', v => { st.busca.papel = v; st.busca.qtd = 0; });
    ligar('buscaNdMin', v => { st.busca.ndMin = v; st.busca.qtd = 0; });
    ligar('buscaNdMax', v => { st.busca.ndMax = v; st.busca.qtd = 0; });
    ligar('montarEstrutura', v => { st.montar.estrutura = v; });
    ligar('tesouroModo', v => { st.tesouro.modo = v; });
    ligar('tesouroND', v => { st.tesouro.ndModo = v; });
    el.querySelector('[name="titulo"]')?.addEventListener('input', ev => { st.titulo = ev.currentTarget.value; });
    ligar('tesouroDestino', v => { st.tesouro.destino = v; });
    ligar('montarFonte', v => { st.montar.fonte = v; });
    ligar('montarTema', v => { if (v && !st.montar.temas.includes(v)) st.montar.temas.push(v); });
    ligar('montarAmbiente', v => { st.montar.ambiente = v; });
    ligar('buscaFonte', v => { st.busca.fonte = v; });

    for (const sel of el.querySelectorAll('select[data-papel-de]')) {
      sel.addEventListener('change', () => {
        const a = st.ameacas.find(x => x.id === sel.dataset.papelDe);
        if (a) a.papel = sel.value;
        this.render();
      });
    }

    // Filtro de texto: esconde linhas sem re-renderizar (não perde o foco).
    const campo = el.querySelector('[name="buscaTexto"]');
    if (campo) {
      const filtrar = () => {
        const t = campo.value.trim().toLocaleLowerCase('pt-BR');
        st.busca.texto = campo.value;
        for (const li of el.querySelectorAll('[data-busca-nome]')) {
          li.hidden = !!t && !li.dataset.buscaNome.includes(t);
        }
      };
      campo.addEventListener('input', filtrar);
      filtrar();
    }
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.element.addEventListener('dragover', ev => {
      ev.preventDefault();
      this.element.querySelector('.t20g-enc')?.classList.add('t20g-enc--sobre');
    });
    this.element.addEventListener('dragleave', ev => {
      if (!this.element.contains(ev.relatedTarget)) this.element.querySelector('.t20g-enc')?.classList.remove('t20g-enc--sobre');
    });
    this.element.addEventListener('drop', ev => this.#aoSoltar(ev));
  }

  async #aoSoltar(ev) {
    ev.preventDefault();
    this.element.querySelector('.t20g-enc')?.classList.remove('t20g-enc--sobre');
    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
    const dados = TE.getDragEventData(ev);
    if (!dados?.uuid) return;
    if (dados.type === 'Folder') {
      const pasta = await fromUuid(dados.uuid);
      for (const a of pasta?.contents ?? []) await this.#adicionarDoc(a, 1, false);
      return this.render();
    }
    if (dados.type === 'Item') {
      const item = await fromUuid(dados.uuid);
      if (item) this.#estado.tesouro.itens.push(itemManual({ doc: item }));
      atualizarTesouroEncontro(this.#estado.tesouro);
      return this.render();
    }
    if (dados.type !== 'Actor') return;
    const doc = await fromUuid(dados.uuid);
    if (doc) await this.#adicionarDoc(doc, 1, false);
    this.render();
  }

  /** Personagem vai para o grupo; ameaça (npc/perigo) vai para o encontro. */
  async #adicionarDoc(doc, qtd = 1, renderizar = true) {
    if (doc.type === 'character') {
      if (doc.pack) return ui.notifications.warn(game.i18n.localize('THM.EncounterCalcPackCharacter'));
      if (!this.#estado.party.includes(doc.id)) this.#estado.party.push(doc.id);
    } else if (TIPOS_AMEACA.includes(doc.type)) {
      const d = dadosDaAmeaca(doc);
      if (!d.nd) ui.notifications.warn(game.i18n.format('THM.EncounterCalcNoND', { nome: doc.name }));
      const existente = this.#estado.ameacas.find(a => a.uuid === d.uuid);
      if (existente) existente.qtd = Math.min(32, existente.qtd + qtd);
      else this.#estado.ameacas.push({ id: novoId(), ...d, nd: d.nd ?? 1, qtd, chefe: d.chefeAplicado });
    }
    if (renderizar) this.render();
  }

  async #adicionarAtores(atores) {
    let n = 0;
    for (const a of atores) {
      if (!a || a.type === 'character' || !TIPOS_AMEACA.includes(a.type)) continue;
      await this.#adicionarDoc(a, 1, false);
      n++;
    }
    if (!n) ui.notifications.info(game.i18n.localize('THM.EncounterCalcNoThreats'));
    this.render();
  }

  /* ─── Ações ──────────────────────────────────────────────────────────── */

  static #onRemoverPJ(ev, alvo) {
    this.#estado.party = this.#estado.party.filter(id => id !== alvo.dataset.id);
    this.render();
  }

  static #onRestaurarParty() {
    this.#estado.party = estadoInicial(this.#folderId).party;
    this.render();
  }

  static #onRemoverAmeaca(ev, alvo) {
    this.#estado.ameacas = this.#estado.ameacas.filter(a => a.id !== alvo.dataset.id);
    this.render();
  }

  static #onQtd(ev, alvo) {
    const a = this.#estado.ameacas.find(x => x.id === alvo.dataset.id);
    if (!a) return;
    a.qtd = Math.max(1, Math.min(32, a.qtd + (alvo.dataset.action === 'qtdMais' ? 1 : -1)));
    this.render();
  }

  static async #onAbrirFicha(ev, alvo) {
    const doc = await fromUuid(alvo.dataset.uuid);
    doc?.sheet?.render(true);
  }

  static #onTokensSelecionados() {
    const atores = (canvas?.tokens?.controlled ?? []).map(t => t.actor);
    if (!atores.length) return ui.notifications.info(game.i18n.localize('THM.EncounterCalcNoTokens'));
    this.#adicionarAtores(atores);
  }

  static #onLimparEncontro() {
    this.#estado.ameacas = [];
    this.render();
  }

  static #onManual(ev, alvo) {
    const st = this.#estado;
    st.manual = Math.max(-5, Math.min(5, st.manual + (alvo.dataset.action === 'manualMais' ? 1 : -1)));
    this.render();
  }

  static #onAplicarSugestao(ev, alvo) {
    const [i, j] = alvo.dataset.chave.split(':').map(Number);
    const acao = this.#cartoes[i]?.acoes?.[j];
    if (!acao) return;
    const st = this.#estado;
    const a = st.ameacas.find(x => x.id === acao.id);
    switch (acao.tipo) {
      case 'qtd': if (a) a.qtd = acao.qtd; break;
      case 'remover': st.ameacas = st.ameacas.filter(x => x.id !== acao.id); break;
      case 'papel': if (a) a.papel = acao.papel; break;
      case 'chefe': if (a) a.chefe = acao.valor; break;
      case 'buscar':
        Object.assign(st.busca, {
          aberta: true, papel: acao.papel ?? '', qtd: acao.qtd ?? 0,
          ndMin: acao.nd ? ndRotulo(acao.nd) : '', ndMax: acao.nd ? ndRotulo(acao.nd) : '', texto: ''
        });
        break;
    }
    this.render();
  }

  static #onBuscarReceita(ev, alvo) {
    const [i, k, j] = alvo.dataset.chave.split(':').map(Number);
    const parte = this.#cartoes[i]?.receitas?.[k]?.partes?.[j];
    if (!parte) return;
    const nd = ndRotulo(parte.nd);
    Object.assign(this.#estado.busca, { aberta: true, papel: parte.papel, ndMin: nd, ndMax: nd, texto: '', qtd: parte.qtd });
    this.render();
  }

  static #onAbrirBusca() {
    Object.assign(this.#estado.busca, { aberta: true, papel: '', ndMin: '', ndMax: '', qtd: 0 });
    this.render();
  }

  static #onFecharBusca() {
    this.#estado.busca.aberta = false;
    this.render();
  }

  static async #onAdicionarDaBusca(ev, alvo) {
    const doc = await fromUuid(alvo.dataset.uuid);
    if (!doc) return;
    await this.#adicionarDoc(doc, Number(alvo.dataset.qtd) || 1);
  }

  static #onRecarregarIndice() {
    indiceCache = null;
    this.render();
  }

  /** Rola no modo rápido e SOMA ao tesouro que já existe. */
  static async #onGerarTesouro() {
    const st = this.#estado;
    if (!st.ameacas.length) return ui.notifications.info(game.i18n.localize('THM.EncounterCalcEmpty'));
    await rolarTesouroDoEncontro(st.tesouro, { modo: st.tesouro.modo, ameacas: st.ameacas, ndEncontro: this.#ndDoTesouro() });
    st.tesouro.assinatura = assinaturaDoEncontro(st.ameacas);
    atualizarTesouroEncontro(st.tesouro);
    this.render();
  }

  static #onVerTesouro() {
    abrirTesouroEncontro(this.#estado.tesouro, () => this.render());
  }

  static async #onLimparTesouro() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('THM.EncounterTreasureSummary') },
      content: `<p>${game.i18n.localize('THM.EncounterTreasureClear')}</p>`, rejectClose: false
    });
    if (!ok) return;
    const tt = this.#estado.tesouro;
    Object.assign(tt, tesouroVazio(), { assinatura: null });
    atualizarTesouroEncontro(tt);
    this.render();
  }

  /** Entrega o tesouro ao destino escolhido e o zera. */
  static async #onEntregarTesouro() {
    const st = this.#estado;
    const tt = st.tesouro;
    if (!tt.itens.length && !Object.values(tt.moedas).some(v => v > 0)) return;
    if (tt.destino === 'pasta') {
      const grupo = this.#grupo();
      const enc = calcularNDEncontro(this.#listaCalculo());
      const faixa = classificar(enc.nd, grupo.nd);
      const sugestao = st.titulo?.trim() || `ND ${ndRotulo(enc.nd)}${faixa ? ` (${faixa.rotulo})` : ''}`;
      const nome = await foundry.applications.api.DialogV2.prompt({
        window: { title: game.i18n.localize('THM.EncounterTreasureSummary'), icon: 'fa-solid fa-folder-plus' },
        content: `<div class="t20g-enc-dialogo"><div class="form-group">
          <label>Tesouro do encontro:</label>
          <input type="text" name="nome" value="${esc(sugestao)}" autofocus>
        </div></div>`,
        ok: { label: game.i18n.localize('THM.EncounterTreasureDeliver'), callback: (ev, btn) => btn.form.elements.nome.value.trim() || sugestao },
        rejectClose: false
      });
      if (!nome) return;
      await entregarParaPasta(tt, nome);
      ui.notifications.info(game.i18n.format('THM.EncounterTreasureToFolder', { nome }));
    } else {
      const a = st.ameacas.find(x => x.id === tt.destino);
      let doc = a && await fromUuid(a.uuid);
      if (!doc) return;
      // Ficha de compêndio: importa para o mundo (Hayd GMTools) e passa a usar a cópia.
      if (doc.pack) {
        doc = await Actor.create({ ...game.actors.fromCompendium(doc), folder: (await pastaGMTools()).id });
        a.uuid = doc.uuid;
      }
      await entregarParaAtor(tt, doc);
      ui.notifications.info(game.i18n.format('THM.EncounterTreasureToActor', { nome: doc.name }));
    }
    Object.assign(tt, tesouroVazio(), { assinatura: null });
    atualizarTesouroEncontro(tt);
    this.render();
  }

  /** Aplicador de Bando para uma linha: só no encontro, ou criando a ficha. */
  static async #onBando(ev, alvo) {
    const a = this.#estado.ameacas.find(x => x.id === alvo.dataset.id);
    if (!a) return;
    const doc = await fromUuid(a.uuid);
    if (!doc) return;
    abrirBando(doc, {
      atual: a.bando ?? null,
      aoUsarNoEncontro: cfg => { aplicarBandoNaLinha(a, cfg, doc); this.render(); },
      aoCriar: ator => {
        Object.assign(a, dadosDaAmeaca(ator), { papel: a.papel });
        delete a.bando;
        this.render();
      }
    });
  }

  static #onRemoverTema(ev, alvo) {
    const m = this.#estado.montar;
    m.temas = m.temas.filter(t => t !== alvo.dataset.tema);
    this.render();
  }

  /** "Monte um encontro pra mim": estrutura + criaturas sorteadas dos compêndios. */
  static async #onMontarEncontro() {
    const st = this.#estado;
    const grupo = this.#grupo();
    const alvo = ndAlvo(grupo.nd, st.alvo);
    const viaveis = ESTRUTURAS.filter(e => montarEstrutura(e, alvo)?.dist === 0);
    const aleatoria = st.montar.estrutura === 'aleatoria';
    // "Surpreenda-me" experimenta estruturas em ordem aleatória e fica com a
    // primeira que fecha o alvo com as criaturas que existem nos compêndios.
    const { temas, ambiente, fonte } = st.montar;
    const filtrando = !!(temas.length || ambiente);
    const candidatas = aleatoria
      ? [...viaveis].sort(() => Math.random() - 0.5)
      : [ESTRUTURAS.find(e => e.id === st.montar.estrutura)].filter(Boolean);
    if (!candidatas.length) return ui.notifications.warn(game.i18n.format('THM.EncounterBuildNone', { nd: ndRotulo(alvo) }));
    // Com vários temas, estruturas com partes para todos vêm primeiro.
    if (aleatoria) candidatas.sort((a, b) => (b.partes.length >= temas.length) - (a.partes.length >= temas.length));

    const indice = (await indiceAmeacas()).filter(e => (!fonte || e.fonteId === fonte)
      && combinaAmbiente(e, ambiente) && (!temas.length || temas.some(t => combinaTema(e, t))));
    if (!indice.length) return ui.notifications.warn(game.i18n.localize('THM.EncounterBuildNoTheme'));
    const porTema = new Map(temas.map(t => [t, indice.filter(e => combinaTema(e, t))]));
    // Sorteia algumas vezes e fica com o primeiro que bate o alvo (ou o mais
    // perto): quando falta criatura no ND exato, a vizinha pode desequilibrar.
    const sortear = partes => {
      let m = null;
      for (let tentativa = 0; tentativa < 12; tentativa++) {
        const usados = new Set();
        // Cada parte começa por um tema, para "Monstro + Morto-vivo" trazer os dois.
        const ordem = [...temas].sort(() => Math.random() - 0.5);
        const escolhas = partes.map((parte, i) => {
          const buscada = parteDeSorteio(parte);
          const doTema = ordem.length ? porTema.get(ordem[i % ordem.length]) : null;
          const e = (doTema && sortearCriatura(doTema, buscada, usados, filtrando)) ?? sortearCriatura(indice, buscada, usados, filtrando);
          if (e) usados.add(e.nome);
          return { parte, e };
        });
        const nd = calcularNDEncontro(escolhas.filter(x => x.e).map((x, i) => ({ id: String(i), nd: ndEfetivo(x.parte, x.e), qtd: x.parte.qtd }))).nd;
        const semTema = temas.filter(t => !escolhas.some(x => x.e && combinaTema(x.e, t))).length;
        const dist = Math.abs(passosND(nd) - passosND(alvo)) + escolhas.filter(x => !x.e).length * 10 + semTema;
        if (!m || dist < m.dist) m = { escolhas, dist, semTema };
        if (!dist) break;
      }
      return m;
    };
    let melhor = null;
    let estrutura = null;
    for (const e of candidatas) {
      const r = sortear(montarEstrutura(e, alvo).partes);
      if (!melhor || r.dist < melhor.dist) { melhor = r; estrutura = e; }
      if (!r.dist) break;
    }
    const novas = [];
    const faltas = [];
    for (const { parte, e } of melhor.escolhas) {
      if (!e) { faltas.push(`${parte.bando ? 'Bando' : PAPEIS[parte.papel].rotulo} ND ${ndRotulo(parte.nd)}`); continue; }
      const doc = await fromUuid(e.uuid);
      if (!doc) continue;
      const d = dadosDaAmeaca(doc);
      // Ficha sem papel fica com o da parte; com filtro, a ficha pode ter vindo de outro papel.
      const papel = !parte.bando && e.papelFicha ? e.papelFicha : parte.papel;
      const linha = { id: novoId(), ...d, nd: d.nd ?? parte.nd, papel, qtd: parte.qtd, chefe: !!parte.chefe };
      if (parte.bando) {
        const ndBando = ndEfetivo(parte, e);
        aplicarBandoNaLinha(linha, { escala: parte.bando, ndBando, nome: nomeDoBando(doc.name) }, doc);
      }
      novas.push(linha);
    }
    if (!novas.length) return ui.notifications.warn(game.i18n.localize('THM.EncounterBuildEmpty'));
    // Compêndios com poucas criaturas: sem ND exato, o sorteio usa um vizinho e
    // o encontro pode sair 1 ND fora. Corrige mexendo só nas quantidades (sem
    // tirar ninguém e sem passar de 12 por linha), o que mantém a estrutura.
    for (let volta = 0; volta < 3; volta++) {
      const conta = novas.map(a => ({ id: a.id, nome: a.nome, nd: a.nd, qtd: a.qtd }));
      if (calcularNDEncontro(conta).nd === alvo) break;
      const op = ajustesDeQuantidade(conta, alvo).find(o => o.para > 0 && o.para <= 12 && !novas.find(a => a.id === o.id)?.bando);
      if (!op) break;
      novas.find(a => a.id === op.id).qtd = op.para;
    }
    st.ameacas = novas;
    const nd = calcularNDEncontro(novas.map(a => ({ id: a.id, nd: a.nd, qtd: a.qtd }))).nd;
    ui.notifications.info(game.i18n.format('THM.EncounterBuildDone', { estrutura: estrutura.rotulo, nd: ndRotulo(nd) }));
    if (nd !== alvo) ui.notifications.warn(game.i18n.format('THM.EncounterBuildOff', { nd: ndRotulo(nd), alvo: ndRotulo(alvo) }));
    if (faltas.length) ui.notifications.warn(game.i18n.format('THM.EncounterBuildMissing', { faltas: faltas.join(', ') }));
    if (melhor.semTema) ui.notifications.warn(game.i18n.localize('THM.EncounterBuildThemeLeft'));
    this.render();
  }

  /**
   * Cria uma pasta de atores com uma cópia de cada ameaça do encontro. Os
   * originais (mundo ou compêndio) não são tocados. Com mais de uma criatura
   * igual, a FICHA vira "x2 Nome"; o token continua com o nome original.
   */
  static async #onCriarPasta() {
    const st = this.#estado;
    if (!st.ameacas.length) return ui.notifications.info(game.i18n.localize('THM.EncounterCalcEmpty'));
    const grupo = this.#grupo();
    const enc = calcularNDEncontro(this.#listaCalculo());
    const faixa = classificar(enc.nd, grupo.nd);
    const sugestao = st.titulo?.trim() ? `Encontro: ${st.titulo.trim()}` : `Encontro ND ${ndRotulo(enc.nd)}${faixa ? ` (${faixa.rotulo})` : ''}`;

    const nome = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize('THM.EncounterFolderTitle'), icon: 'fa-solid fa-folder-plus' },
      content: `<div class="t20g-enc-dialogo"><div class="form-group">
        <label>${esc(game.i18n.localize('THM.EncounterFolderName'))}</label>
        <input type="text" name="nome" value="${esc(sugestao)}" autofocus>
      </div></div>`,
      ok: { label: game.i18n.localize('THM.EncounterFolderCreate'), icon: 'fa-solid fa-folder-plus',
        callback: (ev, btn) => btn.form.elements.nome.value.trim() || sugestao },
      rejectClose: false
    });
    if (!nome) return;

    const pasta = await criarPastaDeEncontro(nome);
    const dados = [];
    const origem = [];
    const bandos = [];
    for (const a of st.ameacas) {
      const doc = await fromUuid(a.uuid);
      if (!doc) continue;
      // Bando só no encontro: a ficha do bando nasce aqui, já na pasta.
      if (a.bando) { bandos.push({ a, doc }); continue; }
      const base = doc.pack ? game.actors.fromCompendium(doc) : doc.toObject();
      delete base._id;
      base.folder = pasta.id;
      base.name = a.qtd > 1 ? `x${a.qtd} ${doc.name}` : doc.name;
      // O token continua com o nome da criatura, sem o "x2".
      base.prototypeToken = { ...(base.prototypeToken ?? {}), name: doc.prototypeToken?.name || doc.name };
      // O papel escolhido na calculadora vai para a cópia (a ficha original fica como estava).
      if (a.papel !== 'hazard' && a.papel !== a.papelFicha) foundry.utils.setProperty(base, 'system.detalhes.role', a.papel);
      dados.push(base);
      origem.push(a);
    }
    const criados = await Actor.createDocuments(dados);
    // Marcado como chefe só na calculadora: a cópia já sai com os ajustes.
    for (const [i, a] of origem.entries()) {
      if (a.chefe && !a.chefeAplicado && criados[i] && !ehChefeFinal(criados[i])) await aplicarChefeFinal(criados[i]);
    }
    for (const { a, doc } of bandos) {
      const ator = await criarFichaBando(doc, { escala: a.bando.escala, ndBando: a.bando.ndBando, nome: a.nome, folder: pasta.id });
      if (a.qtd > 1) await ator.update({ name: `x${a.qtd} ${ator.name}` });
      if (a.chefe) await aplicarChefeFinal(ator);
    }
    ui.notifications.info(game.i18n.format('THM.EncounterFolderDone', { nome, n: dados.length + bandos.length }));
  }

  /**
   * Abre o aplicador de Chefe Final para uma ameaça do encontro. Ficha de
   * compêndio é importada para o mundo antes (o compêndio não é alterado), e
   * a linha passa a apontar para a cópia.
   */
  static async #onAplicarChefe(ev, alvo) {
    const a = this.#estado.ameacas.find(x => x.id === alvo.dataset.id);
    if (!a) return;
    const doc = await fromUuid(a.uuid);
    if (!doc) return;
    abrirChefeFinal(doc, {
      marcadoNoCalculo: !!a.chefe,
      aoMarcar: valor => { a.chefe = valor; this.render(); },
      // Ficha de compêndio é importada para o mundo só na hora de aplicar (o
      // compêndio não é alterado), e a linha passa a apontar para a cópia.
      importar: async origem => {
        const copia = await Actor.create({ ...game.actors.fromCompendium(origem), folder: (await pastaGMTools()).id });
        a.uuid = copia.uuid;
        ui.notifications.info(game.i18n.format('THM.BossImported', { nome: copia.name }));
        return copia;
      },
      aoAplicar: async (ator, aplicado, cfg) => {
        Object.assign(a, dadosDaAmeaca(ator), { papel: a.papel, chefe: aplicado });
        // Criaturas dos recursos Lacaios e Campeão Secreto entram no encontro
        // como parte do chefe: aparecem na lista, mas não contam para o ND nem
        // para recompensas (AdA p. 368). Reaplicar troca as anteriores.
        const st = this.#estado;
        st.ameacas = st.ameacas.filter(x => x.recursoDe !== a.id);
        if (aplicado && cfg) {
          const criaturas = [
            ...(cfg.recursos.includes('lacaios') ? cfg.escolhas.lacaios ?? [] : []),
            ...(cfg.recursos.includes('campeao') && cfg.escolhas.campeao ? [cfg.escolhas.campeao] : [])
          ];
          for (const c of criaturas) {
            const doc = await fromUuid(c.uuid);
            if (!doc) continue;
            st.ameacas.push({ id: novoId(), ...dadosDaAmeaca(doc), papel: 'lackey', qtd: 1, chefe: false, recursoDe: a.id });
          }
        }
        this.render();
      }
    });
  }

}

/** Para um bando, sorteia a criatura-base: 3 (ou 7) ND abaixo, de preferência lacaio. */
function parteDeSorteio(parte) {
  if (!parte.bando) return parte;
  const nd = Math.max(1, Math.floor(parte.nd) - ESCALAS[parte.bando].padrao);
  return { ...parte, nd, papeis: ['lackey', 'solo', 'special'] };
}

/** ND com que a escolha entra no encontro (o bando usa o ND do bando). */
function ndEfetivo(parte, e) {
  if (!parte.bando) return e.nd;
  return Math.min(20, Math.max(1, Math.floor(e.nd)) + ESCALAS[parte.bando].padrao);
}

/**
 * Sorteia uma criatura do índice para uma parte da estrutura: o ND mais próximo
 * (até 1 de distância) no papel pedido. `amplo` é para índices filtrados, com
 * poucas criaturas: aceita até 3 ND de distância e outros papéis.
 */
function sortearCriatura(indice, parte, usados, amplo = false) {
  const pedidos = parte.papeis ?? [parte.papel];
  const papeis = amplo ? [...new Set([...pedidos, ...(parte.chefe ? ['solo', 'special'] : ['solo', 'special', 'lackey'])])] : pedidos;
  for (const tol of amplo ? [0, 1, 2, 3] : [0, 1]) {
    // Com vários papéis, tenta cada um em ordem de preferência.
    for (const papel of papeis) {
      const cand = indice.filter(e => (e.papelFicha || 'solo') === papel && Math.abs(passosND(e.nd) - passosND(parte.nd)) <= tol);
      if (!cand.length) continue;
      const novos = cand.filter(e => !usados.has(e.nome));
      const pool = novos.length ? novos : cand;
      return pool[Math.floor(Math.random() * pool.length)];
    }
  }
  return null;
}

export function abrirCalculadoraEncontros(opcoes = {}) {
  if (!game.user.isGM) return null;
  return EncontrosCalculadoraApp.abrir(opcoes);
}

/**
 * Abrir pelos controles de cena: sem Ficha do Grupo de origem, escolhe o
 * grupo — direto se houver um só, perguntando se houver vários; sem grupos,
 * usa os personagens atribuídos aos jogadores.
 */
async function abrirPelosControles() {
  const grupos = getPartyFolderIds().map(id => game.folders.get(id)).filter(Boolean);
  if (grupos.length <= 1) return abrirCalculadoraEncontros({ folderId: grupos[0]?.id ?? null });
  const id = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize('THM.EncounterCalcTitle'), icon: 'fa-solid fa-scale-balanced' },
    content: `<div class="t20g-enc-dialogo"><div class="form-group">
      <label>${esc(game.i18n.localize('THM.EncounterCalcWhichParty'))}</label>
      <select name="grupo">${grupos.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select>
    </div></div>`,
    ok: { label: game.i18n.localize('THM.EncounterCalcOpen'), callback: (ev, btn) => btn.form.elements.grupo.value },
    rejectClose: false
  });
  if (id) abrirCalculadoraEncontros({ folderId: id });
}

/** Botão nos controles de token, ao lado do gerador de tesouros — só para o Mestre. */
Hooks.on('getSceneControlButtons', controls => {
  if (!game.user.isGM) return;
  const tokens = controls.tokens;
  if (!tokens?.tools) return;
  tokens.tools['t20g-encontros'] = {
    name: 't20g-encontros',
    // Logo depois do gerador de tesouros (registrado antes, em t20-hayd-tesouros.mjs).
    order: (tokens.tools['t20g-tesouros']?.order ?? (tokens.tools.ruler?.order ?? 0) + 1) + 0.5,
    title: 'THM.EncounterCalcTitle',
    icon: 'fa-solid fa-scale-balanced',
    button: true,
    // Só onChange: o v13 chama onChange E o onClick quando os dois existem.
    onChange: () => abrirPelosControles()
  };
});
