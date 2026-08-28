import { valorContador } from '../estado.mjs';

export const GP_CARREGADO = 'carregado';

/**
 * Escada de dano do Sequencial: os passos do sistema a partir de 1d6
 * (1d6 → 1d8 → 1d10 → 1d12 → 3d6 → 4d6 → 4d8 → 4d10 → 4d12).
 */
export const GP_SEQUENCIAL = ['1d6', '1d8', '1d10', '1d12', '3d6', '4d6', '4d8', '4d10', '4d12'];

/**
 * Dado do passo atual do Sequencial, saturando no último.
 *
 * Vive aqui, junto de GP_SEQUENCIAL, porque `changes` do efeito precisa dele:
 * deixar o cálculo no motor faria a sincronização do golpe quebrar em runtime.
 */
export function passoSequencial(item) {
  return GP_SEQUENCIAL[Math.min(valorContador(item), GP_SEQUENCIAL.length - 1)];
}

/** Tipos de dano do efeito Elemental (chaves de CONFIG.T20.damageTypes). */
export const GP_ELEMENTOS = ['acido', 'eletricidade', 'fogo', 'frio'];

/** Alcances que o efeito Distante alcança, na ordem dos passos. */
export const GP_ALCANCES = ['short', 'medium', 'long'];

/** Nome legível de um tipo de dano / de um alcance (as tabelas já vêm traduzidas). */
export const rotuloDano = (chave) => CONFIG.T20?.damageTypes?.[chave] ?? chave;
export const rotuloAlcance = (chave) => CONFIG.T20?.distanceUnits?.[chave] ?? chave;

/**
 * Catálogo dos efeitos que montam o golpe, NA ORDEM DO LIVRO.
 *
 * A ordem importa duas vezes: é a que o construtor e o diário mostram, e é a
 * que gera as mudanças do Efeito Ativo. O sistema aplica o "1d" do Brutal na
 * PRIMEIRA parte do dano vinda deste efeito — então Brutal precisa vir antes
 * de Elemental e Sequencial, senão o dado extra sairia do dano elemental em
 * vez do dado da arma.
 *
 * custo    → PM somados ao golpe (por unidade, quando há quantidade)
 * reducao  → PM descontados; várias reduções NÃO somam, vale só a maior
 * controle → 'check' | 'qtd' | 'passos' | 'elemental' | 'magia'
 * changes  → mudanças do Efeito Ativo (ausente = o efeito é só lembrete)
 */
export const GP_EFEITOS = [
  {
    id: 'amplo',
    nome: 'Amplo',
    custo: 3,
    grupo: 'basico',
    controle: 'check',
    texto: 'Seu ataque atinge todas as criaturas em alcance curto (incluindo aliados, mas não '
      + 'você mesmo). Faça um único teste de ataque e compare com a Defesa de cada criatura.',
    // Armas não têm campo de alvo/área na ficha do sistema, então não há o que
    // sobrescrever: o teste é um só e vale contra a Defesa de cada criatura.
    nota: 'Role o ataque uma vez e compare o mesmo total com a Defesa de cada criatura em '
      + 'alcance curto.'
  },
  {
    id: 'atordoante',
    nome: 'Atordoante',
    custo: 2,
    grupo: 'basico',
    controle: 'check',
    texto: 'Uma criatura que sofra dano do ataque fica atordoada por uma rodada (apenas uma vez '
      + 'por cena; Fortitude CD For anula).',
    nota: 'O cartão do ataque ganha um botão para aplicar <b>atordoado</b> nos tokens '
      + 'selecionados — use depois que o alvo falhar na Fortitude.',
    changes: () => [{ key: 'condicao', mode: 2, value: 'atordoado', priority: 20 }]
  },
  {
    id: 'brutal',
    nome: 'Brutal',
    custo: 1,
    grupo: 'basico',
    controle: 'check',
    texto: 'Fornece um dado extra de dano do mesmo tipo.',
    // "1d" é a forma que o sistema lê como "mais um dado igual ao da arma"
    changes: () => [{ key: 'dano', mode: 2, value: '1d', priority: 20 }]
  },
  {
    id: 'conjurador',
    nome: 'Conjurador',
    custo: 1,
    grupo: 'basico',
    controle: 'magia',
    texto: 'Escolha uma magia de 1º ou 2º círculos que tenha como alvo uma criatura ou que afete '
      + 'uma área. Se acertar seu golpe, você lança a magia como uma ação livre, tendo como alvo '
      + 'a criatura atingida ou como centro de sua área o ponto atingido pelo ataque '
      + '(atributo-chave é um mental a sua escolha). Considere que a mão da arma está livre para '
      + 'lançar esta magia.',
    nota: 'Arraste a magia para o quadro do construtor. Ao usar o golpe, a janela de uso dela '
      + 'abre <b>antes</b> do ataque: você aplica os aprimoramentos ali e a magia cobra os PM '
      + 'dela; o +1 PM do Conjurador fica no custo do golpe.'
  },
  {
    id: 'destruidor',
    nome: 'Destruidor',
    custo: 2,
    grupo: 'basico',
    controle: 'check',
    texto: 'Aumenta o multiplicador de crítico em +1.',
    changes: () => [{ key: 'criticoX', mode: 2, value: '1', priority: 20 }]
  },
  {
    id: 'distante',
    nome: 'Distante',
    custo: 1,
    grupo: 'basico',
    controle: 'alcance',
    texto: 'Aumenta o alcance em um passo (de corpo a corpo para curto, médio e longo). Outras '
      + 'características não mudam (um ataque corpo a corpo com alcance curto continua usando '
      + 'Luta e somando sua Força no dano).',
    nota: 'Escolha o alcance que a arma passa a ter, é o que o efeito aparece na rolagem.',
    changes: (cfg) => (cfg.distante.alcance
      ? [{ key: 'alcance', mode: 5, value: rotuloAlcance(cfg.distante.alcance), priority: 20 }]
      : [])
  },
  {
    id: 'elemental',
    nome: 'Elemental',
    custo: 2,
    grupo: 'basico',
    controle: 'elemental',
    texto: 'Causa +2d6 pontos de dano de ácido, eletricidade, fogo ou frio. Você pode escolher '
      + 'este efeito mais vezes para aumentar o dano em +2d6 (do mesmo tipo ou de outro), por '
      + '+2 PM a cada vez.',
    changes: (cfg) => GP_ELEMENTOS
      .filter((tipo) => cfg.elemental[tipo] > 0)
      .map((tipo) => ({
        key: 'dano',
        mode: 2,
        value: `${2 * cfg.elemental[tipo]}d6[${tipo}]`,
        priority: 20
      }))
  },
  {
    id: 'impactante',
    nome: 'Impactante',
    custo: 1,
    grupo: 'basico',
    controle: 'check',
    texto: 'Empurra o alvo 1,5m para cada 10 pontos de dano causado (arredondado para baixo). '
      + 'Por exemplo, 3m para 22 pontos de dano.',
    nota: 'O empurrão é medido no mapa depois do dano — o módulo não move o token.'
  },
  {
    id: 'letal',
    nome: 'Letal',
    custo: 2,
    grupo: 'basico',
    controle: 'qtd',
    max: 2,
    texto: 'Aumenta a margem de ameaça em +2. Você pode escolher este efeito duas vezes para '
      + 'aumentar a margem de ameaça em +5.',
    // Margem +2 é criticoM −2 na ficha; escolhido duas vezes vale +5 (não +4)
    changes: (cfg) => (cfg.sel.letal > 0
      ? [{ key: 'criticoM', mode: 2, value: cfg.sel.letal >= 2 ? '-5' : '-2', priority: 20 }]
      : [])
  },
  {
    id: 'penetrante',
    nome: 'Penetrante',
    custo: 1,
    grupo: 'basico',
    controle: 'check',
    texto: 'Ignora 10 pontos de RD.',
    changes: () => [{ key: 'ignoraRD', mode: 2, value: '10', priority: 20 }]
  },
  {
    id: 'preciso',
    nome: 'Preciso',
    custo: 1,
    grupo: 'basico',
    controle: 'check',
    texto: 'Quando faz o teste de ataque, você rola dois dados e usa o melhor resultado.',
    // mode 0 (custom) com "kh": o sistema troca 1d20 por 2d20kh no ataque
    changes: () => [{ key: 'ataque', mode: 0, value: 'kh', priority: 20 }]
  },
  {
    id: 'qualquer-arma',
    nome: 'Qualquer Arma',
    custo: 1,
    grupo: 'basico',
    controle: 'check',
    texto: 'Você pode usar seu Golpe Pessoal com qualquer tipo de arma.'
  },
  {
    id: 'ricocheteante',
    nome: 'Ricocheteante',
    custo: 1,
    grupo: 'basico',
    controle: 'check',
    texto: 'A arma volta pra você após o ataque. Só pode ser usado com armas de arremesso.'
  },
  {
    id: 'teleguiado',
    nome: 'Teleguiado',
    custo: 1,
    grupo: 'basico',
    controle: 'check',
    texto: 'Ignora penalidades por camuflagem ou cobertura leves.',
    nota: 'Ao rolar, deixe de somar a penalidade de camuflagem ou cobertura leve.'
  },
  {
    id: 'lento',
    nome: 'Lento',
    reducao: 2,
    grupo: 'basico',
    controle: 'check',
    texto: 'Seu ataque exige uma ação completa para ser usado.'
  },
  {
    id: 'perto-da-morte',
    nome: 'Perto da Morte',
    reducao: 2,
    grupo: 'basico',
    controle: 'check',
    texto: 'O ataque só pode ser usado se você estiver com um quarto de seus PV ou menos.'
  },
  {
    id: 'sacrificio',
    nome: 'Sacrifício',
    reducao: 2,
    grupo: 'basico',
    controle: 'check',
    texto: 'Sempre que usa seu Golpe Pessoal, você perde 10 PV.',
    nota: 'O cartão do golpe traz um botão para descontar os 10 PV.'
  },
  {
    id: 'avanco',
    nome: 'Avanço',
    custo: 1,
    grupo: 'novo',
    controle: 'check',
    texto: 'Você pode percorrer até o seu deslocamento em linha reta antes de desferir o golpe.'
  },
  {
    id: 'brando',
    nome: 'Brando',
    custo: 0,
    grupo: 'novo',
    controle: 'check',
    texto: 'Seu golpe causa dano não letal.',
    nota: 'O sistema não tem um tipo de dano "não letal" — aplique o dano como não letal na hora '
      + 'de descontar os PV.'
  },
  {
    id: 'carregado',
    nome: 'Carregado',
    custo: 1,
    grupo: 'novo',
    controle: 'check',
    texto: 'Você pode gastar uma ação padrão para energizar seu ataque. Se você fizer isso e '
      + 'atacar até a próxima rodada, seu ataque causa +2d8 pontos de dano.',
    nota: 'Cria um <b>segundo efeito de uso, sem custo de PM</b> ("Carregado"): marque-o na janela de '
      + 'rolagem só quando tiver mesmo gasto a ação padrão para energizar o golpe.'
  },
  {
    id: 'sequencial',
    nome: 'Sequencial',
    custo: 2,
    grupo: 'novo',
    controle: 'check',
    texto: 'Seu golpe causa +1d6 pontos de dano. A cada vez que você acerta o golpe na mesma '
      + 'cena, esse bônus aumenta em um passo.',
    nota: 'O contador fica no cartão do golpe e nos cartões de ataque: <b>+</b> a cada acerto, '
      + '<b>−</b> desfaz e <i class="fa-solid fa-rotate-left"></i> zera. Aumenta conforme os passos: 1d6 → 1d8 → 1d10 → 1d12 → 3d6 → 4d6 → 4d8 '
      + '→ 4d10 → 4d12 (máximo).',
    changes: (cfg, item) => [{
      key: 'dano',
      mode: 2,
      value: passoSequencial(item),
      priority: 20
    }]
  },
  {
    id: 'sifao',
    nome: 'Sifão',
    custo: 2,
    grupo: 'novo',
    controle: 'check',
    texto: 'Você recebe 1 PM temporário para cada 10 pontos da rolagem de dano. Você pode receber '
      + 'um máximo de PM temporários por cena igual ao seu nível e eles desaparecem no fim da cena.',
    nota: 'Some os PM temporários à mão; o teto por cena é o seu nível.'
  },
  {
    id: 'golpe-de-abertura',
    nome: 'Golpe de Abertura',
    reducao: 2,
    grupo: 'novo',
    controle: 'check',
    texto: 'Seu golpe só pode ser usado em seu primeiro turno do combate.'
  },
  {
    id: 'truque-secreto',
    nome: 'Truque Secreto',
    reducao: 2,
    grupo: 'novo',
    controle: 'check',
    texto: 'Seu golpe só pode ser usado uma vez contra cada alvo por cena.'
  }
];

/* --- Estado do golpe ----------------------------------------------------- */

/** Dado do Sequencial no passo atual do contador. */
