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
