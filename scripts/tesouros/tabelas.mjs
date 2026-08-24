/**
 * t20-hayd-tesouros | tabelas.mjs
 * Registry central de tabelas genéricas (todas exceto a Tabela 8-1 de ND,
 * que tem semântica própria — ver dados-nd.mjs e motor.mjs). Mescla cada
 * tabela com o homebrew do Mestre e resolve entradas por rolagem de dado.
 */
import { ITENS_DIVERSOS } from './dados-itens-diversos.mjs';
import { ARMAS, ARMADURAS_ESCUDOS, ESOTERICOS, TABELA_POR_CATEGORIA_EQUIPAMENTO } from './dados-equipamentos.mjs';
import { POCOES } from './dados-pocoes.mjs';
import {
  MELHORIAS_ARMAS, MELHORIAS_ARMADURAS_ESCUDOS, MELHORIAS_ESOTERICOS,
  TABELA_SUPERIOR_POR_CATEGORIA
} from './dados-superiores.mjs';
import {
  ENCANTOS_ARMAS, ENCANTOS_ARMADURAS_ESCUDOS, ENCANTOS_ESOTERICOS,
  TABELA_MAGICO_POR_CATEGORIA, ARMA_ESPECIFICA, ARMADURA_ESCUDO_ESPECIFICO,
  ESOTERICO_ESPECIFICO, TABELAS_ESPECIFICAS
} from './dados-magicos.mjs';
import {
  ACESSORIOS_MENORES, ACESSORIOS_MEDIOS, ACESSORIOS_MAIORES, TABELA_ACESSORIO_POR_NIVEL
} from './dados-acessorios.mjs';
import { MATERIAIS_ESPECIAIS } from './dados-materiais.mjs';
import {
  FAIXAS_VALOR_RIQUEZA, EXEMPLOS_RIQUEZA, ESPACOS_RIQUEZA, faixaValorPor
} from './dados-riquezas.mjs';
import { obterHomebrewTabela } from './homebrew.mjs';

export { TABELA_POR_CATEGORIA_EQUIPAMENTO, TABELA_SUPERIOR_POR_CATEGORIA, TABELA_MAGICO_POR_CATEGORIA };
export { TABELAS_ESPECIFICAS, TABELA_ACESSORIO_POR_NIVEL };
export { FAIXAS_VALOR_RIQUEZA, ESPACOS_RIQUEZA, faixaValorPor };

/** Todas as tabelas genéricas (id → { dado, entradas }), homebrewáveis por linha/dado. */
export const TABELAS = {
  itensDiversos: ITENS_DIVERSOS,
  armas: ARMAS,
  armadurasEscudos: ARMADURAS_ESCUDOS,
  esotericos: ESOTERICOS,
  pocoes: POCOES,
  melhoriasArmas: MELHORIAS_ARMAS,
  melhoriasArmadurasEscudos: MELHORIAS_ARMADURAS_ESCUDOS,
  melhoriasEsotericos: MELHORIAS_ESOTERICOS,
  encantosArmas: ENCANTOS_ARMAS,
  encantosArmadurasEscudos: ENCANTOS_ARMADURAS_ESCUDOS,
  encantosEsotericos: ENCANTOS_ESOTERICOS,
  armaEspecifica: ARMA_ESPECIFICA,
  armaduraEscudoEspecifico: ARMADURA_ESCUDO_ESPECIFICO,
  esotericoEspecifico: ESOTERICO_ESPECIFICO,
  acessoriosMenores: ACESSORIOS_MENORES,
  acessoriosMedios: ACESSORIOS_MEDIOS,
  acessoriosMaiores: ACESSORIOS_MAIORES,
  materiaisEspeciais: MATERIAIS_ESPECIAIS
};

/** Ids das tabelas de "riqueza:<faixa>" — pseudo-tabelas geradas a partir dos exemplos (ver abaixo). */
export function idTabelaExemplosRiqueza(faixaId) {
  return `riqueza-${faixaId}`;
}

/** Lista de todos os ids homebrewáveis (tabelas genéricas + uma por faixa de riqueza). */
export function tabelasHomebrewaveis() {
  return [...Object.keys(TABELAS), ...FAIXAS_VALOR_RIQUEZA.map(f => idTabelaExemplosRiqueza(f.id))];
}

/** `{ dado, entradas }` de uma tabela genérica (só usa TABELAS, não as pseudo-tabelas de riqueza). */
function tabelaBase(tabelaId) {
  const base = TABELAS[tabelaId];
  if (!base) throw new Error(`t20-hayd-tesouros | Tabela desconhecida: ${tabelaId}`);
  return base;
}

/** Entradas oficiais + homebrew de uma tabela genérica, na ordem de faixa. */
export function entradasResolvidas(tabelaId) {
  const base = tabelaBase(tabelaId);
  const hb = obterHomebrewTabela(tabelaId);
  return [...base.entradas, ...hb.entradas].sort((a, b) => a.min - b.min);
}

/** Tamanho do dado a rolar para uma tabela genérica, já considerando extensão por homebrew. */
export function dadoResolvido(tabelaId) {
  const base = tabelaBase(tabelaId);
  const hb = obterHomebrewTabela(tabelaId);
  return Math.max(base.dado, hb.dadoMax ?? 0);
}

/** Entrada correspondente a uma rolagem já feita, numa tabela genérica. */
export function entradaPorRolagem(tabelaId, rolagem) {
  return entradasResolvidas(tabelaId).find(e => rolagem >= e.min && rolagem <= e.max) ?? null;
}

/**
 * Pseudo-tabela "riqueza-<faixa>": os exemplos de EXEMPLOS_RIQUEZA[faixaId]
 * viram uma tabela indexada (1..N) para reaproveitar o mesmo mecanismo de
 * homebrew/rolagem das tabelas genéricas.
 */
export function dadoResolvidoExemplosRiqueza(faixaId) {
  const oficiais = EXEMPLOS_RIQUEZA[faixaId] ?? [];
  const hb = obterHomebrewTabela(idTabelaExemplosRiqueza(faixaId));
  return Math.max(oficiais.length, hb.dadoMax ?? 0);
}

export function entradasResolvidasExemplosRiqueza(faixaId) {
  const oficiais = EXEMPLOS_RIQUEZA[faixaId] ?? [];
  const hb = obterHomebrewTabela(idTabelaExemplosRiqueza(faixaId));
  const base = oficiais.map((ex, i) => ({ min: i + 1, max: i + 1, tipo: 'riquezaExemplo', ...ex }));
  return [...base, ...hb.entradas].sort((a, b) => a.min - b.min);
}

export function exemploRiquezaPorRolagem(faixaId, rolagem) {
  return entradasResolvidasExemplosRiqueza(faixaId).find(e => rolagem >= e.min && rolagem <= e.max) ?? null;
}

/** Tamanho do dado OFICIAL (sem homebrew) de qualquer tabela homebrewável, genérica ou de riqueza. */
export function dadoOficialTabela(tabelaId) {
  if (tabelaId.startsWith('riqueza-')) {
    const faixaId = Number(tabelaId.slice('riqueza-'.length));
    return (EXEMPLOS_RIQUEZA[faixaId] ?? []).length;
  }
  return TABELAS[tabelaId]?.dado ?? 100;
}

/** Rótulo de exibição de uma tabela (chaves em lang/pt-BR.json, com fallback para o id). */
export function labelTabela(tabelaId) {
  const chave = `T20HaydGMTools.TesourosTabelaNome.${tabelaId}`;
  const traduzido = game.i18n.localize(chave);
  return traduzido === chave ? tabelaId : traduzido;
}
