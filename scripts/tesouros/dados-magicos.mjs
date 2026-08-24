/**
 * t20-hayd-tesouros | dados-magicos.mjs
 * Tabelas de Encantos (Armas / Armaduras & Escudos / Esotéricos) e os itens
 * "específicos" que elas podem redirecionar para (Tabela 8-9/8-10/8-11 e as
 * de item específico). Usadas pelo resultado "Mágico (menor/médio/maior)".
 *
 * `conta2`     → conta como dois encantos (inclui o de pré-requisito); se o
 *                item só vai receber um encanto no total, o motor reroda.
 * `apenasArmadura` / `apenasEscudo` → exclusivo de um dos dois; rerolar se
 *                o item base não bate.
 */
import { slugify } from './utils.mjs';

const E = (min, max, nome, livro, pagina, extra = {}) =>
  ({ min, max, tipo: 'catalogo', chave: slugify(nome), nome, livro, pagina, ...extra });
const R = (min, max, tabela) => ({ min, max, tipo: 'redirect', tabela });

export const ENCANTOS_ARMAS = {
  dado: 100,
  categoria: 'arma',
  entradas: [
    E(1, 1, 'Alvorada', 'Heróis de Arton', 256),
    E(2, 5, 'Ameaçadora', 'Tormenta20', 335),
    E(6, 6, 'Anátema', 'Heróis de Arton', 256),
    E(7, 8, 'Anticriatura', 'Tormenta20', 335),
    E(9, 9, 'Arremesso', 'Tormenta20', 335),
    E(10, 10, 'Assassina', 'Tormenta20', 335),
    E(11, 11, 'Brumosa', 'Heróis de Arton', 256),
    E(12, 12, 'Caçadora', 'Tormenta20', 335),
    E(13, 13, 'Cantante', 'Heróis de Arton', 256),
    E(14, 14, 'Ciclônica', 'Heróis de Arton', 256),
    E(15, 18, 'Congelante', 'Tormenta20', 335),
    E(19, 19, 'Conjuradora', 'Tormenta20', 335),
    E(20, 23, 'Corrosiva', 'Tormenta20', 335),
    E(24, 25, 'Crescente', 'Heróis de Arton', 256),
    E(26, 26, 'Cristalina', 'Heróis de Arton', 256),
    E(27, 27, 'Cronal', 'Heróis de Arton', 256, { conta2: true }),
    E(28, 28, 'Cuidadora', 'Heróis de Arton', 256),
    E(29, 30, 'Dançarina', 'Tormenta20', 335),
    E(31, 32, 'Defensora', 'Tormenta20', 335),
    E(33, 33, 'Destruidora', 'Tormenta20', 335),
    E(34, 35, 'Dilacerante', 'Tormenta20', 335),
    E(36, 36, 'Drenante', 'Tormenta20', 335),
    E(37, 40, 'Elétrica', 'Tormenta20', 335),
    E(41, 41, 'Energética', 'Tormenta20', 335, { conta2: true }),
    E(42, 43, 'Espreitadora', 'Heróis de Arton', 256),
    E(44, 45, 'Excruciante', 'Tormenta20', 335),
    E(46, 49, 'Flamejante', 'Tormenta20', 335),
    E(50, 57, 'Formidável', 'Tormenta20', 336),
    E(58, 59, 'Frenética', 'Heróis de Arton', 256),
    E(60, 60, 'Gárgula', 'Heróis de Arton', 256),
    E(61, 61, 'Horrenda', 'Heróis de Arton', 256),
    E(62, 62, 'Indignada', 'Heróis de Arton', 256),
    E(63, 63, 'Infestada', 'Heróis de Arton', 256),
    E(64, 64, 'Lancinante', 'Tormenta20', 336, { conta2: true }),
    E(65, 72, 'Magnífica', 'Tormenta20', 336, { conta2: true }),
    E(73, 73, 'Manáfaga', 'Heróis de Arton', 256),
    E(74, 75, 'Piedosa', 'Tormenta20', 336),
    E(76, 76, 'Profana', 'Tormenta20', 336),
    E(77, 77, 'Rebote', 'Heróis de Arton', 256),
    E(78, 78, 'Reflexiva', 'Heróis de Arton', 257),
    E(79, 79, 'Ressonante', 'Heróis de Arton', 257),
    E(80, 80, 'Sagrada', 'Tormenta20', 336),
    E(81, 82, 'Sanguinária', 'Tormenta20', 336),
    E(83, 83, 'Sepulcral', 'Heróis de Arton', 257),
    E(84, 84, 'Sombria', 'Heróis de Arton', 257),
    E(85, 85, 'Trovejante', 'Tormenta20', 336),
    E(86, 86, 'Tumular', 'Tormenta20', 336),
    E(87, 87, 'Vampírica', 'Heróis de Arton', 257),
    E(88, 89, 'Veloz', 'Tormenta20', 336),
    E(90, 90, 'Venenosa', 'Tormenta20', 336),
    R(91, 100, 'armaEspecifica')
  ]
};

export const ENCANTOS_ARMADURAS_ESCUDOS = {
  dado: 100,
  categoria: 'armadura-escudo',
  entradas: [
    E(1, 2, 'Abascanto', 'Tormenta20', 338),
    E(3, 4, 'Abençoado', 'Tormenta20', 338),
    E(5, 5, 'Abissal', 'Heróis de Arton', 258),
    E(6, 6, 'Acrobático', 'Tormenta20', 338),
    E(7, 8, 'Alado', 'Tormenta20', 338),
    E(9, 9, 'Ancorada', 'Heróis de Arton', 258, { conta2: true, apenasArmadura: true }),
    E(10, 11, 'Animado', 'Tormenta20', 338, { conta2: true, apenasEscudo: true }),
    E(12, 12, 'Anulador', 'Heróis de Arton', 258, { conta2: true }),
    E(13, 13, 'Arbóreo', 'Heróis de Arton', 258),
    E(14, 15, 'Assustador', 'Tormenta20', 338),
    E(16, 16, 'Astuto', 'Heróis de Arton', 258),
    E(17, 17, 'Cáustica', 'Tormenta20', 338),
    E(18, 27, 'Defensor', 'Tormenta20', 338),
    E(28, 28, 'Densa', 'Heróis de Arton', 258, { conta2: true, apenasArmadura: true }),
    E(29, 29, 'Égide', 'Heróis de Arton', 258),
    E(30, 30, 'Enraizada', 'Heróis de Arton', 258, { conta2: true, apenasArmadura: true }),
    E(31, 31, 'Escorregadio', 'Tormenta20', 338),
    E(32, 33, 'Esmagador', 'Tormenta20', 339, { conta2: true, apenasEscudo: true }),
    E(34, 34, 'Esmérico', 'Heróis de Arton', 258),
    E(35, 36, 'Estígio', 'Heróis de Arton', 258, { conta2: true }),
    E(37, 37, 'Etéreo', 'Heróis de Arton', 259),
    E(38, 39, 'Fantasmagórico', 'Tormenta20', 339),
    E(40, 43, 'Fortificado', 'Tormenta20', 339),
    E(44, 44, 'Gélido', 'Tormenta20', 339),
    E(45, 45, 'Geomântico', 'Heróis de Arton', 259),
    E(46, 55, 'Guardião', 'Tormenta20', 339, { conta2: true }),
    E(56, 57, 'Hipnótico', 'Tormenta20', 339),
    E(58, 58, 'Ilusório', 'Tormenta20', 339),
    E(59, 59, 'Incandescente', 'Tormenta20', 339),
    E(60, 64, 'Invulnerável', 'Tormenta20', 339),
    E(65, 65, 'Ligeira', 'Heróis de Arton', 259, { conta2: true, apenasArmadura: true }),
    E(66, 67, 'Luminescente', 'Heróis de Arton', 259),
    E(68, 72, 'Opaco', 'Tormenta20', 339),
    E(73, 73, 'Prístino', 'Heróis de Arton', 259),
    E(74, 78, 'Protetor', 'Tormenta20', 339),
    E(79, 79, 'Purificador', 'Heróis de Arton', 259),
    E(80, 81, 'Reanimador', 'Heróis de Arton', 259),
    E(82, 83, 'Refletor', 'Tormenta20', 339),
    E(84, 84, 'Relampejante', 'Tormenta20', 339),
    E(85, 85, 'Reluzente', 'Tormenta20', 339),
    E(86, 86, 'Replicante', 'Heróis de Arton', 259),
    E(87, 87, 'Resiliente', 'Heróis de Arton', 259),
    E(88, 88, 'Sombrio', 'Tormenta20', 339),
    E(89, 89, 'Vórtice', 'Heróis de Arton', 259),
    E(90, 90, 'Zeloso', 'Tormenta20', 339),
    R(91, 100, 'armaduraEscudoEspecifico')
  ]
};

export const ENCANTOS_ESOTERICOS = {
  dado: 100,
  categoria: 'esoterico',
  entradas: [
    E(1, 2, 'Abafador', 'Heróis de Arton', 260),
    E(3, 12, 'Bélico', 'Heróis de Arton', 260),
    E(13, 16, 'Caridoso', 'Heróis de Arton', 260),
    E(17, 20, 'Chocante', 'Heróis de Arton', 260),
    E(21, 30, 'Clemente', 'Heróis de Arton', 260),
    E(31, 32, 'Contido', 'Heróis de Arton', 260),
    E(33, 34, 'Embusteiro', 'Heróis de Arton', 260),
    E(35, 36, 'Emergencial', 'Heróis de Arton', 260),
    E(37, 40, 'Encadeado', 'Heróis de Arton', 260),
    E(41, 42, 'Escultor', 'Heróis de Arton', 260),
    E(43, 44, 'Frugal', 'Heróis de Arton', 261),
    E(45, 48, 'Glacial', 'Heróis de Arton', 261),
    E(49, 50, 'Imperioso', 'Heróis de Arton', 261),
    E(51, 52, 'Implacável', 'Heróis de Arton', 261, { conta2: true }),
    E(53, 54, 'Incriminador', 'Heróis de Arton', 261),
    E(55, 61, 'Inflamável', 'Heróis de Arton', 261),
    E(62, 65, 'Inquisidor', 'Heróis de Arton', 261),
    E(66, 69, 'Insistente', 'Heróis de Arton', 261),
    E(70, 71, 'Khalmyrita', 'Heróis de Arton', 261),
    E(72, 81, 'Majestoso', 'Heróis de Arton', 261, { conta2: true }),
    E(82, 83, 'Nímbico', 'Heróis de Arton', 261),
    E(84, 84, 'Pulverizante', 'Heróis de Arton', 261, { conta2: true }),
    E(85, 85, 'Retaliador', 'Heróis de Arton', 261),
    E(86, 87, 'Sanguessuga', 'Heróis de Arton', 261),
    E(88, 88, 'Traiçoeiro', 'Heróis de Arton', 261),
    E(89, 90, 'Verdugo', 'Heróis de Arton', 261),
    R(91, 100, 'esotericoEspecifico')
  ]
};

/** Tabela de encantos correspondente à categoria do item base. */
export const TABELA_MAGICO_POR_CATEGORIA = {
  arma: ENCANTOS_ARMAS,
  'armadura-escudo': ENCANTOS_ARMADURAS_ESCUDOS,
  esoterico: ENCANTOS_ESOTERICOS
};

/** Itens mágicos ESPECÍFICOS — resultado terminal (substitui a build de encantos acumulada). */
export const ARMA_ESPECIFICA = {
  dado: 100,
  entradas: [
    E(1, 2, 'Adaga da bruma', 'Heróis de Arton', 257),
    E(3, 3, 'Adaga ofídica', 'Deuses de Arton', 58),
    E(4, 4, 'Adaga sorrateira', 'Deuses de Arton', 56),
    E(5, 5, 'Alabarda da coragem', 'Deuses de Arton', 57),
    E(6, 6, 'Alfange dourado', 'Deuses de Arton', 56),
    E(7, 7, 'Alguma coisa de Nimb...', 'Deuses de Arton', 58),
    E(8, 10, 'Arco das sombras', 'Heróis de Arton', 257),
    E(11, 12, 'Arco do crepúsculo', 'Heróis de Arton', 257),
    E(13, 15, 'Arco do poder', 'Tormenta20', 336),
    E(16, 18, 'Avalanche', 'Tormenta20', 337),
    E(19, 21, 'Azagaia dos relâmpagos', 'Tormenta20', 337),
    E(22, 23, 'Azagaia fantasma', 'Heróis de Arton', 257),
    E(24, 26, 'Besta estelar', 'Heróis de Arton', 257),
    E(27, 29, 'Besta explosiva', 'Tormenta20', 337),
    E(30, 30, 'Bordão sabichão', 'Deuses de Arton', 58),
    E(31, 31, 'Cajado das matas', 'Deuses de Arton', 55),
    E(32, 32, 'Cimitarra solar', 'Deuses de Arton', 56),
    E(33, 34, 'Clava de lava', 'Heróis de Arton', 257),
    E(35, 37, 'Espada baronial', 'Tormenta20', 337),
    E(38, 39, 'Espada da tempestade', 'Heróis de Arton', 257),
    E(40, 42, 'Espada do guardião', 'Heróis de Arton', 257),
    E(43, 43, 'Espada imaculada', 'Deuses de Arton', 59),
    E(44, 44, 'Espada monástica', 'Deuses de Arton', 57),
    E(45, 46, 'Espada solar', 'Heróis de Arton', 257),
    E(47, 49, 'Espada sortuda', 'Tormenta20', 337),
    E(50, 51, 'Florete do vendaval', 'Heróis de Arton', 258),
    E(52, 54, 'Florete fugaz', 'Tormenta20', 337),
    E(55, 55, 'Katana da determinação', 'Deuses de Arton', 57),
    E(56, 58, 'Lâmina da luz', 'Tormenta20', 338),
    E(59, 61, 'Lança animalesca', 'Tormenta20', 338),
    E(62, 62, 'Lança da dominação', 'Deuses de Arton', 56),
    E(63, 64, 'Lança da fênix', 'Heróis de Arton', 258),
    E(65, 67, 'Língua do deserto', 'Tormenta20', 338),
    E(68, 70, 'Maça do terror', 'Tormenta20', 338),
    E(71, 71, 'Maça monstruosa', 'Deuses de Arton', 58),
    E(72, 72, 'Machado da bravura', 'Deuses de Arton', 55),
    E(73, 74, 'Machado da natureza', 'Heróis de Arton', 258),
    E(75, 76, 'Machado do abismo', 'Heróis de Arton', 258),
    E(77, 79, 'Machado do vulcão', 'Heróis de Arton', 258),
    E(80, 80, 'Machado lamnoriano', 'Deuses de Arton', 59),
    E(81, 83, 'Machado silvestre', 'Tormenta20', 338),
    E(84, 84, 'Mangual aventureiro', 'Deuses de Arton', 59),
    E(85, 86, 'Martelo da terra', 'Heróis de Arton', 258),
    E(87, 89, 'Martelo de Doherimm', 'Tormenta20', 338),
    E(90, 91, 'Martelo do titã', 'Heróis de Arton', 258),
    E(92, 93, 'Punhal das profundezas', 'Heróis de Arton', 258),
    E(94, 96, 'Punhal sszzaazita', 'Tormenta20', 338),
    E(97, 97, 'Tridente aquoso', 'Deuses de Arton', 58),
    E(98, 100, 'Vingadora sagrada', 'Tormenta20', 338)
  ]
};

export const ARMADURA_ESCUDO_ESPECIFICO = {
  dado: 100,
  entradas: [
    E(1, 4, 'Armadura da luz', 'Tormenta20', 340),
    E(5, 8, 'Armadura das sombras profundas', 'Heróis de Arton', 259),
    E(9, 12, 'Armadura do dragão ancião', 'Heróis de Arton', 259),
    E(13, 16, 'Armadura do inverno perene', 'Heróis de Arton', 259),
    E(17, 18, 'Armadura do julgamento', 'Deuses de Arton', 57),
    E(19, 22, 'Baluarte anão', 'Tormenta20', 340),
    E(23, 26, 'Carapaça demoníaca', 'Tormenta20', 340),
    E(27, 30, 'Cota da serpente marinha', 'Heróis de Arton', 259),
    E(31, 40, 'Cota élfica', 'Tormenta20', 340),
    E(41, 44, 'Couraça do comando', 'Tormenta20', 340),
    E(45, 48, 'Couraça do guardião celeste', 'Heróis de Arton', 259),
    E(49, 52, 'Couro de monstro', 'Tormenta20', 340),
    E(53, 56, 'Escudo da ira vulcânica', 'Heróis de Arton', 260),
    E(57, 60, 'Escudo da luz estelar', 'Heróis de Arton', 260),
    E(61, 64, 'Escudo da natureza viva', 'Heróis de Arton', 260),
    E(65, 68, 'Escudo de Azgher', 'Tormenta20', 340),
    E(69, 72, 'Escudo do conjurador', 'Tormenta20', 340),
    E(73, 76, 'Escudo do eclipse', 'Tormenta20', 340),
    E(77, 80, 'Escudo do grifo', 'Heróis de Arton', 260),
    E(81, 86, 'Escudo do leão', 'Tormenta20', 340),
    E(87, 90, 'Escudo do trovão', 'Heróis de Arton', 260),
    E(91, 94, 'Escudo espinhoso', 'Tormenta20', 340),
    E(95, 98, 'Loriga do centurião', 'Tormenta20', 340),
    E(99, 100, 'Manto da noite', 'Tormenta20', 340)
  ]
};

export const ESOTERICO_ESPECIFICO = {
  dado: 100,
  entradas: [
    E(1, 20, 'Cajado da destruição', 'Tormenta20', 337),
    E(21, 40, 'Cajado da vida', 'Tormenta20', 337),
    E(41, 45, 'Cajado das marés', 'Heróis de Arton', 262),
    E(46, 60, 'Cajado do poder', 'Tormenta20', 337),
    E(61, 75, 'Cálice sagrado', 'Heróis de Arton', 262),
    E(76, 85, 'Relógio do arcanista', 'Heróis de Arton', 262),
    E(86, 95, 'Varinha da generosidade', 'Deuses de Arton', 59),
    E(96, 100, 'Varinha milenar', 'Heróis de Arton', 262)
  ]
};

/** Tabelas de item específico referenciadas pelos `redirect` acima. */
export const TABELAS_ESPECIFICAS = {
  armaEspecifica: ARMA_ESPECIFICA,
  armaduraEscudoEspecifico: ARMADURA_ESCUDO_ESPECIFICO,
  esotericoEspecifico: ESOTERICO_ESPECIFICO
};
