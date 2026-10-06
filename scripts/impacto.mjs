/**
 * Quanto cada função do módulo custa ao mundo — sem Foundry, testável.
 *
 * - baixo: só trabalha quando você abre ou usa a função (janelas, geradores,
 *   opções de comportamento);
 * - médio: participa de toda mensagem do chat ou de toda ficha aberta;
 * - alto: acompanha o jogo o tempo todo (movimento de tokens, turnos, efeitos)
 *   ou refaz as contas a cada tecla digitada.
 */

/** Impacto das opções visíveis nas configurações. O que não está aqui é baixo. */
export const IMPACTO_CONFIG = {
  automacoesEnabled: 'alto',
  previewDano: 'alto',
  metagameMenu: 'medio',
  partySheetEnabled: 'medio'
};

/**
 * Opções que NÃO levam etiqueta de impacto.
 *
 * A etiqueta responde a uma pergunta só: "ligar isto custa o quê ao meu
 * mundo?". Ela só faz sentido onde há um recurso para ligar e desligar.
 *
 * Em duas situações ela vira ruído — e ruído numa tela de configurações é
 * pior do que informação faltando, porque ensina a ignorar a etiqueta
 * justamente onde ela importa (Automações e Prévia de dano):
 *
 * - BOTÃO DE JANELA: abrir o gerador de tesouros ou o editor de custos não
 *   deixa nada rodando; o custo é o da janela enquanto está aberta.
 * - PREFERÊNCIA DE UM RECURSO JÁ LIGADO: o método padrão da campanha, o
 *   total de pontos de compra, permitir atributos negativos, o modo de chat
 *   ou quem pode rerolar mudam o COMPORTAMENTO, não o custo. Etiquetar isso
 *   de "impacto baixo" sugere uma escolha de desempenho onde não há nenhuma.
 */
export const SEM_ETIQUETA_DE_IMPACTO = new Set([
  // Botões que apenas abrem uma janela.
  // `metagameMenu` fica FORA desta lista de propósito: é o único caminho
  // para ligar e desligar o metagame, então ali a etiqueta responde mesmo
  // à pergunta de custo.
  'partyManager',
  'tesourosGeradorMenu',
  'tesourosVinculosMenu',
  'tesourosLivrosMenu',
  'tesourosHomebrewMenu',
  'atributosCustosMenu',
  'atributosConversaoMenu',
  // Preferências de comportamento/conteúdo
  'atributosMetodoPadrao',
  'atributosPontos',
  'atributosMultiNegativos',
  'abrirDiarioAutomacoes',
  'visibility',
  'requireConfirmation',
  'chatMode',
  'lojaCompat',
  'jogadoresReroll',
  'jogadoresManual'
]);

/** A opção merece etiqueta de impacto? */
export function temEtiquetaDeImpacto(chave) {
  return !SEM_ETIQUETA_DE_IMPACTO.has(chave);
}

export const IMPACTO_PADRAO = 'baixo';
export const IMPACTO_CHAVES = { baixo: 'ImpactoBaixo', medio: 'ImpactoMedio', alto: 'ImpactoAlto' };

/**
 * As funções que ligam e desligam, na ordem em que aparecem para o Mestre.
 * `campo` é para a configuração que não é um booleano solto: o metagame mora
 * num objeto e só a chave `ativo` liga e desliga o conjunto.
 */
export const FUNCOES = [
  { chave: 'automacoesEnabled', nivel: 'alto' },
  { chave: 'previewDano', nivel: 'alto' },
  { chave: 'metagame', nivel: 'medio', campo: 'ativo', rotulo: 'MetaMenuNome' },
  { chave: 'partySheetEnabled', nivel: 'medio' },
  { chave: 'mensagensDano', nivel: 'baixo' },
  { chave: 'reguaEfeitos', nivel: 'baixo' },
  { chave: 'custoPmTotal', nivel: 'baixo' },
  { chave: 'jogadoresReroll', nivel: 'baixo' },
  { chave: 'jogadoresManual', nivel: 'baixo' }
];

const ORDEM = { baixo: 1, medio: 2, alto: 3 };

export function nivelDaConfiguracao(chave) {
  return IMPACTO_CONFIG[chave] ?? IMPACTO_PADRAO;
}

/**
 * O que fica ligado num preset: tudo até o teto escolhido, e nada acima dele.
 * Um teto desconhecido não liga nada — melhor não mexer do que adivinhar.
 */
export function ligadasNoPreset(teto, funcoes = FUNCOES) {
  const limite = ORDEM[teto] ?? 0;
  return funcoes.map((funcao) => ({
    ...funcao,
    ligada: (ORDEM[funcao.nivel] ?? 0) > 0 && (ORDEM[funcao.nivel] ?? 0) <= limite
  }));
}
