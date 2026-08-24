/**
 * t20-hayd-tesouros | chat.mjs
 * Posta no chat a trilha de rolagens que levou a um resultado (modo
 * automático — um card por entrada de coluna, com a cadeia inteira de
 * dados). No modo passo a passo, cada rolagem já vai pro chat na hora, via
 * `roll.toMessage()` — ver `#passoInterativo` em app-gerador.mjs.
 */
import { descreverResultado } from './distribuicao.mjs';

function linhaTrilha(passo) {
  const total = passo.ajustado != null ? `${passo.total} → <strong>${passo.ajustado}</strong> (+20%)` : `<strong>${passo.total}</strong>`;
  const sufixo = passo.manual ? ` <em>(${game.i18n.localize('T20HaydGMTools.TesourosManualCurto')})</em>` : '';
  return `<li>
    <span class="t20g-trilha-rotulo">${foundry.utils.escapeHTML(passo.rotulo)}</span>
    <span class="t20g-hint">(${foundry.utils.escapeHTML(passo.formula)})</span>:
    ${total}${sufixo}
  </li>`;
}

/**
 * Posta um card no chat mostrando, em ordem, cada dado rolado para chegar
 * ao resultado de uma entrada de coluna (`{ celula, resultado, trilha,
 * trilhaColuna }`, vindo de `motor.resolverColuna`/`rerolarResultado`) e o
 * resultado final. `trilhaColuna` (o d% que escolheu a célula do ND) vem
 * antes de `trilha` (tudo que aconteceu dentro dela) — um reroll troca só a
 * segunda parte, então a origem na Tabela 8-1 nunca se perde.
 */
export async function postarTrilhaNoChat(entrada, { titulo = null } = {}) {
  const passos = [...(entrada?.trilhaColuna ?? []), ...(entrada?.trilha ?? [])];
  if (!passos.length) return null;

  const cabecalho = titulo ?? passos[0]?.rotulo ?? game.i18n.localize('T20HaydGMTools.TesourosCardTitulo');
  const linhas = passos.map(linhaTrilha).join('');
  const descricao = descreverResultado(entrada.resultado);

  const content = `
    <div class="t20g-tesouro-chat t20g-tesouro-chat-trilha">
      <h3>${foundry.utils.escapeHTML(cabecalho)}</h3>
      <ol>${linhas}</ol>
      <p class="t20g-tesouro-chat-resultado"><strong>${game.i18n.localize('T20HaydGMTools.TesourosResultado')}:</strong> ${foundry.utils.escapeHTML(descricao)}</p>
    </div>`;

  return ChatMessage.create({ content, speaker: { alias: game.i18n.localize('T20HaydGMTools.TesourosGeradorTitulo') } });
}
