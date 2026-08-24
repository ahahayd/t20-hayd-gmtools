/**
 * t20-hayd-tesouros | dados-superiores.mjs
 * Tabela 8-5 "Itens Superiores" — Melhorias de Armas / Armaduras & Escudos /
 * Esotéricos (d% cada), usadas pelo resultado "Superior (N melhorias)".
 *
 * `conta2`  → a melhoria conta como DUAS (inclui a de pré-requisito); se o
 *             item só vai receber uma melhoria no total, o motor deve
 *             rerolar (regra do rodapé da Tabela 8-5).
 * `materialEspecial` → a melhoria é "Material especial", que exige uma
 *             segunda rolagem em MATERIAIS (dados-materiais.mjs, 1d6).
 */
import { slugify } from './utils.mjs';

const M = (min, max, nome, livro, pagina, extra = {}) =>
  ({ min, max, tipo: 'catalogo', chave: slugify(nome), nome, livro, pagina, ...extra });

export const MELHORIAS_ARMAS = {
  dado: 100,
  categoria: 'arma',
  entradas: [
    M(1, 10, 'Atroz', 'Tormenta20', 164, { conta2: true }),
    M(11, 12, 'Banhada a ouro', 'Tormenta20', 164),
    M(13, 20, 'Certeira', 'Tormenta20', 164),
    M(21, 21, 'Conduíte', 'Deuses de Arton', 54),
    M(22, 23, 'Cravejada de gemas', 'Tormenta20', 164),
    M(24, 31, 'Cruel', 'Tormenta20', 164),
    M(32, 33, 'Discreta', 'Tormenta20', 164),
    M(34, 38, 'Equilibrada', 'Tormenta20', 165),
    M(39, 42, 'Farpada', 'Heróis de Arton', 239),
    M(43, 44, 'Guarda', 'Heróis de Arton', 239),
    M(45, 48, 'Harmonizada', 'Tormenta20', 165),
    M(49, 49, 'Incendiária', 'Heróis de Arton', 239),
    M(50, 53, 'Injeção alquímica', 'Tormenta20', 165),
    M(54, 55, 'Macabra', 'Tormenta20', 165),
    M(56, 65, 'Maciça', 'Tormenta20', 165),
    M(66, 75, 'Material especial', 'Tormenta20', 165, { materialEspecial: true }),
    M(76, 79, 'Mira telescópica', 'Tormenta20', 166),
    M(80, 87, 'Precisa', 'Tormenta20', 166),
    M(88, 89, 'Pressurizada', 'Heróis de Arton', 240),
    M(90, 99, 'Pungente', 'Tormenta20', 166, { conta2: true }),
    M(100, 100, 'Usada', 'Heróis de Arton', 240)
  ]
};

export const MELHORIAS_ARMADURAS_ESCUDOS = {
  dado: 100,
  categoria: 'armadura-escudo',
  entradas: [
    M(1, 10, 'Ajustada', 'Tormenta20', 164),
    M(11, 14, 'Balístico', 'Heróis de Arton', 239),
    M(15, 18, 'Banhada a ouro', 'Tormenta20', 164),
    M(19, 22, 'Cravejada de gemas', 'Tormenta20', 164),
    M(23, 27, 'Delicada', 'Tormenta20', 164),
    M(28, 29, 'Deslumbrante', 'Heróis de Arton', 239, { conta2: true }),
    M(30, 31, 'Diligente', 'Deuses de Arton', 54),
    M(32, 35, 'Discreta', 'Tormenta20', 164),
    M(36, 39, 'Espinhos', 'Tormenta20', 165),
    M(40, 43, 'Injetora', 'Heróis de Arton', 240),
    M(44, 47, 'Inscrito', 'Deuses de Arton', 54),
    M(48, 49, 'Macabra', 'Tormenta20', 165),
    M(50, 59, 'Material especial', 'Tormenta20', 165, { materialEspecial: true }),
    M(60, 64, 'Polida', 'Tormenta20', 166),
    M(65, 84, 'Reforçada', 'Tormenta20', 166),
    M(85, 95, 'Selada', 'Tormenta20', 166),
    M(96, 100, 'Sob medida', 'Tormenta20', 166, { conta2: true })
  ]
};

export const MELHORIAS_ESOTERICOS = {
  dado: 100,
  categoria: 'esoterico',
  entradas: [
    M(1, 3, 'Banhado a ouro', 'Tormenta20', 164),
    M(4, 18, 'Canalizador', 'Tormenta20', 164),
    M(19, 21, 'Canônico', 'Deuses de Arton', 54),
    M(22, 24, 'Cravejado de gemas', 'Tormenta20', 164),
    M(25, 28, 'Discreto', 'Tormenta20', 164),
    M(29, 43, 'Energético', 'Tormenta20', 165),
    M(44, 58, 'Harmonizado', 'Tormenta20', 165),
    M(59, 61, 'Macabro', 'Tormenta20', 165),
    M(62, 70, 'Material especial', 'Tormenta20', 165, { materialEspecial: true }),
    M(71, 80, 'Poderoso', 'Tormenta20', 166),
    M(81, 90, 'Potencializador', 'Heróis de Arton', 240, { conta2: true }),
    M(91, 100, 'Vigilante', 'Tormenta20', 166)
  ]
};

/** Tabela de melhorias correspondente à categoria do item base. */
export const TABELA_SUPERIOR_POR_CATEGORIA = {
  arma: MELHORIAS_ARMAS,
  'armadura-escudo': MELHORIAS_ARMADURAS_ESCUDOS,
  esoterico: MELHORIAS_ESOTERICOS
};
