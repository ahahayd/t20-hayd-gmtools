/**
 * t20-hayd-tesouros | distribuicao-estoque.mjs
 * Concede um tesouro já resolvido ao ESTOQUE de uma party (Ficha do Grupo),
 * em vez de a um ator — mesma materialização de item de distribuicao.mjs,
 * destino diferente.
 */
import { MOEDAS } from './constantes.mjs';
import { totalDinheiro, itensGerados, materializarItem } from './distribuicao.mjs';
import { stashAddMoney, stashAddItem } from '../../t20-hayd-management.mjs';

/**
 * Concede dinheiro + itens de um tesouro já resolvido ao estoque de uma party.
 *
 * Limitação aceita: melhorias/encantos de item Superior/Mágico ficam só na
 * descrição (não são aplicados de verdade) — finalizarPosCriacao precisa de
 * um Item Document real para atualizar, e uma entrada de estoque é só dado
 * cru guardado numa flag da pasta. Mesma limitação que já existe quando a
 * integração com t20-hayd-itens está desligada; passa a valer de verdade
 * quando o item sai do estoque para a ficha de um personagem.
 */
export async function concederTesouroEstoque(tesouro, folderId) {
  const folder = game.folders.get(folderId);
  if (!folder) throw new Error('t20-hayd-tesouros | Pasta de party inválida para conceder tesouro');

  const totais = totalDinheiro(tesouro);
  if (MOEDAS.some(m => totais[m] > 0)) await stashAddMoney(folderId, totais);

  const criados = [];
  for (const node of itensGerados(tesouro)) {
    const dados = await materializarItem(node);
    const qtd = Number(dados.system?.qtd) || 1;
    await stashAddItem(folderId, dados, qtd);
    criados.push(dados);
  }
  return { moedas: totais, itens: criados };
}
