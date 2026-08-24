/**
 * t20-hayd-tesouros | vinculo.mjs
 * Resolve cada entrada de catálogo (nome vindo do PDF) para um Item real do
 * mundo/compêndio, com overrides manuais do Mestre. Também é a fonte do
 * ícone de fallback para "Riqueza" (texto livre, sem item de compêndio).
 *
 * Otimização: o índice de itens (centenas/milhares de entradas de
 * compêndio) é construído uma vez e cacheado; o resultado do fuzzy-match
 * por nome também é cacheado (por nome normalizado), já que ele SÓ muda se
 * o índice mudar — nunca por causa de overrides ou de re-render da UI. Sem
 * isso, abrir o menu de Vínculos rolava a comparação de ~850 entradas do
 * catálogo contra TODO o índice a cada clique (filtro, arrastar item...).
 */
import { MODULE_ID, SETTING_VINCULOS } from './constantes.mjs';
import { normalizarTexto, bigramas, similaridadeDeConjuntos } from './utils.mjs';
import { iconeTesouroAleatorio, ICONE_TESOURO_PADRAO } from './dados-icones.mjs';
import { TABELAS, entradasResolvidas } from './tabelas.mjs';

const LIMIAR_FORTE = 0.82;
const LIMIAR_FRACO = 0.55;

/**
 * Tabelas cujas entradas NUNCA correspondem a um Item real do sistema:
 * melhorias/encantos/materiais são conceitos do livro (aplicados via
 * t20-hayd-itens ou só em texto — ver integracao-itens.mjs), e os exemplos
 * de "Riqueza" são flavor text livre (bugigangas, joias, obras de arte...)
 * que o próprio módulo materializa como item `tesouro` com ícone sorteado
 * (ver dados-icones.mjs) — nunca existiram como item de compêndio. Só as
 * armas/armaduras/esotéricos "específicos" (itens mágicos nomeados) e as
 * demais tabelas de equipamento/poção/acessório têm item de verdade pra
 * vincular. Por isso essas tabelas nem entram na busca por vínculo nem
 * aparecem no menu de Vínculos — procurar um "item" para "Certeira" ou para
 * "Ágata trincada" nunca ia achar nada e só desperdiçava a varredura fuzzy.
 */
const TABELAS_SEM_VINCULO = new Set([
  'melhoriasArmas', 'melhoriasArmadurasEscudos', 'melhoriasEsotericos',
  'encantosArmas', 'encantosArmadurasEscudos', 'encantosEsotericos',
  'materiaisEspeciais'
]);

/** True se a tabela pode, em tese, ter um item de compêndio vinculado. */
export function tabelaAceitaVinculo(tabelaId) {
  return !TABELAS_SEM_VINCULO.has(tabelaId) && !tabelaId.startsWith('riqueza-');
}

export function registrarVinculoSettings() {
  game.settings.register(MODULE_ID, SETTING_VINCULOS, {
    scope: 'world', config: false, type: Object, default: {}
  });
}

/* ─── Índice de itens do mundo/compêndios ──────────────────────────────── */

let indicePromise = null; // Map normalizado -> { entradas: [...], bigramas: Set }
let candidatosCache = new Map(); // normalizado(nome) -> { status, candidatos } — só válido enquanto o índice valer

/** Derruba o índice e o cache de fuzzy-match (chame quando itens/compêndios mudarem de verdade). */
export function invalidarIndiceItens() {
  indicePromise = null;
  candidatosCache.clear();
}

async function construirIndice() {
  const mapa = new Map();
  const add = (nome, uuid, img) => {
    const key = normalizarTexto(nome);
    if (!key) return;
    if (!mapa.has(key)) mapa.set(key, { entradas: [], bigramas: bigramas(key) });
    mapa.get(key).entradas.push({ nome, uuid, img });
  };
  for (const item of game.items ?? []) add(item.name, item.uuid, item.img);
  for (const pack of game.packs.filter(p => p.documentName === 'Item')) {
    let index;
    try { index = await pack.getIndex({ fields: ['img'] }); }
    catch { continue; }
    for (const entry of index) {
      const uuid = entry.uuid ?? `Compendium.${pack.metadata.id}.Item.${entry._id}`;
      add(entry.name, uuid, entry.img);
    }
  }
  return mapa;
}

/** Garante que o índice está pronto (constrói uma única vez) e o devolve. */
function garantirIndice() {
  if (!indicePromise) indicePromise = construirIndice();
  return indicePromise;
}

/**
 * Candidatos de um nome no índice: exatos primeiro, depois fuzzy por
 * bigramas. SÍNCRONA — só pode ser chamada depois de `await garantirIndice()`.
 * Memoizada por nome normalizado: cada nome só passa pelo scan fuzzy (o
 * caro, O(tamanho do índice)) uma vez até o índice ser invalidado.
 */
function candidatosParaSync(idx, nome) {
  const key = normalizarTexto(nome);
  const cache = candidatosCache.get(key);
  if (cache) return cache;

  const exatos = idx.get(key)?.entradas ?? [];
  let resultado;
  if (exatos.length) {
    resultado = { status: exatos.length === 1 ? 'vinculado' : 'ambiguo', candidatos: exatos };
  } else {
    const alvo = bigramas(key);
    const alvoLen = key.length;
    const pontuados = [];
    for (const [k, grupo] of idx) {
      // Pré-filtro barato: nomes com tamanho muito diferente não vão bater o suficiente —
      // evita calcular a interseção completa de bigramas para a maioria do índice.
      if (Math.abs(k.length - alvoLen) > alvoLen * 0.6 + 3) continue;
      const score = similaridadeDeConjuntos(alvo, grupo.bigramas);
      if (score >= LIMIAR_FRACO) for (const e of grupo.entradas) pontuados.push({ ...e, score });
    }
    pontuados.sort((a, b) => b.score - a.score);
    if (!pontuados.length) resultado = { status: 'sem-vinculo', candidatos: [] };
    else {
      const fortes = pontuados.filter(c => c.score >= LIMIAR_FORTE);
      resultado = fortes.length === 1
        ? { status: 'vinculado', candidatos: fortes }
        : { status: 'ambiguo', candidatos: pontuados.slice(0, 6) };
    }
  }
  candidatosCache.set(key, resultado);
  return resultado;
}

/* ─── Overrides do Mestre ──────────────────────────────────────────────── */

const chaveOverride = (tabelaId, chave) => `${tabelaId}:${chave}`;

function overridesBrutos() {
  return game.settings.get(MODULE_ID, SETTING_VINCULOS) ?? {};
}

/** `null` (sem override) | `"nenhum"` (forçado sem vínculo) | uuid. */
export function obterOverride(tabelaId, chave) {
  return overridesBrutos()[chaveOverride(tabelaId, chave)] ?? null;
}

export async function definirOverride(tabelaId, chave, uuidOuNenhum) {
  const overrides = foundry.utils.deepClone(overridesBrutos());
  overrides[chaveOverride(tabelaId, chave)] = uuidOuNenhum;
  await game.settings.set(MODULE_ID, SETTING_VINCULOS, overrides);
}

export async function limparOverride(tabelaId, chave) {
  const overrides = foundry.utils.deepClone(overridesBrutos());
  delete overrides[chaveOverride(tabelaId, chave)];
  await game.settings.set(MODULE_ID, SETTING_VINCULOS, overrides);
}

/* ─── Ícone de fallback (riquezas — texto livre) ───────────────────────── */

/** Riqueza: ícone nativo do Foundry sorteado a cada chamada (uma riqueza nova, um sorteio novo). */
function iconeFallback(nome, riqueza) {
  return riqueza ? iconeTesouroAleatorio() : ICONE_TESOURO_PADRAO;
}

/* ─── Resolução usada durante a rolagem (motor.mjs) ────────────────────── */

/**
 * Resolve uma entrada de catálogo para exibição/criação de item.
 * Retorna `{ status, uuid, nome, img, item, candidatos }` — `item` é o
 * Document resolvido (ou null se sem vínculo/override "nenhum"/documento
 * apagado); `candidatos` só vem preenchido quando `status === 'ambiguo'`
 * (lista de itens entre os quais o Mestre pode escolher direto no botão
 * "vincular" da UI, sem precisar arrastar nada).
 */
export async function resolverReferencia(tabelaId, chave, nome, { riqueza = false } = {}) {
  const semVinculo = () => ({ status: 'sem-vinculo', uuid: null, nome, img: iconeFallback(nome, riqueza), item: null, candidatos: [] });

  // Melhorias/encantos/materiais/riquezas não são itens do sistema — nem tenta buscar.
  if (!tabelaAceitaVinculo(tabelaId)) return semVinculo();

  const override = obterOverride(tabelaId, chave);
  if (override === 'nenhum') return semVinculo();
  if (override) {
    const doc = await fromUuid(override).catch(() => null);
    if (doc) return { status: 'vinculado', uuid: override, nome: doc.name, img: doc.img, item: doc, candidatos: [] };
  }

  const idx = await garantirIndice();
  const r = candidatosParaSync(idx, nome);
  if (r.status === 'vinculado') {
    const c = r.candidatos[0];
    const doc = await fromUuid(c.uuid).catch(() => null);
    if (doc) return { status: 'vinculado', uuid: c.uuid, nome: doc.name, img: doc.img, item: doc, candidatos: [] };
  }
  if (r.status === 'ambiguo') {
    return { status: 'ambiguo', uuid: null, nome, img: iconeFallback(nome, riqueza), item: null, candidatos: r.candidatos };
  }
  return semVinculo();
}

/* ─── Auditoria (app-vinculos.mjs) ─────────────────────────────────────── */

function linhaAuditoria(idx, tabelaId, e) {
  const override = obterOverride(tabelaId, e.chave);
  if (override === 'nenhum') {
    return { tabelaId, chave: e.chave, nome: e.nome, livro: e.livro ?? null, pagina: e.pagina ?? null, status: 'sem-vinculo-forcado', candidatos: [], override };
  }
  if (override) {
    return { tabelaId, chave: e.chave, nome: e.nome, livro: e.livro ?? null, pagina: e.pagina ?? null, status: 'vinculado-manual', candidatos: [], override };
  }
  const r = candidatosParaSync(idx, e.nome);
  return { tabelaId, chave: e.chave, nome: e.nome, livro: e.livro ?? null, pagina: e.pagina ?? null, status: r.status, candidatos: r.candidatos, override };
}

/** Lista { tabelaId, chave, nome, livro, pagina, status, candidatos, override } de uma tabela genérica. */
export async function auditarTabela(tabelaId) {
  if (!tabelaAceitaVinculo(tabelaId)) return [];
  const idx = await garantirIndice();
  const entradas = entradasResolvidas(tabelaId).filter(e => e.tipo === 'catalogo');
  return entradas.map(e => linhaAuditoria(idx, tabelaId, e));
}

/**
 * Auditoria completa: todas as tabelas genéricas que aceitam vínculo,
 * agrupadas por tabela. Riquezas nunca entram aqui — ver `tabelaAceitaVinculo`.
 */
export async function auditarTudo() {
  await garantirIndice(); // uma vez só — auditarTabela reusa o mesmo índice pronto
  const resultado = {};
  for (const tabelaId of Object.keys(TABELAS)) resultado[tabelaId] = await auditarTabela(tabelaId);
  return resultado;
}

/* ─── Invalidação automática ────────────────────────────────────────────
 * Só itens de MUNDO (sem parent — `game.items`) entram no índice; itens
 * embarcados em atores mudam o tempo todo durante a sessão (equipar,
 * gastar munição...) e não afetam o índice, então não precisam invalidar
 * nada. Compêndios raramente mudam em runtime; o Mestre pode forçar uma
 * atualização reabrindo o menu de Vínculos depois de editar um compêndio
 * (não há hook confiável de "conteúdo do compêndio mudou" no core). ────── */
function aoMudarItemDeMundo(item) {
  if (!item.parent) invalidarIndiceItens();
}
Hooks.on('createItem', aoMudarItemDeMundo);
Hooks.on('updateItem', aoMudarItemDeMundo);
Hooks.on('deleteItem', (item) => { if (!item.parent) invalidarIndiceItens(); });
