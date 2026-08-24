/**
 * t20-hayd-tesouros | dados-nd.mjs
 * Tabela 8-1 (Geração de Tesouros) — uma linha por ND, cada linha com as
 * colunas Dinheiro e Itens, transcritas da planilha oficial (T20 p.?? +
 * atualizações de Ameaças/Deuses/Heróis de Arton).
 *
 * Cada célula é um array de faixas `{ min, max, tipo, ...parametros }`.
 * `tipo` documenta o que a célula da tabela produz — ver `motor.mjs` para a
 * interpretação de cada tipo. Esta tabela NÃO é homebrewável por linha (é a
 * progressão oficial de ND); o homebrew se aplica às tabelas referenciadas
 * (dados-riquezas, dados-itens-diversos, dados-equipamentos, dados-pocoes,
 * dados-superiores, dados-magicos).
 *
 * Modificadores do rodapé da Tabela 8-1:
 *   +%  → soma 20 na rolagem de d% que decide o tipo de riqueza/poção.
 *   2D  → na rolagem que decide o tipo de equipamento/item mágico, role
 *         2d6 (duas vezes o seletor 1d6) e ESCOLHA um dos dois resultados
 *         (não é sorteado automaticamente).
 */

/** Dinheiro: "—" */
const semDinheiro = (min, max) => ({ min, max, tipo: 'nada' });
/** Itens: "—" */
const semItem = (min, max) => ({ min, max, tipo: 'nada' });

/** Dinheiro: fórmula de dado × moeda. moeda: 'tc' | 'tp' | 'to' | 'tl' | 'generico'. */
const dinheiro = (min, max, formula, moeda) => ({ min, max, tipo: 'dinheiro', formula, moeda });

/** Dinheiro/Itens: N riquezas de uma categoria (menor/media/maior). */
const riqueza = (min, max, quantidade, categoria, maisPct = false) =>
  ({ min, max, tipo: 'riqueza', quantidade, categoria, maisPct });

const itemDiverso = (min, max) => ({ min, max, tipo: 'itemDiverso' });
const equipamento = (min, max, duasEscolhas = false) => ({ min, max, tipo: 'equipamento', duasEscolhas });
const pocao = (min, max, quantidade = '1', maisPct = false) => ({ min, max, tipo: 'pocao', quantidade, maisPct });
const superior = (min, max, melhorias, duasEscolhas = false) =>
  ({ min, max, tipo: 'superior', melhorias, duasEscolhas });
const magico = (min, max, nivel, duasEscolhas = false) => ({ min, max, tipo: 'magico', nivel, duasEscolhas });

export const TABELA_ND = {
  '1/4': {
    dinheiro: [
      semDinheiro(1, 30),
      dinheiro(31, 70, '1d6x10', 'tc'),
      dinheiro(71, 95, '1d4x100', 'tc'),
      dinheiro(96, 100, '1d6x10', 'generico')
    ],
    itens: [
      semItem(1, 50),
      itemDiverso(51, 75),
      equipamento(76, 100)
    ]
  },
  '1/2': {
    dinheiro: [
      semDinheiro(1, 25),
      dinheiro(26, 70, '2d6x10', 'tc'),
      dinheiro(71, 95, '2d8x10', 'generico'),
      dinheiro(96, 100, '1d4x100', 'generico')
    ],
    itens: [
      semItem(1, 45),
      itemDiverso(46, 70),
      equipamento(71, 100)
    ]
  },
  '1': {
    dinheiro: [
      semDinheiro(1, 20),
      dinheiro(21, 70, '3d8x10', 'generico'),
      dinheiro(71, 95, '4d12x10', 'generico'),
      riqueza(96, 100, '1', 'menor')
    ],
    itens: [
      semItem(1, 40),
      itemDiverso(41, 65),
      equipamento(66, 90),
      pocao(91, 100, '1')
    ]
  },
  '2': {
    dinheiro: [
      semDinheiro(1, 15),
      dinheiro(16, 55, '3d10x10', 'generico'),
      dinheiro(56, 85, '2d4x100', 'generico'),
      dinheiro(86, 95, '2d6+1x100', 'generico'),
      riqueza(96, 100, '1', 'menor')
    ],
    itens: [
      semItem(1, 30),
      itemDiverso(31, 40),
      equipamento(41, 70),
      pocao(71, 90, '1'),
      superior(91, 100, 1)
    ]
  },
  '3': {
    dinheiro: [
      semDinheiro(1, 10),
      dinheiro(11, 20, '4d12x10', 'generico'),
      dinheiro(21, 60, '1d4x100', 'generico'),
      dinheiro(61, 90, '1d8x10', 'to'),
      riqueza(91, 100, '1d3', 'menor')
    ],
    itens: [
      semItem(1, 25),
      itemDiverso(26, 35),
      equipamento(36, 60),
      pocao(61, 85, '1'),
      superior(86, 100, 1)
    ]
  },
  '4': {
    dinheiro: [
      semDinheiro(1, 10),
      dinheiro(11, 50, '1d6x100', 'generico'),
      dinheiro(51, 80, '1d12x100', 'generico'),
      riqueza(81, 90, '1', 'menor', true),
      riqueza(91, 100, '1d3', 'menor', true)
    ],
    itens: [
      semItem(1, 20),
      itemDiverso(21, 30),
      equipamento(31, 55, true),
      pocao(56, 80, '1', true),
      superior(81, 100, 1, true)
    ]
  },
  '5': {
    dinheiro: [
      semDinheiro(1, 15),
      dinheiro(16, 65, '1d8x100', 'generico'),
      dinheiro(66, 95, '3d4x10', 'to'),
      riqueza(96, 100, '1', 'media')
    ],
    itens: [
      semItem(1, 20),
      pocao(21, 70, '1'),
      superior(71, 90, 1),
      superior(91, 100, 2)
    ]
  },
  '6': {
    dinheiro: [
      semDinheiro(1, 15),
      dinheiro(16, 60, '2d6x100', 'generico'),
      dinheiro(61, 90, '2d10x100', 'generico'),
      riqueza(91, 100, '1d3+1', 'menor')
    ],
    itens: [
      semItem(1, 20),
      pocao(21, 65, '1', true),
      superior(66, 95, 1),
      superior(96, 100, 2, true)
    ]
  },
  '7': {
    dinheiro: [
      semDinheiro(1, 10),
      dinheiro(11, 60, '2d8x100', 'generico'),
      dinheiro(61, 90, '2d12x10', 'to'),
      riqueza(91, 100, '1d4+1', 'menor')
    ],
    itens: [
      semItem(1, 20),
      pocao(21, 60, '1d3'),
      superior(61, 90, 2),
      superior(91, 100, 3)
    ]
  },
  '8': {
    dinheiro: [
      semDinheiro(1, 10),
      dinheiro(11, 55, '2d10x100', 'generico'),
      riqueza(56, 95, '1d4+1', 'menor'),
      riqueza(96, 100, '1', 'media', true)
    ],
    itens: [
      semItem(1, 20),
      pocao(21, 75, '1d3'),
      superior(76, 95, 2),
      superior(96, 100, 3, true)
    ]
  },
  '9': {
    dinheiro: [
      semDinheiro(1, 10),
      riqueza(11, 35, '1', 'media'),
      dinheiro(36, 85, '4d6x100', 'generico'),
      riqueza(86, 100, '1d3', 'media')
    ],
    itens: [
      semItem(1, 20),
      pocao(21, 70, '1', true),
      superior(71, 95, 3),
      magico(96, 100, 'menor')
    ]
  },
  '10': {
    dinheiro: [
      semDinheiro(1, 10),
      dinheiro(11, 30, '4d6x100', 'generico'),
      dinheiro(31, 85, '4d10x10', 'to'),
      riqueza(86, 100, '1d3+1', 'media')
    ],
    itens: [
      semItem(1, 50),
      pocao(51, 75, '1d3+1'),
      superior(76, 90, 3),
      magico(91, 100, 'menor')
    ]
  },
  '11': {
    dinheiro: [
      semDinheiro(1, 10),
      dinheiro(11, 45, '2d4x1000', 'generico'),
      riqueza(46, 85, '1d3', 'media'),
      dinheiro(86, 100, '2d6x100', 'to')
    ],
    itens: [
      semItem(1, 45),
      pocao(46, 70, '1d4+1'),
      superior(71, 90, 3),
      magico(91, 100, 'menor', true)
    ]
  },
  '12': {
    dinheiro: [
      semDinheiro(1, 10),
      riqueza(11, 45, '1', 'media', true),
      dinheiro(46, 80, '2d6x1000', 'generico'),
      riqueza(81, 100, '1d4+1', 'media')
    ],
    itens: [
      semItem(1, 45),
      pocao(46, 70, '1d3+1', true),
      superior(71, 85, 4),
      magico(86, 100, 'menor')
    ]
  },
  '13': {
    dinheiro: [
      semDinheiro(1, 10),
      dinheiro(11, 45, '4d4x1000', 'generico'),
      riqueza(46, 80, '1d3+1', 'media'),
      dinheiro(81, 100, '4d6x100', 'to')
    ],
    itens: [
      semItem(1, 40),
      pocao(41, 65, '1d4+1', true),
      superior(66, 95, 4),
      magico(96, 100, 'medio')
    ]
  },
  '14': {
    dinheiro: [
      semDinheiro(1, 10),
      riqueza(11, 45, '1d3+1', 'media'),
      dinheiro(46, 80, '3d6x1000', 'generico'),
      riqueza(81, 100, '1', 'maior')
    ],
    itens: [
      semItem(1, 40),
      pocao(41, 65, '1d4+1', true),
      superior(66, 90, 4),
      magico(91, 100, 'medio')
    ]
  },
  '15': {
    dinheiro: [
      semDinheiro(1, 10),
      riqueza(11, 45, '1', 'media', true),
      dinheiro(46, 80, '2d10x1000', 'generico'),
      dinheiro(81, 100, '1d4x1000', 'to')
    ],
    itens: [
      semItem(1, 35),
      pocao(36, 45, '1d6+1'),
      superior(46, 85, 4, true),
      magico(86, 100, 'medio')
    ]
  },
  '16': {
    dinheiro: [
      semDinheiro(1, 10),
      dinheiro(11, 40, '3d6x1000', 'generico'),
      dinheiro(41, 75, '3d10x100', 'to'),
      riqueza(76, 100, '1d3', 'maior')
    ],
    itens: [
      semItem(1, 35),
      pocao(36, 45, '1d6+1', true),
      superior(46, 80, 4, true),
      magico(81, 100, 'medio')
    ]
  },
  '17': {
    dinheiro: [
      semDinheiro(1, 5),
      dinheiro(6, 40, '4d6x1000', 'generico'),
      riqueza(41, 75, '1d3', 'media', true),
      dinheiro(76, 100, '2d4x1000', 'to')
    ],
    itens: [
      semItem(1, 20),
      magico(21, 40, 'menor'),
      magico(41, 80, 'medio'),
      magico(81, 100, 'maior')
    ]
  },
  '18': {
    dinheiro: [
      semDinheiro(1, 5),
      dinheiro(6, 40, '4d10x1000', 'generico'),
      riqueza(41, 75, '1', 'maior'),
      riqueza(76, 100, '1d3+1', 'maior')
    ],
    itens: [
      semItem(1, 15),
      magico(16, 40, 'menor', true),
      magico(41, 70, 'medio'),
      magico(71, 100, 'maior')
    ]
  },
  '19': {
    dinheiro: [
      semDinheiro(1, 5),
      dinheiro(6, 40, '4d12x1000', 'generico'),
      riqueza(41, 75, '1', 'maior', true),
      dinheiro(76, 100, '1d12x1000', 'to')
    ],
    itens: [
      semItem(1, 10),
      magico(11, 40, 'menor', true),
      magico(41, 60, 'medio', true),
      magico(61, 100, 'maior')
    ]
  },
  '20': {
    dinheiro: [
      semDinheiro(1, 5),
      dinheiro(6, 40, '2d4x1000', 'to'),
      riqueza(41, 75, '1d3', 'maior'),
      riqueza(76, 100, '1d3+1', 'maior', true)
    ],
    itens: [
      semItem(1, 5),
      magico(6, 40, 'menor', true),
      magico(41, 50, 'medio', true),
      magico(51, 100, 'maior', true)
    ]
  }
};

/** Ordem de exibição dos ND no seletor do app. */
export const ORDEM_ND = [
  '1/4', '1/2', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'
];
