/**
 * Marca as janelas do módulo com `t20g-ui`, a classe de onde pendem todos os
 * tokens e primitivas de `styles/t20g-ui.css`.
 *
 * Por que um hook e não `classes: ['t20g-ui']` em cada chamada: o módulo abre
 * quase cinquenta diálogos (DialogV2) espalhados por automações, tesouros,
 * atributos e party. Marcar um por um é uma lista que nasce desatualizada —
 * o próximo diálogo escrito sai sem a classe e sem o visual, e ninguém
 * percebe até alguém abrir.
 *
 * O teste é a presença de markup do módulo (`t20g-*` ou `thm-*`) dentro da
 * janela. É um `querySelector` por render de janela, e nada mais: nenhuma
 * observação contínua, nenhum trabalho por quadro.
 */

const CLASSE = 't20g-ui';
const MARCADOR = '[class*="t20g-"], [class*="thm-"]';

function marcar(_app, elemento) {
  // `renderApplicationV2` entrega o HTMLElement; alguns hooks antigos passam
  // um jQuery. Normaliza antes de tocar no DOM.
  const raiz = elemento?.[0] ?? elemento;
  if (!(raiz instanceof HTMLElement) || raiz.classList.contains(CLASSE)) return;
  if (!raiz.matches(MARCADOR) && !raiz.querySelector(MARCADOR)) return;
  raiz.classList.add(CLASSE);
}

Hooks.on('renderApplicationV2', marcar);
Hooks.on('renderDialogV2', marcar);
