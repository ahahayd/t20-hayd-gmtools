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
import { livroHabilitado } from './livros.mjs';

/** Avisa uma vez por tabela que o filtro de livros teve de ser ignorado. */
const tabelasAvisadas = new Set();
function avisarTabelaSemLivro(tabelaId) {
  if (tabelasAvisadas.has(tabelaId)) return;
  tabelasAvisadas.add(tabelaId);
  console.warn(
    `t20-hayd-tesouros | A tabela "${tabelaId}" ficaria vazia com os livros ativos — ` +
    'o filtro de livros foi ignorado nela para a geração não quebrar.'
  );
}

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

/**
 * Redistribui as faixas das entradas sobreviventes para cobrir o dado inteiro,
 * sem buracos.
 *
 * Quando uma entrada sai (livro desligado, ou o Mestre a removeu), a faixa
 * dela ficaria vazia e a rolagem teria de ser refeita — o que estraga o
 * momento de rolar o tesouro. Em vez disso, o espaço é redividido entre quem
 * ficou.
 *
 * A divisão é PROPORCIONAL ao peso original, não igual: as entradas do livro
 * têm larguras diferentes de propósito (Armadura Completa ocupa 10 números,
 * Sagna ocupa 1) e isso é o desenho de raridade da tabela. Dar a mesma fatia
 * para todas tornaria o item lendário tão comum quanto o mundano.
 *
 * O que sobra da divisão inteira vai para as PRIMEIRAS entradas, uma unidade
 * cada, até acabar.
 *
 * Sem nada removido o resultado é idêntico à tabela original: as cotas
 * proporcionais devolvem exatamente as larguras de partida.
 */
function redistribuirFaixas(entradas, dado) {
  if (!entradas.length) return { entradas: [], dado: 0 };

  const larguras = entradas.map(e => Math.max(1, (e.max - e.min + 1) || 1));
  const totalOriginal = larguras.reduce((s, w) => s + w, 0);
  // Nunca menos números do que entradas — cada uma precisa de ao menos um.
  const alvo = Math.max(dado, entradas.length);

  const cotas = larguras.map(w => Math.max(1, Math.floor((w * alvo) / totalOriginal)));
  let sobra = alvo - cotas.reduce((s, c) => s + c, 0);

  // Sobra: as primeiras entradas ganham a diferença.
  for (let i = 0; sobra > 0; i = (i + 1) % cotas.length) { cotas[i]++; sobra--; }
  // Falta (o piso de 1 pode ter estourado o alvo): tira das maiores, sem zerar.
  while (sobra < 0) {
    const maior = cotas.indexOf(Math.max(...cotas));
    if (cotas[maior] <= 1) break;
    cotas[maior]--;
    sobra++;
  }

  let cursor = 1;
  const redistribuidas = entradas.map((entrada, i) => {
    const min = cursor;
    cursor += cotas[i];
    return { ...entrada, min, max: cursor - 1 };
  });
  return { entradas: redistribuidas, dado: cursor - 1 };
}

/**
 * Tabela pronta para rolar: `{ entradas, dado }` já com livros, overrides e
 * homebrew aplicados e as faixas redistribuídas. Fonte única — `dadoResolvido`
 * e `entradaPorRolagem` derivam daqui para nunca discordarem entre si.
 */
export function tabelaEfetiva(tabelaId) {
  const base = tabelaBase(tabelaId);
  const hb = obterHomebrewTabela(tabelaId);
  const dadoBruto = Math.max(base.dado, hb.dadoMax ?? 0);
  return redistribuirFaixas(entradasSobreviventes(tabelaId), dadoBruto);
}

function entradasSobreviventes(tabelaId) {
  const base = tabelaBase(tabelaId);
  const hb = obterHomebrewTabela(tabelaId);
  const overrides = hb.overrides ?? {};

  const aplicar = (entrada) => {
    const ov = overrides[entrada.chave];
    if (ov?.removida) return null;
    return ov?.nome ? { ...entrada, nome: ov.nome, renomeada: true } : entrada;
  };

  // Livro desligado pela mesa sai do sorteio, igual a uma entrada removida.
  let oficiais = base.entradas.filter(livroHabilitado).map(aplicar).filter(Boolean);

  // Há tabela de livro único (ENCANTOS_ESOTERICOS é toda de Heróis de Arton):
  // desligar aquele livro a deixaria vazia, e uma rolagem que caísse ali não
  // teria o que devolver. Nesse caso o filtro de livro é ignorado SÓ nesta
  // tabela — melhor um resultado de um livro que a mesa não usa do que uma
  // geração que quebra no meio.
  if (!oficiais.length && !hb.entradas.length) {
    oficiais = base.entradas.map(aplicar).filter(Boolean);
    if (oficiais.length) avisarTabelaSemLivro(tabelaId);
  }

  return [...oficiais, ...hb.entradas].sort((a, b) => a.min - b.min);
}

/**
 * Entradas oficiais de uma tabela com o override de cada uma (para a UI).
 *
 * Cobre os dois formatos: as tabelas genéricas do registry e as pseudo-tabelas
 * "riqueza-<faixa>", cujas entradas são os EXEMPLOS da faixa indexados 1..N —
 * elas não existem em TABELAS, e chamar `tabelaBase` com elas lançava
 * "Tabela desconhecida".
 *
 * Os exemplos de riqueza não têm `chave` própria; o índice serve de
 * identificador estável do override, já que a lista é fixa no código.
 */
export function entradasOficiaisComOverride(tabelaId) {
  const overrides = obterHomebrewTabela(tabelaId).overrides ?? {};
  const ehRiqueza = tabelaId.startsWith('riqueza-');
  const faixaId = ehRiqueza ? Number(tabelaId.slice('riqueza-'.length)) : null;

  // Faixas EFETIVAS (já com livros desligados e a redistribuição aplicada),
  // para o editor mostrar como a tabela realmente vai rolar — e não as faixas
  // de partida, que deixariam de bater com o que sai na mesa.
  const efetivas = new Map(
    (ehRiqueza ? entradasResolvidasExemplosRiqueza(faixaId) : entradasResolvidas(tabelaId))
      .map(e => [e.chave ?? e.nome, e])
  );

  const comOverride = (entrada, chave) => {
    const efetiva = efetivas.get(entrada.chave ?? entrada.nome);
    const foraPorLivro = !livroHabilitado(entrada);
    return {
      ...entrada,
      chave,
      override: overrides[chave] ?? null,
      nomeExibido: overrides[chave]?.nome ?? entrada.nome,
      removida: !!overrides[chave]?.removida,
      foraPorLivro,
      // Faixa em jogo agora; `null` quando a entrada está fora do sorteio.
      faixaEfetiva: efetiva ? { min: efetiva.min, max: efetiva.max } : null
    };
  };

  if (ehRiqueza) {
    const oficiais = EXEMPLOS_RIQUEZA[faixaId] ?? [];
    return oficiais.map((ex, i) =>
      comOverride({ ...ex, min: i + 1, max: i + 1, tipo: 'riquezaExemplo' }, `exemplo-${i + 1}`)
    );
  }

  return tabelaBase(tabelaId).entradas.map((entrada) => comOverride(entrada, entrada.chave));
}

/** Entradas prontas para rolar, com as faixas já redistribuídas. */
export function entradasResolvidas(tabelaId) {
  return tabelaEfetiva(tabelaId).entradas;
}

/** Tamanho do dado a rolar, derivado da mesma redistribuição das faixas. */
export function dadoResolvido(tabelaId) {
  return tabelaEfetiva(tabelaId).dado;
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
  return entradasResolvidasExemplosRiqueza(faixaId).length;
}

export function entradasResolvidasExemplosRiqueza(faixaId) {
  const oficiais = EXEMPLOS_RIQUEZA[faixaId] ?? [];
  const hb = obterHomebrewTabela(idTabelaExemplosRiqueza(faixaId));
  const overrides = hb.overrides ?? {};

  // Mesmo tratamento das tabelas genéricas: renomeadas saem com o nome novo e
  // as removidas somem.
  const base = oficiais.reduce((acc, ex, i) => {
    const ov = overrides[`exemplo-${i + 1}`];
    if (ov?.removida) return acc;
    const entrada = { min: i + 1, max: i + 1, tipo: 'riquezaExemplo', ...ex };
    acc.push(ov?.nome ? { ...entrada, nome: ov.nome } : entrada);
    return acc;
  }, []);

  // Reindexa 1..N sem buracos: aqui as faixas são de um número cada, então
  // "redistribuir" é só renumerar em sequência.
  return [...base, ...hb.entradas]
    .sort((a, b) => a.min - b.min)
    .map((entrada, i) => ({ ...entrada, min: i + 1, max: i + 1 }));
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
