/**
 * Sugestão de automação a partir do nome do item.
 *
 * Quem abre o seletor quase sempre está no poder que quer automatizar, então
 * comparar o nome do item com o catálogo acerta na maioria dos casos e evita
 * caçar numa lista que só cresce.
 *
 * Funções puras: nada aqui toca em documentos do Foundry.
 */

/** Palavras curtas e conectivos não distinguem nada entre poderes. */
const IRRELEVANTES = new Set([
  'de', 'do', 'da', 'dos', 'das', 'e', 'o', 'a', 'os', 'as',
  'em', 'no', 'na', 'um', 'uma', 'com', 'combinacao'
]);

/** Minúsculas, sem acento e sem pontuação — "Combinação: Um-Dois" → "um dois". */
export function normalizarNome(nome) {
  return String(nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Palavras que realmente identificam o poder. */
function palavrasUteis(nome) {
  return normalizarNome(nome).split(' ').filter((p) => p && !IRRELEVANTES.has(p));
}

/**
 * Quão parecidos são dois nomes, de 0 a 1.
 *
 * O prefixo "Combinação:" do catálogo é descartado junto com os conectivos,
 * senão "Um-Dois" na ficha nunca casaria com "Combinação: Um-Dois".
 */
export function semelhanca(nomeItem, nomeAutomacao) {
  const a = palavrasUteis(nomeItem);
  const b = palavrasUteis(nomeAutomacao);
  if (!a.length || !b.length) return 0;

  const conjuntoA = new Set(a);
  const emComum = b.filter((p) => conjuntoA.has(p)).length;
  if (!emComum) return 0;

  // Proporção sobre o nome MAIS LONGO: "Chute" sozinho não deve casar
  // fortemente com "Chute Circular" nem com "Chute no Joelho".
  return emComum / Math.max(a.length, b.length);
}

/**
 * Automações cujo nome bate com o do item, da mais parecida para a menos.
 *
 * O limite de 0,6 exige que a maior parte do nome coincida: erra para menos
 * (não sugere) em vez de empurrar a automação errada para o topo da lista.
 */
export function sugerirAutomacoes(nomeItem, disponiveis, { minimo = 0.6 } = {}) {
  return (disponiveis ?? [])
    .map((a) => ({ automacao: a, pontos: semelhanca(nomeItem, a.nome) }))
    .filter((r) => r.pontos >= minimo)
    .sort((x, y) => y.pontos - x.pontos || x.automacao.nome.localeCompare(y.automacao.nome, 'pt-BR'))
    .map((r) => r.automacao);
}
