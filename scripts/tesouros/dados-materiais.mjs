/**
 * t20-hayd-tesouros | dados-materiais.mjs
 * Materiais especiais (1d6) — usados quando uma melhoria "Material especial"
 * é rolada em dados-superiores.mjs. Homebrewável (campanhas com materiais
 * extras podem estender para 1d7, 1d8...).
 */
import { slugify } from './utils.mjs';

const MAT = (min, max, nome) => ({ min, max, tipo: 'catalogo', chave: slugify(nome), nome });

export const MATERIAIS_ESPECIAIS = {
  dado: 6,
  entradas: [
    MAT(1, 1, 'Aço-rubi'),
    MAT(2, 2, 'Adamante'),
    MAT(3, 3, 'Gelo eterno'),
    MAT(4, 4, 'Madeira Tollon'),
    MAT(5, 5, 'Matéria vermelha'),
    MAT(6, 6, 'Mitral')
  ]
};
