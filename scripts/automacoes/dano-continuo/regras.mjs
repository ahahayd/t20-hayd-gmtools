/**
 * Dano contínuo — regras puras.
 *
 * Magias e poderes que, depois de lançados, continuam causando dano a cada
 * rodada: a Esfera Flamejante da Bola de Fogo, Flecha Ácida, Espírito
 * Balístico… O jogador lança o item normalmente; o cartão dele vira um
 * "dano contínuo" guardado na ficha, que aparece logo abaixo do item (como a
 * munição embaixo das armas) e é rolado com um clique.
 *
 * O dano repetido sai da PRIMEIRA rolagem: cada parcela dela (dado da magia,
 * aprimoramentos que somaram dados, Arcano de Batalha, campo Bônus…) vira uma
 * linha que o jogador marca ou desmarca. Bônus que valem só na primeira
 * rolagem (Arcano de Batalha soma o atributo uma vez, não a cada rodada)
 * entram desmarcados por padrão.
 *
 * Nada aqui toca em documentos do Foundry.
 */

/** Flag no ITEM com a configuração do Modelo de dano contínuo. */
export const FLAG_CONFIG = 'danoContinuoModelo';

/** Flag no ATOR com os danos contínuos ativos: { [id]: instancia }. */
export const FLAG_ATIVOS = 'danosContinuos';

/** Quando o lançamento cria o dano contínuo. */
export const GATILHOS = ['sempre', 'aprimoramento'];

/** De onde vem o dano repetido: a rolagem original ou uma fórmula própria. */
export const ORIGENS = ['original', 'formula'];

/** Tipos de dano do T20 (CONFIG.T20.damageTypes, sem "dano" e "perda"). */
export const TIPOS_DANO = [
  'acido', 'corte', 'eletricidade', 'essencia', 'fogo', 'frio',
  'impacto', 'luz', 'psiquico', 'perfuracao', 'trevas', 'perda'
];

/** Minúsculas e sem acento: o texto do gatilho casa com o do cartão. */
export function normalizarTexto(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const inteiro = (v, padrao = 0, minimo = 0) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.max(minimo, n) : padrao;
};

/** Configuração nova, do jeito que o editor abre pela primeira vez. */
export function configPadrao(nomeItem = '') {
  return {
    rotulo: nomeItem,
    gatilho: 'sempre',
    aprimoramento: '',
    origem: 'original',
    formula: '',
    tipo: '',
    bonusRepetem: false,
    usos: 0,
    umaVezPorRodada: false,
    fimCena: true,
    nota: ''
  };
}

/** Configuração gravada → formato garantido. Lixo vira o padrão, nunca erro. */
export function normalizarConfig(bruto, nomeItem = '') {
  const p = configPadrao(nomeItem);
  const c = bruto && typeof bruto === 'object' ? bruto : {};
  const gatilho = GATILHOS.includes(c.gatilho) ? c.gatilho : p.gatilho;
  const origem = ORIGENS.includes(c.origem) ? c.origem : p.origem;
  return {
    rotulo: String(c.rotulo ?? '').trim() || nomeItem,
    gatilho,
    aprimoramento: gatilho === 'aprimoramento' ? String(c.aprimoramento ?? '').trim() : '',
    origem,
    formula: origem === 'formula' ? String(c.formula ?? '').trim() : '',
    tipo: TIPOS_DANO.includes(c.tipo) ? c.tipo : '',
    bonusRepetem: !!c.bonusRepetem,
    usos: inteiro(c.usos, 0),
    umaVezPorRodada: !!c.umaVezPorRodada,
    fimCena: c.fimCena !== false,
    nota: String(c.nota ?? '').trim()
  };
}

/** Dá para salvar? Gatilho por aprimoramento pede o texto; fórmula própria pede a fórmula. */
export function configValida(config) {
  const c = normalizarConfig(config);
  if (c.gatilho === 'aprimoramento' && !c.aprimoramento) return false;
  if (c.origem === 'formula' && !c.formula) return false;
  return true;
}

/**
 * O lançamento cria o dano contínuo? `aprimoramentos` é o texto dos
 * aprimoramentos escolhidos, como o cartão do sistema os lista.
 */
export function disparou(config, aprimoramentos) {
  if (config.gatilho === 'sempre') return true;
  const alvo = normalizarTexto(config.aprimoramento);
  return !!alvo && normalizarTexto(aprimoramentos).includes(alvo);
}

/* ─── Parcelas da primeira rolagem ───────────────────────────────────────── */

/**
 * Fórmula de um termo simplificado da rolagem.
 * `termo`: { expressao, total, dado, tipo } — o tipo de dano vai em colchetes,
 * que é como o sistema o lê ao aplicar (resistências e imunidades).
 */
function formulaDoTermo(termo) {
  const marca = termo.tipo ? `[${termo.tipo}]` : '';
  if (termo.dado) return `${termo.expressao}${marca}`;
  return `${Math.abs(Number(termo.total) || 0)}${marca}`;
}

/** Junta pedaços com sinal: [+3d6, -2] → "3d6 - 2". */
export function juntarFormula(pedacos) {
  return (pedacos ?? []).reduce((acc, { sinal, formula }) => {
    if (!formula) return acc;
    if (!acc) return sinal < 0 ? `-${formula}` : formula;
    return `${acc} ${sinal < 0 ? '-' : '+'} ${formula}`;
  }, '');
}

/**
 * Tira os operadores e põe o sinal em cada termo.
 * `termos`: [{ operador } | { expressao, total, dado, tipo }].
 */
export function termosComSinal(termos) {
  const saida = [];
  let sinal = 1;
  for (const termo of termos ?? []) {
    if (termo?.operador) {
      if (termo.operador === '-') sinal = -sinal;
      continue;
    }
    saida.push({ ...termo, sinal });
    sinal = 1;
  }
  return saida;
}

function parcela(id, fonte, pedaco, doItem) {
  const formula = juntarFormula(pedaco.map((t) => ({ sinal: t.sinal, formula: formulaDoTermo(t) })));
  return { id, fonte, formula, original: formula, doItem, ativa: doItem };
}

/**
 * Parcelas da primeira rolagem de dano.
 *
 * Com as fontes da rolagem registradas (`faixas`, ver t20-hayd-fontes.mjs),
 * cada fonte vira uma parcela com o nome dela; `ehDoItem(fonte)` diz quais
 * são o dano do próprio item (essas se repetem). Sem fontes, o primeiro
 * grupo de dados e o fixo logo depois dele são o dano do item, e cada termo
 * que sobra vira um bônus — o mesmo critério da Seta Infalível.
 */
export function parcelasDaRolagem(termos, faixas, { ehDoItem = () => false, rotuloBonus = 'Bônus' } = {}) {
  const lista = termosComSinal(termos);
  if (!lista.length) return [];

  if (Array.isArray(faixas) && faixas.length) {
    const saida = [];
    faixas.forEach((f, i) => {
      const pedaco = lista.slice(f.ini, f.fim);
      if (!pedaco.length) return;
      // "+0" sem dado (bônus vazio) não é parcela
      if (!pedaco.some((t) => t.dado) && pedaco.every((t) => !Number(t.total))) return;
      saida.push(parcela(`p${i}`, String(f.fonte ?? rotuloBonus), pedaco, !!ehDoItem(f.fonte)));
    });
    if (saida.some((p) => p.doItem)) return saida;
    // Nenhuma fonte reconhecida como do item: a primeira é a dele
    if (saida.length) { saida[0].doItem = true; saida[0].ativa = true; }
    return saida;
  }

  const iDado = lista.findIndex((t) => t.dado);
  const ini = iDado === -1 ? 0 : iDado;
  let fim = ini + 1;
  if (iDado !== -1 && lista[fim] && !lista[fim].dado) fim += 1;
  const saida = [parcela('p0', '', lista.slice(ini, fim), true)];
  [...lista.slice(0, ini), ...lista.slice(fim)].forEach((t, i) => {
    if (!t.dado && !Number(t.total)) return;
    saida.push(parcela(`p${i + 1}`, rotuloBonus, [t], false));
  });
  return saida;
}

/**
 * Parcelas do dano contínuo a partir da configuração e da primeira rolagem.
 * Com fórmula própria, ela é a parcela do item; os bônus da rolagem ficam
 * listados, para o jogador marcar se quiser.
 */
export function montarParcelas(config, parcelasOriginais, rotuloItem) {
  const bonus = (parcelasOriginais ?? [])
    .filter((p) => (config.origem === 'formula' ? !p.doItem : true))
    .map((p) => ({ ...p, ativa: p.doItem || config.bonusRepetem }));

  const comTipo = (f) => (config.tipo && !/\[/.test(f) ? `${f}[${config.tipo}]` : f);
  if (config.origem === 'formula') {
    const formula = comTipo(config.formula);
    return [{ id: 'base', fonte: rotuloItem, formula, original: formula, doItem: true, ativa: true }, ...bonus];
  }
  // Rolagem original sem tipo nos dados: o tipo configurado entra neles
  return bonus.map((p) => (p.doItem && config.tipo
    ? { ...p, formula: comTipo(p.formula), original: comTipo(p.original) }
    : p));
}

/** Fórmula rolada: as parcelas marcadas, cada uma com o próprio sinal. */
export function formulaDasParcelas(parcelas) {
  const pedacos = (parcelas ?? [])
    .filter((p) => p.ativa && String(p.formula ?? '').trim())
    .map((p) => {
      const f = String(p.formula).trim();
      return f.startsWith('-') ? { sinal: -1, formula: f.slice(1).trim() } : { sinal: 1, formula: f };
    });
  return juntarFormula(pedacos);
}

/** Texto curto da linha na ficha: "3d6 + 4", sem os tipos de dano. */
export function resumoDasParcelas(parcelas) {
  return formulaDasParcelas(parcelas).replace(/\[[^\]]*\]/g, '') || '—';
}

/* ─── Instância ativa na ficha ───────────────────────────────────────────── */

/** O dano contínuo criado por um lançamento. */
export function novaInstancia({ id, item, config, parcelas, criado = 0, mensagem = null }) {
  return {
    id,
    itemId: item.id,
    itemNome: item.name,
    img: item.img ?? '',
    rotulo: config.rotulo || item.name,
    parcelas,
    usos: config.usos,
    feitos: 0,
    umaVezPorRodada: config.umaVezPorRodada,
    fimCena: config.fimCena,
    nota: config.nota,
    ultima: null,
    criado,
    mensagem
  };
}

/** Lista das instâncias guardadas no ator, as mais antigas primeiro. */
export function listarInstancias(flag) {
  const valores = flag && typeof flag === 'object' ? Object.values(flag) : [];
  return valores
    .filter((i) => i && typeof i === 'object' && i.id && i.itemId)
    .sort((a, b) => (Number(a.criado) || 0) - (Number(b.criado) || 0));
}

/** Quantas rolagens ainda restam (null = até cancelar). */
export function restantes(inst) {
  const usos = Number(inst?.usos) || 0;
  return usos > 0 ? Math.max(0, usos - (Number(inst.feitos) || 0)) : null;
}

/** Já rolou nesta rodada deste combate? `agora` = { combate, rodada } ou null. */
export function jaRolouNaRodada(inst, agora) {
  if (!inst?.ultima || !agora?.combate) return false;
  return inst.ultima.combate === agora.combate && inst.ultima.rodada === agora.rodada;
}

/**
 * Depois de rolar: conta o uso e lembra a rodada. Devolve null quando os
 * usos acabaram (a instância sai da ficha).
 */
export function depoisDeRolar(inst, agora) {
  const feitos = (Number(inst.feitos) || 0) + 1;
  const proxima = { ...inst, feitos, ultima: agora?.combate ? { combate: agora.combate, rodada: agora.rodada } : inst.ultima };
  return restantes(proxima) === 0 ? null : proxima;
}
