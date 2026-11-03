/**
 * Modelo de Aura — testes de resistência dos alvos.
 *
 * Só o Mestre rola: o teste sai pelo `rollPericia` do próprio sistema (com
 * os bônus da ficha do alvo), sem janela, e o veredito é anotado no cartão.
 * O resultado fica no estado da aura, na ficha da fonte, e é ele que decide
 * se o efeito entra no alvo.
 */
import { MODULE_ID } from '../runtime.mjs';
import { opcoesDeRoll } from '../../versao.mjs';
import { TESTES, situacaoDoAlvo } from './modelo.mjs';
import { gravarResistencias } from './estado.mjs';

/**
 * Rola o teste de um alvo.
 * @returns {boolean|null} passou? null se a rolagem não saiu
 */
export async function rolarTeste(token, res, item) {
  const ator = token.actor;
  let mensagem;
  try {
    mensagem = await ator.rollPericia(res.teste, opcoesDeRoll({ janela: false }));
  } catch (err) {
    console.error(`${MODULE_ID} | Falha ao rolar a resistência de ${ator?.name} contra ${item.name}`, err);
    return null;
  }
  const total = Number(mensagem?.rolls?.[0]?.total);
  if (!Number.isFinite(total)) return null;
  const passou = total >= res.cd;

  // Veredito no cartão, só para o Mestre — igual ao teste de resistência
  // dos cartões de magia.
  try {
    const teste = TESTES.find((x) => x.id === res.teste)?.rotulo ?? res.teste;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = mensagem.content;
    const alvo = wrapper.querySelector('.tormenta20.chat-card') ?? wrapper;
    alvo.insertAdjacentHTML('beforeend', `
      <p class="t20g-resist-veredito" data-gm-only="1">
        <i class="fa-solid ${passou ? 'fa-shield-halved' : 'fa-skull'}"></i>
        <b>${game.i18n.localize(passou ? 'T20HaydGMTools.ResistSucesso' : 'T20HaydGMTools.ResistFracasso')}</b>
        — ${foundry.utils.escapeHTML(item.name)}: ${teste} CD ${res.cd}
      </p>`);
    await mensagem.update({ content: wrapper.innerHTML });
  } catch (err) {
    console.error(`${MODULE_ID} | Falha ao anotar a resistência contra ${item.name}`, err);
  }
  return passou;
}

/**
 * Rola para cada par (token, parte) e grava tudo de uma vez.
 * Devolve os registros novos, para quem chamou não precisar reler a flag.
 */
export async function testar(fonte, item, pares) {
  const mudancas = [];
  for (const { token, parte } of pares) {
    const passou = await rolarTeste(token, parte.resistencia, item);
    if (passou === null) continue;
    mudancas.push({ parte: parte.parte, token: token.id, passou });
  }
  await gravarResistencias(fonte, item.id, mudancas);
  return mudancas;
}

/** Registro do último teste daquele token contra aquela parte. */
export function registroDe(estado, parte, tokenId) {
  return estado?.resistencias?.[parte]?.[tokenId] ?? null;
}

export { situacaoDoAlvo, gravarResistencias };
