/**
 * Peças de interface compartilhadas pelas automações.
 *
 * Fora do motor porque as auras também montam botões e não podem importar
 * `motor.mjs` — a direção de import é sempre motor → domínio.
 */

/**
 * Botão de barra de automação no cartão do chat.
 *
 * `dataset` extra permite que cada domínio marque o botão do seu jeito
 * (`acaoComb`, `acaoEstudo`, `acaoAura`) sem multiplicar variações desta
 * função.
 */
export function criarBotao(item, acao, icone, dica, { largo = false, dataset = {} } = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = largo ? 't20g-auto-btn t20g-auto-btn-largo' : 't20g-auto-btn';
  b.dataset.acao = acao;
  if (item?.id) b.dataset.itemId = item.id;
  b.dataset.tooltip = dica;
  for (const [chave, valor] of Object.entries(dataset)) {
    if (valor !== undefined && valor !== null) b.dataset[chave] = String(valor);
  }
  const i = document.createElement('i');
  // Aceita tanto "fa-minus" quanto uma classe completa ("fa-solid fa-heart-pulse")
  i.className = /\bfa-(solid|regular|light|thin|duotone|brands)\b/.test(icone)
    ? icone
    : `fa-solid ${icone}`;
  b.appendChild(i);
  return b;
}
