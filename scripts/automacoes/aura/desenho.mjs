/**
 * Auras — prévia visual da área.
 *
 * Puramente cosmético e local: nada aqui grava documento, e roda em QUALQUER
 * cliente (não é privilégio do Mestre). Passar o mouse sobre a fonte de uma
 * aura ligada pinta os quadrados afetados.
 *
 * Pinta quadrado por quadrado, e não um círculo: com a diagonal dobrada do
 * Tormenta20 a área de 9 m é um losango. Como usa a mesma função do efeito
 * (`quadradosNaAura`), o que está pintado é exatamente o que recebe o bônus —
 * inclusive o recorte das paredes.
 */
import { aurasDoAtor, raioDaAura } from './estado.mjs';
import { quadradosNaAura } from './alcance.mjs';

/** Nome da camada de destaque; uma só, porque só existe um mouse. */
const CAMADA = 't20g-aura-previa';
const COR = 0xffd700;

let pintado = false;

function limpar() {
  if (!pintado) return;
  canvas?.interface?.grid?.destroyHighlightLayer?.(CAMADA);
  pintado = false;
}

/**
 * Chamado a cada `hoverToken`. Sempre limpa antes: assim um hover em qualquer
 * token já apaga uma prévia órfã — de um token que sumiu, mudou de cena ou
 * teve a aura cancelada com o mouse ainda em cima.
 */
export function aoPassarMouse(token, sobre) {
  limpar();
  if (!sobre || !token?.actor) return;

  const grade = canvas?.interface?.grid;
  if (!grade?.addHighlightLayer || !grade.highlightPosition) return;

  const quadrados = new Map();
  for (const { def } of aurasDoAtor(token.actor)) {
    const raio = raioDaAura(token.actor, def);
    for (const ponto of quadradosNaAura(token, def.aura, raio)) {
      // Duas auras na mesma ficha podem cobrir o mesmo quadrado
      quadrados.set(`${ponto.x},${ponto.y}`, ponto);
    }
  }
  if (!quadrados.size) return;

  grade.addHighlightLayer(CAMADA);
  pintado = true;
  for (const { x, y } of quadrados.values()) {
    grade.highlightPosition(CAMADA, { x, y, color: COR, border: COR, alpha: 0.12 });
  }
}

/** Cena trocada ou token apagado: nada a manter na tela. */
export function limparPrevia() {
  limpar();
}
