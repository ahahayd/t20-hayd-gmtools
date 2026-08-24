/**
 * t20-hayd-tesouros | dados-icones.mjs
 * Ícones usados para "Riqueza" (texto livre do PDF — nunca é um item real de
 * compêndio, então não há vínculo possível para ela; ver `vinculo.mjs`,
 * `tabelaAceitaVinculo`). Em vez de tentar casar por palavra-chave, cada
 * riqueza gerada recebe um ícone NATIVO do Foundry sorteado entre os
 * conjuntos de "commodities" que o próprio core já traz — funciona em
 * qualquer instalação, sem depender de ícones do sistema Tormenta20.
 * Caminhos verificados em `resources/app/public/icons/commodities/` da
 * instalação do Foundry (treasure/, gems/, currency/).
 *
 * O Mestre pode sempre trocar o ícone gerado editando o item normalmente.
 */

const BASE = 'icons/commodities';

/** icons/commodities/treasure — bugigangas, estatuetas, broches, taças... (fonte principal). */
const TESOURO = [
  'box-jade-tassel', 'brass-lamp-yellow', 'brooch-crown-gold', 'brooch-eye-silver-teal',
  'brooch-gold-eye-green', 'brooch-gold-green', 'brooch-gold-ruby', 'brooch-jewel-gold-blue',
  'brooch-jeweled-green', 'brooch-jeweled-pink', 'brooch-lightning-gold', 'brooch-pink-orbs',
  'brooch-shield-grey', 'brooch-skull-dagger-grey', 'brooch-spiral-blue', 'bust-carved-stone',
  'bust-pharaoh-gold-blue', 'case-red-silver', 'crown-blue-gold', 'crown-gold-laurel-wreath',
  'crown-gold-satin-gems-red', 'crystal-ball-blue-purple', 'crystal-pedastal-red-gold',
  'cup-trophy-gold', 'doll-mummy', 'doll-voodoo', 'dreamcatcher-blue', 'dreamcatcher-brown',
  'dreamcatcher-purple', 'egg-ornate-green-gold', 'figurine-bear', 'figurine-boar',
  'figurine-camel', 'figurine-dog', 'figurine-elk', 'figurine-goddess', 'figurine-idol',
  'figurine-owl', 'figurine-rabbit', 'figurine-rhino', 'figurine-snail', 'gem-framed-spiral-purple',
  'glass-crystal-green', 'glass-cube-teal', 'goblet-coins-gold', 'goblet-worn-gold',
  'horn-carved-banded', 'horn-spiral-pink', 'lantern-stone-grey', 'lense-pipe-bronze',
  'mask-bone-white', 'mask-jeweled-gold', 'mask-wood-tan', 'medal-ribbon-blue',
  'medal-ribbon-gold-blue', 'medal-ribbon-gold-orange', 'medal-ribbon-gold-red',
  'medal-ribbon-silver-blue', 'medal-ribbon-silver-purple', 'medal-ribbon-star-gold-red',
  'medal-ribbon-striped-gold-red', 'pearl-shell', 'plaque-skull-blue-green',
  'plaque-stone-hammer', 'plaque-wood-leaves', 'plaque-wood-tree', 'puzzle-box-glowing-blue',
  'puzzle-cube', 'puzzle-pyramid', 'puzzle-triangle-gold', 'sceptre-jeweled-gold',
  'statue-bust-stone-grey', 'statue-carved-figurehead', 'statue-gold-laurel-wreath',
  'statue-runed-blue-grey', 'statuette-gargoyle-green-gold', 'stone-cracked-lightning-blue',
  'tablet-stone-grey-pink', 'talisman-embossed-rune-red', 'token-brass-round',
  'token-carved-stone-brown', 'token-cross-gem-yellow', 'token-engraved-alpha-grey',
  'token-engraved-blue-glowing', 'token-engraved-blue', 'token-engraved-eye-red',
  'token-engraved-fire-grey', 'token-engraved-green-glowing', 'token-engraved-pickaxe-pink',
  'token-engraved-purple-glowing', 'token-engraved-question-green', 'token-engraved-red-glowing',
  'token-engraved-spiral-grey-white', 'token-engraved-spiral-grey', 'token-engraved-symbols-grey',
  'token-engraved-yellow-glowing', 'token-etched-h-brown', 'token-gold-cross',
  'token-gold-gem-purple', 'token-gold-gem-red', 'token-runed-circle-green',
  'token-runed-circles-blue', 'token-runed-circles-grey', 'token-runed-circles-purple',
  'token-runed-fehu-gold', 'token-runed-ing-brown', 'token-runed-mem-red', 'token-runed-nyd-green',
  'token-runed-nyd-yellow', 'token-runed-os-grey', 'token-runed-radr-brown',
  'token-runed-sigel-brown', 'token-runed-spiral-grey', 'token-runed-wyn-grey',
  'token-silver-blue', 'token-silver-gem-cut', 'token-white-skull', 'token-white-spider',
  'token-worn-yang-brown', 'totem-wood-face-brown', 'totem-wooden-glowing-green',
  'totem-wooden-glowing-yellow', 'trinket-plane-gold', 'trinket-totem-bone-green',
  'trinket-wing-white', 'wood-tiki'
].map(f => `${BASE}/treasure/${f}.webp`);

/** icons/commodities/gems — gemas variadas (complementa treasure/ com pedras preciosas). */
const GEMAS = [
  'gem-amber-insect-orange', 'gem-cluster-blue-white', 'gem-cluster-pink', 'gem-cluster-purple',
  'gem-cluster-red', 'gem-cluster-teal', 'gem-cut-faceted-princess-purple', 'gem-cut-square-green',
  'gem-faceted-asscher-blue', 'gem-faceted-cushion-teal', 'gem-faceted-diamond-blue',
  'gem-faceted-diamond-green', 'gem-faceted-diamond-pink', 'gem-faceted-hexagon-blue',
  'gem-faceted-large-green', 'gem-faceted-navette-red', 'gem-faceted-octagon-yellow',
  'gem-faceted-oval-blue', 'gem-faceted-radiant-red', 'gem-faceted-round-black',
  'gem-faceted-round-white', 'gem-faceted-teardrop-pink', 'gem-faceted-trillion-blue',
  'gem-fragments-purple', 'gem-oval-red', 'gem-raw-rough-green', 'gem-raw-rough-purple',
  'gem-rough-cushion-blue', 'gem-rough-cushion-red', 'gem-rough-navette-green',
  'gem-rough-oval-purple', 'gem-rough-round-blue', 'gem-shattered-teal', 'pearl-natural',
  'pearl-purple', 'pearl-white-oval', 'pearls-white'
].map(f => `${BASE}/gems/${f}.webp`);

/** icons/commodities/currency — moedas e pilhas/bolsas de moedas. */
const MOEDAS_ICONES = [
  'coin-embossed-crown-gold', 'coin-embossed-gold-stag', 'coin-embossed-ruby-gold',
  'coin-embossed-star-gold', 'coin-embossed-sword-copper', 'coin-engraved-moon-silver',
  'coin-engraved-skull-gold', 'coin-engraved-square-gold', 'coin-inset-crown-gold',
  'coin-inset-skull-gold', 'coin-plain-gold', 'coins-assorted-mix-copper-silver-gold',
  'coins-assorted-mix-platinum', 'coins-assorted-mix-silver', 'coins-crown-stack-gold',
  'coins-engraved-copper', 'coins-leather-pouch-stone', 'coins-patched-pouch-white',
  'coins-plain-gold', 'coins-plain-pouch-gold', 'coins-plain-stack-gold',
  'coins-plain-stack-silver', 'coins-stitched-pouch-brown', 'coins-wheat-stack-copper'
].map(f => `${BASE}/currency/${f}.webp`);

/** Pool completo sorteado para cada riqueza gerada. */
export const ICONES_TESOURO_ALEATORIO = [...TESOURO, ...GEMAS, ...MOEDAS_ICONES];

/** Sorteia um ícone nativo do Foundry para representar uma riqueza gerada. */
export function iconeTesouroAleatorio() {
  return ICONES_TESOURO_ALEATORIO[Math.floor(Math.random() * ICONES_TESOURO_ALEATORIO.length)];
}

/** Ícone final de última instância (nunca deveria ser preciso — pool acima nunca está vazio). */
export const ICONE_TESOURO_PADRAO = 'icons/svg/chest.svg';
