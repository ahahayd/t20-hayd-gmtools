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
import { MODULE_ID, SETTING_VINCULOS, LIVRO_BASE } from './constantes.mjs';
import { normalizarTexto, bigramas, similaridadeDeConjuntos } from './utils.mjs';
import { apelidoDe, nuncaVincula } from './apelidos.mjs';
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
  // `sistema` marca item vindo de compêndio do PRÓPRIO sistema — é o que
  // desempata quando um módulo de conteúdo repete um item do livro básico.
  const add = (nome, uuid, img, sistema = false) => {
    const key = normalizarTexto(nome);
    if (!key) return;
    if (!mapa.has(key)) mapa.set(key, { entradas: [], bigramas: bigramas(key) });
    mapa.get(key).entradas.push({ nome, uuid, img, sistema });
  };
  for (const item of game.items ?? []) add(item.name, item.uuid, item.img);
  for (const pack of game.packs.filter(p => p.documentName === 'Item')) {
    let index;
    try { index = await pack.getIndex({ fields: ['img'] }); }
    catch { continue; }
    const doSistema = pack.metadata?.packageType === 'system';
    for (const entry of index) {
      const uuid = entry.uuid ?? `Compendium.${pack.metadata.id}.Item.${entry._id}`;
      add(entry.name, uuid, entry.img, doSistema);
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

/**
 * Apaga TODOS os vínculos manuais e força a reconstrução do índice.
 *
 * É a saída para quando a busca automática ficou defasada — compêndio novo
 * instalado, itens renomeados, ou uma regra de busca que mudou (as poções
 * ganharam prefixo, por exemplo). Custa uma varredura completa dos
 * compêndios, então quem chama deve avisar que pode demorar.
 */
export async function resetarVinculos() {
  await game.settings.set(MODULE_ID, SETTING_VINCULOS, {});
  invalidarIndiceItens();
  await garantirIndice();
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
/**
 * Nomes a tentar no índice para uma entrada da tabela.
 *
 * A tabela de poções lista só o nome da MAGIA ("Curar Ferimentos"), mas os
 * itens do compêndio são "Poção de Curar Ferimentos" — por isso poção nunca
 * vinculava. O sufixo entre parênteses diz o recipiente: `(óleo)` vira
 * "Óleo de", `(granada)` vira "Granada de", e sem sufixo é "Poção de". Os
 * demais parênteses são anotação de regra ("(2d8+2 PV)") e saem fora.
 *
 * As outras variantes entram como alternativa porque o nome no compêndio pode
 * divergir do recipiente indicado na tabela.
 */
const PREFIXOS_POCAO = ['Poção de', 'Óleo de', 'Granada de'];

/** Parêntese que é só quantidade — "Balas (20)" vira "Balas". */
const PAREN_QUANTIDADE = /\s*\(\s*\d+\s*\)\s*/g;

/**
 * Parênteses a descartar numa poção: o marcador de recipiente (o prefixo já
 * carrega essa informação) e a descrição de aprimoramento. O que sobra é
 * mantido, porque costuma fazer parte do nome no compêndio — "Poção de Curar
 * Ferimentos (2d8+2 PV)" existe com o "(2d8+2 PV)" mesmo.
 */
function limparParentesesPocao(texto) {
  return texto.replace(/\s*\(([^)]*)\)/g, (todo, dentro) => {
    const conteudo = dentro.toLowerCase();
    const soRecipiente = /^\s*(óleo|oleo|granada)\s*$/.test(conteudo);
    const ehAprimoramento = /aprimoramento/.test(conteudo);
    const recipienteComAprimoramento = /^\s*(óleo|oleo|granada)\s*;/.test(conteudo);
    return (soRecipiente || ehAprimoramento || recipienteComAprimoramento) ? ' ' : todo;
  }).replace(/\s+/g, ' ').trim();
}

export function nomesDeBusca(tabelaId, nome) {
  // Apelido explícito manda em tudo (ver apelidos.mjs).
  const apelido = apelidoDe(nome);
  if (typeof apelido === 'string') return [apelido];

  const texto = String(nome ?? '');

  if (tabelaId !== 'pocoes') {
    // "(20)" é anotação de quantidade, não parte do nome do item.
    const semQuantidade = texto.replace(PAREN_QUANTIDADE, ' ').replace(/\s+/g, ' ').trim();
    return semQuantidade && semQuantidade !== texto ? [semQuantidade, texto] : [texto];
  }

  const limpo = limparParentesesPocao(texto);
  if (!limpo) return [texto];

  const marcadores = (texto.match(/\(([^)]*)\)/g) ?? []).join(' ').toLowerCase();
  const preferido = /[óo]leo/.test(marcadores) ? 'Óleo de'
    : /granada/.test(marcadores) ? 'Granada de'
      : 'Poção de';

  // Sem os parênteses restantes como último recurso: se o compêndio nomeia o
  // item sem a anotação, ainda assim acha.
  const semParenteses = limpo.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();

  return [...new Set([
    `${preferido} ${limpo}`,
    ...PREFIXOS_POCAO.filter(p => p !== preferido).map(p => `${p} ${limpo}`),
    `${preferido} ${semParenteses}`,
    limpo
  ])];
}

/**
 * Desempata candidatos preferindo os compêndios do PRÓPRIO SISTEMA.
 *
 * Módulos de conteúdo (os que trazem Heróis/Deuses/Ameaças de Arton) às vezes
 * repetem itens do livro básico. Sem isto, "Espada Longa" existe duas vezes e
 * o vínculo fica ambíguo para sempre, obrigando o Mestre a escolher à mão algo
 * que tem resposta óbvia: o item do sistema.
 *
 * Só vale para entradas do livro BÁSICO — o item de um livro extra mora no
 * módulo, e preferir o sistema ali escolheria o item errado.
 */
function preferirSistema(candidatos) {
  const doSistema = candidatos.filter(c => c.sistema);
  return doSistema.length ? doSistema : candidatos;
}

/**
 * Aplica o desempate e recalcula o status.
 *
 * Só promove a "vinculado" o que era casamento EXATO (sem `score`) ou fuzzy
 * forte: sobrar um único candidato fraco depois do filtro não é motivo para
 * tratá-lo como certo.
 */
function desempatarPorSistema(resultado, ehLivroBase) {
  if (!ehLivroBase || resultado.status === 'sem-vinculo') return resultado;

  const candidatos = preferirSistema(resultado.candidatos);
  if (candidatos.length !== 1 || candidatos.length === resultado.candidatos.length) {
    return { ...resultado, candidatos };
  }

  const unico = candidatos[0];
  const confiavel = unico.score === undefined || unico.score >= LIMIAR_FORTE;
  return { status: confiavel ? 'vinculado' : resultado.status, candidatos };
}

export async function resolverReferencia(tabelaId, chave, nome, { riqueza = false, livro = null } = {}) {
  const ehLivroBase = livro === LIVRO_BASE;
  const semVinculo = () => ({ status: 'sem-vinculo', uuid: null, nome, img: iconeFallback(nome, riqueza), item: null, candidatos: [] });

  // Melhorias/encantos/materiais/riquezas não são itens do sistema — nem tenta buscar.
  if (!tabelaAceitaVinculo(tabelaId)) return semVinculo();
  // Entrada sem item correspondente no compêndio: melhor sem vínculo do que
  // deixar o fuzzy apontar para algo parecido e errado.
  if (nuncaVincula(nome)) return semVinculo();

  const override = obterOverride(tabelaId, chave);
  if (override === 'nenhum') return semVinculo();
  if (override) {
    const doc = await fromUuid(override).catch(() => null);
    if (doc) return { status: 'vinculado', uuid: override, nome: doc.name, img: doc.img, item: doc, candidatos: [] };
  }

  const idx = await garantirIndice();
  const r = candidatosResolvidos(idx, tabelaId, nome, livro);

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

/**
 * Busca com TODAS as regras aplicadas: variantes de nome (prefixo das poções)
 * e desempate por compêndio do sistema.
 *
 * Fonte única para a rolagem e para o menu de Vínculos — antes o menu chamava
 * `candidatosParaSync` cru, então mostrava "ambíguo" ou "sem vínculo" em
 * entradas que a geração resolvia sozinha.
 */
function candidatosResolvidos(idx, tabelaId, nome, livro) {
  // Mesmo curto-circuito da geração: sem isso o menu sugeriria um palpite
  // fuzzy para entradas que a rolagem deixa sem vínculo de propósito.
  if (nuncaVincula(nome)) return { status: 'sem-vinculo', candidatos: [] };

  const ehLivroBase = livro === LIVRO_BASE;

  // Tenta cada variante na ordem; um acerto encerra. Os "ambíguos" viram
  // sugestão caso nenhuma variante case sozinha.
  let ambiguo = null;
  for (const variante of nomesDeBusca(tabelaId, nome)) {
    const r = desempatarPorSistema(candidatosParaSync(idx, variante), ehLivroBase);
    if (r.status === 'vinculado') return r;
    if (r.status === 'ambiguo' && !ambiguo) ambiguo = r;
  }
  return ambiguo ?? { status: 'sem-vinculo', candidatos: [] };
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
  // Mesmas regras da geração, para o menu não contradizer o que a rolagem faz.
  const r = candidatosResolvidos(idx, tabelaId, e.nome, e.livro ?? null);
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
