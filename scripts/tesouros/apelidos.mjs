/**
 * t20-hayd-tesouros | apelidos.mjs
 * Correções de nome para a busca de vínculo.
 *
 * A tabela do livro nomeia algumas entradas de um jeito e o compêndio do
 * sistema de outro — o item mágico costuma trazer o nome do deus na tabela
 * ("Medalhão de Lena") e o efeito no compêndio ("Medalhão da deusa da vida").
 * Sem isso, uma mesa que usa só o livro básico ficaria com essas entradas
 * eternamente sem vínculo.
 *
 * Aqui ficam SÓ os casos que a regra geral não resolve (ver `nomesDeBusca`):
 * o resto é tratado por padrão, para esta lista não virar um catálogo
 * paralelo que precisa ser mantido em sincronia com as tabelas.
 *
 * Valor `null` = nunca vincular. São entradas cujo item simplesmente não
 * existe no compêndio; deixar sem vínculo é melhor do que deixar o fuzzy
 * apontar para um item parecido e errado.
 */
import { normalizarTexto } from './utils.mjs';

const BRUTO = {
  /* Itens mágicos: a tabela usa o nome do deus, o compêndio usa o efeito. */
  'Martelo de Doherimm': 'Martelo dos Anões',
  'Punhal sszzaazita': 'Punhal traiçoeiro',
  'Escudo de Azgher': 'Escudo do Deus-Sol',
  'Brincos de Marah': 'Brincos da Paz',
  'Medalhão de Lena': 'Medalhão da deusa da vida',

  /* Poções cujo aprimoramento vira parte do nome no compêndio. */
  'Arma Mágica (óleo; aprimoramento para bônus +3)': 'Óleo de Arma Mágica (+3)',
  'Escudo da Fé (aprimoramento para duração cena)': 'Poção de Escudo da Fé (cena)',
  'Bola de Fogo (granada; aprimoramento para 10d6 de dano)': 'Granada de Bola de Fogo (10d6)',

  /* Sem item correspondente no compêndio — ficam sem vínculo de propósito. */
  'Pele de Pedra (aprimoramento para pele de aço e RD 10)': null,
  'Potência Divina (aprimoramento para Força +6 e RD 15)': null,
  'Proteção Divina (aprimoramento para bônus de +4)': null,
  'Orientação (aprimoramento para duração cena; role o atributo afetado, sendo 1 = Força, 2 = Destreza e assim por diante)': null,
  'Voo': null,
  'Premonição': null
};

/** Indexado pelo nome normalizado: acento e caixa não podem quebrar o apelido. */
const APELIDOS = new Map(Object.entries(BRUTO).map(([k, v]) => [normalizarTexto(k), v]));

/**
 * Apelido de uma entrada.
 * `undefined` = sem apelido (segue a regra geral).
 * `null`      = nunca vincular.
 * string      = nome a procurar no lugar do original.
 */
export function apelidoDe(nome) {
  return APELIDOS.get(normalizarTexto(nome));
}

/** True se a entrada está marcada para nunca vincular. */
export function nuncaVincula(nome) {
  return apelidoDe(nome) === null;
}
