/**
 * Teste de Resistência automático.
 *
 * Não é uma automação por poder (não usa a flag `automacao`): qualquer magia
 * ou poder cujo `system.resistencia.txt` cite Reflexos, Fortitude ou Vontade
 * ganha, sozinho, um botão para rolar aquele teste nos alvos selecionados —
 * é inferido do próprio texto, igual ao Engenhoqueiro inferir pelo
 * `system.tipo === "eng"` em vez de precisar ser configurado.
 *
 * Funções puras: nada aqui toca em documentos do Foundry.
 */

/** Perícia do sistema e rótulo de cada teste reconhecido no texto livre. */
export const TESTES_RESISTENCIA = [
  { chave: 'refl', regex: /reflexos/i, rotulo: 'Reflexos' },
  { chave: 'fort', regex: /fortitude/i, rotulo: 'Fortitude' },
  { chave: 'vont', regex: /vontade/i, rotulo: 'Vontade' }
];

/**
 * Testes citados no texto livre da resistência, na ordem Reflexos/Fortitude/
 * Vontade.
 *
 * O texto pode trazer qualificadores junto ("Reflexos parcial", "Vontade
 * anula", "Fortitude (veja texto)") — a palavra-chave continua reconhecida
 * normalmente, o texto inteiro só é mostrado depois, ao lado do resultado.
 * Também pode citar mais de um teste ("Reflexos ou Fortitude"): cada um
 * encontrado vira um botão próprio, nenhum é descartado.
 */
export function testesCitados(txt) {
  const texto = String(txt ?? '');
  return TESTES_RESISTENCIA.filter(({ regex }) => regex.test(texto));
}

/** O total da rolagem bate a CD da habilidade? */
export function passouNoTeste(total, cd) {
  return (Number(total) || 0) >= (Number(cd) || 0);
}
