/**
 * t20-hayd-gmtools | Tamanho da área ao posicionar
 *
 * Enquanto o gabarito de uma magia/habilidade com área está preso ao mouse,
 * Alt + roda do mouse aumenta ou diminui a área de 1,5 m em 1,5 m (um
 * quadrado). Serve para efeitos e itens que mudam a área sem que o texto da
 * magia acompanhe.
 *
 * Na v13 o sistema posiciona um MeasuredTemplate (AbilityTemplate) e prende a
 * roda em canvas.app.view.onwheel; na v14 usa o placeRegion do core, que só
 * repassa a roda à camada com Ctrl/Shift (com Alt ela daria zoom). Por isso a
 * roda é ouvida na fase de captura da janela, antes dos dois, e só é consumida
 * com Alt segurado e um posicionamento em andamento — fora disso nada muda.
 */

/** Tamanho de um quadrado nas unidades da cena (1,5 m no T20). */
function passo() {
  return canvas.dimensions?.distance || 1.5;
}

/** Arredonda para múltiplos do passo, sem nunca passar de um quadrado para baixo. */
function ajustar(valor, sentido) {
  const u = passo();
  const atual = Math.round(valor / u) * u;
  return Math.max(u, atual + sentido * u);
}

// ─── v13: MeasuredTemplate ────────────────────────────────────────────────────

function gabaritoEmPosicionamento() {
  const filhos = canvas.templates?.preview?.children ?? [];
  return filhos.find((c) => c.document && !c.document.id && c.document.distance) ?? null;
}

function redimensionarGabarito(gabarito, sentido) {
  const doc = gabarito.document;
  if (doc.t === 'rect') {
    // O sistema guarda o cubo pela diagonal (lado × √2, direção 45°).
    const lado = ajustar(doc.distance / Math.SQRT2, sentido);
    doc.updateSource({ distance: lado * Math.SQRT2 });
  } else {
    doc.updateSource({ distance: ajustar(doc.distance, sentido) });
  }
  gabarito.refresh();
}

// ─── v14: Region ──────────────────────────────────────────────────────────────

function redimensionarRegiao(ctx, sentido) {
  const { preview, shape, onChange, regionIndex, regionCount, shapes } = ctx;
  const px = canvas.dimensions.distancePixels;
  const emUnidades = (pixels) => pixels / px;
  const mudanca = {};
  switch (shape.type) {
    case 'circle':
    case 'cone':
    case 'ring':
    case 'emanation':
      mudanca.radius = ajustar(emUnidades(shape.radius), sentido) * px;
      break;
    case 'line':
      mudanca.length = ajustar(emUnidades(shape.length), sentido) * px;
      break;
    case 'rectangle': {
      // Cresce mantendo o centro onde o mouse está.
      const largura = ajustar(emUnidades(shape.width), sentido) * px;
      const altura = ajustar(emUnidades(shape.height), sentido) * px;
      mudanca.x = shape.x - (largura - shape.width) / 2;
      mudanca.y = shape.y - (altura - shape.height) / 2;
      mudanca.width = largura;
      mudanca.height = altura;
      break;
    }
    default:
      return false;
  }
  shape.updateSource(mudanca);
  const document = preview.document;
  const diff = document.updateSource({ shapes: [...document.shapes.slice(0, -1), shape] });
  if (foundry.utils.isEmpty(diff)) return true;
  document.updateShapeConstraints?.();
  preview.renderFlags.set({ refreshShapes: true });
  onChange?.({ preview, document, regionIndex, regionCount, shape, shapeIndex: shape._index, shapeCount: shapes.length });
  return true;
}

// ─── Roda ─────────────────────────────────────────────────────────────────────

function aoRolar(event) {
  if (!event.altKey || !canvas?.ready) return;
  if (event.target?.id !== 'board') return;
  const dy = event.deltaY || event.deltaX;
  if (!dy) return;
  // Roda para cima aumenta, para baixo diminui.
  const sentido = dy < 0 ? 1 : -1;

  let tratado = false;
  const ctx = canvas.regions?._placementContext;
  if (ctx?.shape) tratado = redimensionarRegiao(ctx, sentido);
  else {
    const gabarito = gabaritoEmPosicionamento();
    if (gabarito) {
      redimensionarGabarito(gabarito, sentido);
      tratado = true;
    }
  }
  if (!tratado) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

Hooks.once('ready', () => {
  window.addEventListener('wheel', aoRolar, { capture: true, passive: false });
});
