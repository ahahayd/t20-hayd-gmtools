/**
 * Assistente de Criação — de onde vêm as opções.
 *
 * O Mestre liga e desliga compêndios (e os itens do mundo) numa tela própria,
 * como a Loja faz. Sem configuração, valem os compêndios do sistema e os
 * itens do mundo: o que vem de módulo entra quando o Mestre liga, para que um
 * suplemento cheio de raças de monstro não apareça sem ele querer.
 *
 * O catálogo é montado dos ÍNDICES dos compêndios (nunca dos documentos
 * inteiros) e fica em memória até a configuração mudar.
 */

export const MODULE_ID = 't20-hayd-gmtools';
export const CHAVE_FONTES = 'criacaoFontes';

/** Tipos de item que o assistente usa, por etapa. */
export const TIPOS_EQUIPAMENTO = ['arma', 'equipamento', 'consumivel', 'tesouro'];
const TIPOS_USADOS = new Set(['race', 'classe', 'poder', 'magia', ...TIPOS_EQUIPAMENTO]);

const CAMPOS_INDICE = [
  'img', 'system.tipo', 'system.subtipo', 'system.atributos', 'system.atributosDinamicos',
  'system.circulo', 'system.escola', 'system.pvPorNivel', 'system.pmPorNivel', 'system.pericias',
  'system.preco', 'system.espacos', 'system.proficiencia', 'system.propriedades'
];

export function registrarConfiguracaoFontes() {
  game.settings.register(MODULE_ID, CHAVE_FONTES, {
    name: 'Fontes do Assistente de Criação',
    scope: 'world', config: false, type: Object,
    default: { packs: {}, mundo: true },
    onChange: () => invalidarCatalogo()
  });
}

function lerConfig() {
  let cfg;
  try { cfg = game.settings.get(MODULE_ID, CHAVE_FONTES); } catch { cfg = null; }
  return { packs: { ...(cfg?.packs ?? {}) }, mundo: cfg?.mundo !== false };
}

/** Compêndio de origem do sistema? (o padrão é ligado só para estes) */
export function ehDoSistema(pack) {
  return pack.metadata.packageType === 'system' || pack.metadata.packageName === game.system.id;
}

/** Compêndios do sistema que não são opções de personagem: ficam
 *  desligados por padrão para não encher a lista "Todos" de poderes. */
const FORA_DO_PADRAO = new Set(['tormenta20.habilidades-de-criaturas', 'tormenta20.parceiros']);

export function packLigadoPorPadrao(pack) {
  return ehDoSistema(pack) && !FORA_DO_PADRAO.has(pack.collection);
}

export function packLigado(pack, cfg = lerConfig()) {
  const salvo = cfg.packs[pack.collection];
  return typeof salvo === 'boolean' ? salvo : packLigadoPorPadrao(pack);
}

export function mundoLigado(cfg = lerConfig()) {
  return cfg.mundo;
}

export async function salvarFontes(packs, mundo) {
  await game.settings.set(MODULE_ID, CHAVE_FONTES, { packs, mundo });
}

/** Todos os compêndios de Item que este usuário consegue ler. */
export function packsDeItem() {
  return game.packs.filter(p => p.documentName === 'Item' && p.visible);
}

/* ─── Catálogo ────────────────────────────────────────────────────────── */

let catalogo = null;

export function invalidarCatalogo() {
  catalogo = null;
}

function entrada(doc, fonte) {
  const s = doc.system ?? {};
  return {
    uuid: doc.uuid,
    nome: doc.name,
    img: doc.img || 'icons/svg/item-bag.svg',
    type: doc.type,
    tipo: s.tipo ?? '',
    subtipo: s.subtipo ?? '',
    fonte,
    sistema: s
  };
}

/**
 * Lê as fontes ligadas e devolve as listas por tipo. Itens com o mesmo nome
 * em fontes diferentes (um "Bálsamo restaurador" do mundo e o do sistema, por
 * exemplo) aparecem todos — podem ser versões diferentes, e a linha de apoio
 * da lista diz de onde cada um vem. Só o MESMO item (mesmo uuid) não repete.
 */
export function carregarCatalogo() {
  if (!catalogo) catalogo = montarCatalogo().catch(err => { catalogo = null; throw err; });
  return catalogo;
}

async function montarCatalogo() {
  const cfg = lerConfig();
  const listas = { racas: [], classes: [], poderes: [], magias: [], itens: [] };
  const vistos = new Set();
  const guardar = (e) => {
    if (vistos.has(e.uuid)) return;
    vistos.add(e.uuid);
    if (e.type === 'race') listas.racas.push(e);
    else if (e.type === 'classe') listas.classes.push(e);
    else if (e.type === 'poder') listas.poderes.push(e);
    else if (e.type === 'magia') listas.magias.push(e);
    else listas.itens.push(e);
  };

  if (cfg.mundo) {
    for (const item of game.items) {
      if (item.visible && TIPOS_USADOS.has(item.type)) guardar(entrada(item, 'Mundo'));
    }
  }

  const packs = packsDeItem().filter(p => packLigado(p, cfg));
  const indices = await Promise.all(packs.map(async p => {
    try { return [p, await p.getIndex({ fields: CAMPOS_INDICE })]; }
    catch (err) {
      console.warn(`${MODULE_ID} | Assistente: falha ao ler o compêndio ${p.collection}`, err);
      return [p, []];
    }
  }));
  for (const [p, indice] of indices) {
    for (const e of indice) {
      if (!TIPOS_USADOS.has(e.type)) continue;
      guardar(entrada({ ...e, uuid: e.uuid ?? p.getUuid(e._id) }, ehDoSistema(p) ? '' : p.metadata.label));
    }
  }

  const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
  for (const l of Object.values(listas)) l.sort(porNome);
  return listas;
}

/** Quantos itens de cada tipo um compêndio tem (para a tela de fontes). */
export async function contarPorTipo(pack) {
  const indice = await pack.getIndex();
  const c = { race: 0, classe: 0, poder: 0, magia: 0, equip: 0 };
  for (const e of indice) {
    if (e.type in c) c[e.type]++;
    else if (TIPOS_EQUIPAMENTO.includes(e.type)) c.equip++;
  }
  return c;
}
