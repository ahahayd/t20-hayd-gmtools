/**
 * t20-hayd-tesouros | dados-riquezas.mjs
 * Tabela "Valor das Riquezas" (Menor/Média/Maior) e "Espaços das Riquezas",
 * transcritas do PDF oficial. Cada faixa de valor guarda a fórmula de preço
 * e os exemplos de item associados, agrupados por espaços ocupados — os
 * exemplos SÃO homebrewáveis (ver homebrew.mjs, tabela `riquezas:<faixa>`).
 */

/** Faixas de valor: uma linha por "nível" de riqueza da tabela oficial.
 *  `menor`/`media`/`maior` são faixas de d% (ou null quando a coluna não
 *  alcança aquele nível de riqueza). `formula` é a fórmula de T$; `base` é
 *  o valor médio aproximado mostrado entre parênteses no livro (só exibição). */
export const FAIXAS_VALOR_RIQUEZA = [
  { id: 1, menor: [1, 25], media: null, maior: null, formula: '4d4', base: 10 },
  { id: 2, menor: [26, 40], media: null, maior: null, formula: '1d4x10', base: 25 },
  { id: 3, menor: [41, 55], media: [1, 10], maior: null, formula: '2d4x10', base: 50 },
  { id: 4, menor: [56, 70], media: [11, 30], maior: null, formula: '4d6x10', base: 140 },
  { id: 5, menor: [71, 85], media: [31, 50], maior: [1, 5], formula: '1d6x100', base: 350 },
  { id: 6, menor: [86, 95], media: [51, 65], maior: [6, 15], formula: '2d6x100', base: 700 },
  { id: 7, menor: [96, 99], media: [66, 80], maior: [16, 25], formula: '2d8x100', base: 900 },
  { id: 8, menor: [100, 100], media: [81, 90], maior: [26, 40], formula: '4d10x100', base: 2200 },
  { id: 9, menor: null, media: [91, 95], maior: [41, 60], formula: '6d12x100', base: 3900 },
  { id: 10, menor: null, media: [96, 99], maior: [61, 75], formula: '2d10x1000', base: 11000 },
  { id: 11, menor: null, media: [100, 100], maior: [76, 85], formula: '6d8x1000', base: 27000 },
  { id: 12, menor: null, media: null, maior: [86, 95], formula: '1d10x10000', base: 55000 },
  { id: 13, menor: null, media: null, maior: [96, 100], formula: '4d12x10000', base: 260000 }
];

/**
 * Exemplos de item por faixa de valor. `espacos: null` significa "role em
 * ESPACOS_RIQUEZA" (marcado como "—" no livro). Textos mantêm as notas do
 * livro entre parênteses — são flavor, não afetam preço/espaço.
 */
export const EXEMPLOS_RIQUEZA = {
  1: [
    { nome: 'Ágata trincada', espacos: 0.5 },
    { nome: 'Anel de hematita', espacos: 0.5 },
    { nome: 'Bule de chá com gravações em prata', espacos: 0.5 },
    { nome: '1d4+1 soldadinhos de chumbo do Exército do Reinado', espacos: 0.5 },
    { nome: 'Jarro de mel', espacos: 0.5 },
    { nome: 'Prato de bronze', espacos: 0.5 },
    { nome: 'Tapeçaria simples sem moldura', espacos: 0.5 },
    { nome: 'Tinta de tecido suficiente para uma roupa', espacos: 0.5 },
    { nome: 'Caixa com velas aromáticas', espacos: 1 },
    { nome: 'Estandarte em algodão de um nobre menor', espacos: 1 },
    { nome: 'Kobold de pelúcia em tamanho natural', espacos: 1 },
    { nome: 'Roldana de ferro', espacos: 1 },
    { nome: 'Barrilete de óleo cru', espacos: 2 },
    { nome: 'Espantalho imitando um hynne nobre', espacos: 2 },
    { nome: 'Rolo de algodão tecido', espacos: 2 },
    { nome: 'Tela para pintura', espacos: 2 },
    { nome: 'Barril de farinha ou gaiola com galinhas', espacos: 5 }
  ],
  2: [
    { nome: 'Colar de presas de bulette', espacos: 0.5 },
    { nome: 'Livreto de poesia bucaneira', espacos: 0.5 },
    { nome: 'Quartzo rosa', espacos: 0.5 },
    { nome: 'Topázio', espacos: 0.5 },
    { nome: 'Ânfora de prata com símbolo de Marah (vale o dobro em um templo da deusa)', espacos: 1 },
    { nome: 'Caixa de tabaco', espacos: 1 },
    { nome: 'Rolo de linho', espacos: 1 },
    { nome: 'Urna de sais aromáticos (pode ser usada como ingrediente para preparados)', espacos: 1 },
    { nome: 'Saco com penas de hipossauro', espacos: 1 },
    { nome: 'Conjunto de talheres de prata', espacos: 2 },
    { nome: 'Jarro de especiarias, como canela, gorad, pimenta ou sal', espacos: 2 },
    { nome: 'Candelabro de bronze', espacos: 5 },
    { nome: 'Colchão de palha de boa qualidade', espacos: 5 },
    { nome: 'Vaca leiteira (irá acompanhá-lo se você for treinado em Adestramento)', espacos: null }
  ],
  3: [
    { nome: 'Ampulheta', espacos: 0.5 },
    { nome: 'Arreios de prata', espacos: 0.5 },
    { nome: 'Barra de gorad', espacos: 0.5 },
    { nome: 'Bracelete de ouro finamente trabalhado', espacos: 0.5 },
    { nome: 'Cadeado de latão de boa qualidade', espacos: 0.5 },
    { nome: 'Leque de bambu e seda', espacos: 0.5 },
    { nome: 'Garrafa com água das profundezas do Mar Negro (supostamente possui propriedades mágicas)', espacos: 0.5 },
    { nome: 'Bengala de ébano com uma cabeça de serpente de marfim', espacos: 1 },
    { nome: 'Estatueta de osso entalhado', espacos: 1 },
    { nome: 'Frutas exóticas (estragam em 2d4 dias)', espacos: 1 },
    { nome: 'Lamparina de ouro (vale o dobro para um devoto de Azgher)', espacos: 1 },
    { nome: 'Livro de crônicas roramarianas', espacos: 1 },
    { nome: 'Livro de receitas campeiras de Namalkah', espacos: 1 },
    { nome: 'Molde para fabricar velas', espacos: 1 },
    { nome: 'Rolo de seda', espacos: 1 },
    { nome: 'Brazeiro de latão decorado', espacos: 2 },
    { nome: 'Cobertor para montaria', espacos: 2 },
    { nome: 'Couro curtido de um burafonte', espacos: 2 },
    { nome: 'Vaso de prata', espacos: 2 }
  ],
  4: [
    { nome: 'Ametista', espacos: 0.5 },
    { nome: 'Cartas de um nobre falecido (seus descendentes podem pagar o dobro)', espacos: 0.5 },
    { nome: 'Frasco de tinta allavir', espacos: 0.5 },
    { nome: 'Pente de madeira Tollon', espacos: 0.5 },
    { nome: 'Pérola branca', espacos: 0.5 },
    { nome: 'Suspensórios elegantes', espacos: 0.5 },
    { nome: 'Caixa com 5 pares de meias de seda', espacos: 1 },
    { nome: 'Cálice de prata com gemas de lápis-lazúli', espacos: 1 },
    { nome: 'Estojo com sinete e apetrechos burocráticos (vale o dobro para o proprietário original)', espacos: 1 },
    { nome: 'Lingote de prata', espacos: 1 },
    { nome: 'Sapatilha élfica confortável', espacos: 1 },
    { nome: 'Tiara sinuosa própria para uma medusa', espacos: 1 },
    { nome: 'Traje de festa exclusivo (concede +2 em Diplomacia durante a primeira cena em que for usado)', espacos: 1 },
    { nome: 'Alvo para disparos sofisticado (treinar nele fornece +1 em Pontaria até o fim da aventura, mas o destrói)', espacos: 2 },
    { nome: 'Bloco de gelo das Uivantes (derrete em 1d6+3 dias)', espacos: 2 },
    { nome: 'Estatueta de uma cocatriz com olhos de madrepérola', espacos: 2 },
    { nome: 'Tapeçaria grande e bem-feita de lã', espacos: 5 },
    { nome: 'Porta de madeira maciça finamente entalhada', espacos: 20 }
  ],
  5: [
    { nome: 'Alexandrita', espacos: 0.5 },
    { nome: 'Pérola negra', espacos: 0.5 },
    { nome: 'Peruca de crina de pégaso', espacos: 0.5 },
    { nome: 'Caleidoscópio de bronze com imagens doheritas', espacos: 1 },
    { nome: 'Espada cerimonial ornada com prata e gema negra no cabo', espacos: 1 },
    { nome: 'Toga tapistana com barra bordada em ouro', espacos: 1 },
    { nome: 'Pente de prata com pedras preciosas', espacos: 1 },
    { nome: 'Roda de queijo de seiva de galhada (rende 12 fatias; cada uma recupera 1d4+1 PV)', espacos: 1 },
    { nome: 'Sapatos de dança em couro de serpe', espacos: 1 },
    { nome: 'Relógio de parede kliren', espacos: 2 },
    { nome: 'Cadeira de madeira Tollon', espacos: 5 },
    { nome: 'Cavalo de balanço com crina de verdade', espacos: 5 },
    { nome: 'Conjunto de velas de um galeão', espacos: 10 },
    { nome: 'Carruagem (pode ser puxada por um animal de tração ou arrastada por um personagem como um item que ocupa 20 espaços)', espacos: null }
  ],
  6: [
    { nome: 'Baralho de Wyrt com tinta de ouro', espacos: 0.5 },
    { nome: 'Bracelete banhado em adamante', espacos: 0.5 },
    { nome: 'Condecoração militar da Guerra Artoniana', espacos: 0.5 },
    { nome: 'Escultura de vidro feito com areia de Halak-Tur', espacos: 1 },
    { nome: 'Estatueta de Valkaria em prata azulada', espacos: 1 },
    { nome: 'Pente em forma de dragão com olhos de gema vermelha', espacos: 1 },
    { nome: 'Máscara teatral de marfim com pedras preciosas', espacos: 1 },
    { nome: 'Réplica do machado Zakharin (portá-lo é crime no Reinado)', espacos: 1 },
    { nome: 'Vestido digno de uma princesa', espacos: 1 },
    { nome: 'Telescópio portátil', espacos: 2 },
    { nome: 'Barril de cerveja fina de Doherimm', espacos: 5 },
    { nome: 'Harpa de madeira exótica com ornamentos de zircão e marfim', espacos: 5 },
    { nome: 'Tronco de madeira Tollon', espacos: 10 }
  ],
  7: [
    { nome: 'Brinco com uma joia de aço-rubi', espacos: 0.5 },
    { nome: 'Opala negra', espacos: 0.5 },
    { nome: 'Tapa-olho com um olho falso de safira', espacos: 0.5 },
    { nome: 'Luva bordada e adornada com gemas', espacos: 1 },
    { nome: 'Pingente de opala vermelha com corrente de ouro', espacos: 1 },
    { nome: 'Gaiola de prata para falcoaria', espacos: 2 },
    { nome: 'Lingote de ouro', espacos: 2 },
    { nome: 'Pintura antiga', espacos: 2 },
    { nome: 'Barril de especiarias de Moreania', espacos: 5 },
    { nome: 'Carroça cheia de mercadorias comuns (pode ser puxada por um animal de tração ou arrastada por um personagem como um item que ocupa 20 espaços)', espacos: null }
  ],
  8: [
    { nome: 'Esmeralda verde', espacos: 0.5 },
    { nome: 'Pingente de safira', espacos: 0.5 },
    { nome: 'Caixinha de música de ouro', espacos: 1 },
    { nome: 'Ovo de grifo (com tempo e cuidado, pode ser transformado em um parceiro grifo iniciante)', espacos: 1 },
    { nome: 'Tornozeleira com gemas', espacos: 1 },
    { nome: 'Manto bordado em veludo e seda com inúmeras pedras preciosas', espacos: 2 },
    { nome: 'Berço de madeira Tollon com detalhes em ouro', espacos: 5 },
    { nome: 'Chafariz de mármore para fonte de jardim', espacos: 5 },
    { nome: 'Conjunto de taças de cristal em caixote', espacos: 5 },
    { nome: 'Coluna de mármore em estilo neogórdio', espacos: 20 }
  ],
  9: [
    { nome: 'Anel de prata e safira', espacos: 0.5 },
    { nome: 'Correntinha com pequenas pérolas rosas', espacos: 0.5 },
    { nome: 'Diamante branco', espacos: 0.5 },
    { nome: 'Pingente de ouro com um topázio em forma de Marah', espacos: 0.5 },
    { nome: 'Espelho feito na Pondsmânia (adiciona traços feéricos ao reflexo do usuário)', espacos: 1 },
    { nome: 'Miniatura mecânica de um dragão feita por um inventor renomado', espacos: 2 },
    { nome: 'Tábua de granito com reprodução da Tarvica em letras de ouro', espacos: 2 },
    { nome: 'Vestido digno de uma rainha', espacos: 2 },
    { nome: 'Ídolo de ouro puro maciço', espacos: 5 },
    { nome: 'Quadro élfico em estilo sobrenaturalista', espacos: 5 },
    { nome: 'Bloco de mármore bruto', espacos: 100 }
  ],
  10: [
    { nome: 'Anel de ouro e rubi', espacos: 0.5 },
    { nome: 'Diamante vermelho', espacos: 0.5 },
    { nome: 'Tiara de mitral cravejada de rubis', espacos: 1 },
    { nome: 'Conjunto de taças de ouro decoradas com esmeraldas', espacos: 2 },
    { nome: 'Busto de Tanna-Toh esculpido por um artista famoso', espacos: 5 },
    { nome: 'Globo de Arton com pedras preciosas marcando os pontos de interesse conhecidos', espacos: 5 },
    { nome: 'Quadro do arquimago Vectorius em tamanho natural', espacos: 10 },
    { nome: 'Piano em madeira Tollon com cordas de mitral e teclas de marfim de Galrasia', espacos: 20 },
    { nome: 'Estátua dourada de Klunk', espacos: 20 }
  ],
  11: [
    { nome: 'Coroa de ouro adornada com centenas de gemas que pertenceu a um antigo monarca', espacos: 1 },
    { nome: 'Baú de mitral com coleção de diamantes', espacos: 2 },
    { nome: 'Tapeçaria da Tormenta em estilo grigoriano (observá-la fornece 1 PM temporário para devotos de Aharadak uma vez por dia)', espacos: 2 },
    { nome: 'Estatueta de gelo eterno com uma essência elemental agitada em seu interior', espacos: 5 },
    { nome: 'Meteorito de adamante bruto', espacos: 20 },
    { nome: 'Sino de catedral de ouro maciço', espacos: 20 }
  ],
  12: [
    { nome: 'Elmo de matéria vermelha com detalhes em rubis e turmalinas', espacos: 1 },
    { nome: 'Altar religioso em granito e onix com inscrições em ouro', espacos: 10 },
    { nome: 'Sarcófago de ouro cravejado de gemas', espacos: 10 },
    { nome: 'Arca de madeira reforçada repleta de lingotes de prata e ouro e pedras preciosas de vários tipos', espacos: 20 },
    { nome: 'Carruagem de luxo em madeira Tollon banhada a ouro com detalhes em metais finos e pedras preciosas (pode ser puxada por um animal de tração ou arrastada por um personagem como um item que ocupa 20 espaços)', espacos: null }
  ],
  13: [
    { nome: 'Estátua titanoteica em aventurina de uma divindade do Panteão', espacos: 20 },
    { nome: 'Uma sala forrada de moedas (mover todo esse dinheiro exige trabalhadores e carroças, ou outra ideia por parte dos jogadores, além de atrair a atenção de bandidos, coletores de impostos e aproveitadores de vários tipos)', espacos: null }
  ]
};

/** "Espaços das Riquezas" (1d20) — usado quando o exemplo sorteado tem `espacos: null`. */
export const ESPACOS_RIQUEZA = [
  { min: 1, max: 4, espacos: 0.5, desc: 'Um item muito pequeno ou leve, como um anel, um par de brincos ou uma gema.' },
  { min: 5, max: 8, espacos: 1, desc: 'Um item comum, como um cálice, uma estatueta ou um par de braceletes.' },
  { min: 9, max: 12, espacos: 2, desc: 'Um item volumoso ou pesado, como uma arma de duas mãos ou um baú.' },
  { min: 13, max: 15, espacos: 5, desc: 'Um item muito volumoso ou pesado, como uma armadura completa ou um barril.' },
  { min: 16, max: 17, espacos: 10, desc: 'Um item extremamente volumoso ou pesado, como um quadro que ocupa uma parede inteira ou um busto de pedra.' },
  { min: 18, max: 19, espacos: 20, desc: 'Um item mais volumoso ou pesado que uma pessoa, como uma arca repleta de moedas ou uma estátua de pedra.' },
  { min: 20, max: 20, espacos: 100, desc: 'Algo tão volumoso ou pesado que só pode ser carregado por várias pessoas e/ou veículos, como uma coleção de estátuas em tamanho real.' }
];

/** Encontra a faixa de valor (Menor/Média/Maior) pela rolagem de d%. */
export function faixaValorPor(categoria, rolagem) {
  return FAIXAS_VALOR_RIQUEZA.find(f => {
    const faixa = f[categoria];
    return faixa && rolagem >= faixa[0] && rolagem <= faixa[1];
  }) ?? null;
}
