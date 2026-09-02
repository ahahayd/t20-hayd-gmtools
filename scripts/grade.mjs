/**
 * t20-hayd-gmtools | Medição sem diagonal dobrada
 *
 * No T20, só o MOVIMENTO conta a diagonal como 3 m. Alcance de ataques, de
 * magias, de poderes e o raio de auras ignoram isso: a diagonal vale 1,5 m,
 * como qualquer outro quadrado.
 *
 * Compartilhado entre a régua opcional (t20-hayd-regua.mjs) e as auras, para
 * que as duas meçam do mesmo jeito — duas cópias da regra divergiriam no
 * primeiro ajuste.
 */

/**
 * Grade espelho da cena atual, idêntica em tamanho e escala, mas com a regra de
 * diagonal EQUIDISTANT (diagonal custa o mesmo que ortogonal). Medir por ela dá
 * exatamente a distância que ignora o dobro das diagonais, sem tocar na grade
 * real da cena — a régua padrão e o movimento de tokens seguem intactos.
 *
 * Só faz sentido em grade quadrada; em hexágonos ou sem grade não há diagonal
 * a descontar e devolvemos null (quem chamar cai na medição normal).
 */
let _grade = null;

export function gradeSemDiagonal() {
  const grade = canvas?.grid;
  if (!grade?.isSquare) return null;

  const { size, distance, units } = grade;
  if (_grade && _grade.size === size && _grade.distance === distance) return _grade;

  _grade = new foundry.grid.SquareGrid({
    size,
    distance,
    units,
    diagonals: CONST.GRID_DIAGONALS.EQUIDISTANT
  });
  return _grade;
}

/** A grade espelho é cacheada; trocar de cena precisa jogá-la fora. */
export function invalidarGrade() {
  _grade = null;
}

/**
 * Distância de um caminho ignorando o dobro das diagonais.
 *
 * Fora de grade quadrada não existe diagonal a descontar, então o número certo
 * é o da própria cena — caímos na medição padrão em vez de devolver nada.
 *
 * @param {object[]} pontos  Waypoints no formato aceito por `measurePath`
 * @returns {number|null}    Distância nas unidades da cena, ou null sem canvas
 */
export function medirCaminho(pontos) {
  const espelho = gradeSemDiagonal();
  const grade = espelho ?? canvas?.grid;
  if (!grade) return null;
  return grade.measurePath(pontos)?.distance ?? null;
}
