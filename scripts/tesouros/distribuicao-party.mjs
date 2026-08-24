/**
 * t20-hayd-tesouros | distribuicao-party.mjs
 * Distribuição "correta" de um tesouro entre a party: cada item pode ir pra
 * um membro específico, pro estoque da party, ou ficar de fora — e o
 * dinheiro pode ir todo pro estoque ou ser dividido entre os membros
 * marcados (sobra vai pro estoque). Só aparece quando o gerador foi aberto
 * a partir da Ficha do Grupo (sabemos a pasta da party).
 */
import { MOEDAS } from './constantes.mjs';
import { itensGerados, totalDinheiro, materializarItem, finalizarPosCriacao } from './distribuicao.mjs';
import { getPartyMembers, stashAddItem, stashAddMoney } from '../../t20-hayd-management.mjs';

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = s => foundry.utils.escapeHTML(String(s ?? ''));

function nomeDoNode(node) {
  if (node.tipo === 'itemSuperior') return `${node.item.nome} (Superior)`;
  if (node.tipo === 'itemMagico') return `${node.item.nome} (Mágico)`;
  return node.nome;
}
function imgDoNode(node) {
  return (node.tipo === 'itemSuperior' || node.tipo === 'itemMagico' ? node.item.vinculo?.img : node.vinculo?.img)
    ?? 'icons/svg/chest.svg';
}

/** Abre o diálogo de distribuição; devolve o "plano" escolhido ou `null` se cancelado. */
async function abrirDialogoDistribuicao(tesouro, folderId) {
  const folder = game.folders.get(folderId);
  const membros = getPartyMembers(folderId);
  const itens = itensGerados(tesouro).map(node => ({ id: node.id, nome: nomeDoNode(node), img: imgDoNode(node) }));
  const totais = totalDinheiro(tesouro);
  const temDinheiro = MOEDAS.some(m => totais[m] > 0);

  const opcoesDestino = membros.map(m => `<option value="actor:${m.id}">${esc(m.name)}</option>`).join('');
  const linhasItens = itens.map(it => `
    <div class="t20g-dist-linha">
      <img src="${it.img}" width="28" height="28" />
      <span class="t20g-dist-nome">${esc(it.nome)}</span>
      <select name="item-${it.id}">
        <option value="stash" selected>${esc(loc('T20HaydGMTools.TesourosEstoqueDaPartyCurto'))}</option>
        ${opcoesDestino}
        <option value="nenhum">${esc(loc('T20HaydGMTools.TesourosNaoDistribuir'))}</option>
      </select>
    </div>`).join('') || `<p class="t20g-hint">${loc('T20HaydGMTools.TesourosSemItensParaDistribuir')}</p>`;

  const linhaMoedas = MOEDAS.filter(m => totais[m] > 0).map(m => `${totais[m]} ${m.toUpperCase()}`).join(', ');
  const checksMembros = membros.map(m => `
    <label class="t20g-dist-check">
      <input type="checkbox" name="membro-${m.id}" checked />
      <img src="${esc(m.img)}" alt="" /> ${esc(m.name)}
    </label>`).join('');

  const content = `
    <div class="t20g-dist-dialogo">
      <p class="t20g-hint">${loc('T20HaydGMTools.TesourosDistribuirDica', { party: esc(folder?.name ?? '') })}</p>

      <fieldset class="t20g-dist-secao">
        <legend>${loc('T20HaydGMTools.TesourosColunaItens')}</legend>
        <div class="t20g-dist-itens">${linhasItens}</div>
      </fieldset>

      <fieldset class="t20g-dist-secao">
        <legend>${loc('T20HaydGMTools.TesourosColunaDinheiro')}</legend>
        ${temDinheiro ? `
          <p class="t20g-tesouro-total"><i class="fa-solid fa-coins"></i> ${linhaMoedas}</p>
          <div class="form-group">
            <label>${loc('T20HaydGMTools.TesourosModoDinheiro')}</label>
            <select name="modoDinheiro">
              <option value="estoque" selected>${loc('T20HaydGMTools.TesourosModoDinheiroEstoque')}</option>
              <option value="igual">${loc('T20HaydGMTools.TesourosModoDinheiroIgual')}</option>
              <option value="nenhum">${loc('T20HaydGMTools.TesourosModoDinheiroNenhum')}</option>
            </select>
          </div>
          <div class="t20g-dist-check-list">${checksMembros}</div>
          <p class="t20g-hint">${loc('T20HaydGMTools.TesourosModoDinheiroSobraDica')}</p>
        ` : `<p class="t20g-hint">${loc('T20HaydGMTools.TesourosSemTotal')}</p>`}
      </fieldset>
    </div>`;

  const resultado = await foundry.applications.api.DialogV2.wait({
    window: { title: loc('T20HaydGMTools.TesourosDistribuirParty'), icon: 'fa-solid fa-people-arrows' },
    position: { width: 480, height: 640 },
    content,
    rejectClose: false,
    buttons: [
      {
        action: 'distribuir', label: loc('T20HaydGMTools.TesourosDistribuirParty'), icon: 'fa-solid fa-people-arrows', default: true,
        callback: (ev, btn) => {
          const form = btn.form;
          const destinosItens = {};
          for (const it of itens) destinosItens[it.id] = form.elements[`item-${it.id}`]?.value ?? 'stash';
          const modoDinheiro = form.elements.modoDinheiro?.value ?? 'estoque';
          const membrosMarcados = membros.filter(m => form.elements[`membro-${m.id}`]?.checked).map(m => m.id);
          return { destinosItens, modoDinheiro, membrosMarcados };
        }
      },
      { action: 'cancelar', label: loc('T20HaydGMTools.TesourosCancelar'), callback: () => null }
    ]
  });

  return resultado ?? null;
}

/** Aplica o plano escolhido: cria cada item no destino certo e divide o dinheiro. */
async function executarDistribuicao(tesouro, folderId, plano) {
  const nodes = itensGerados(tesouro);
  const criadosPorDestino = { stash: 0 };

  for (const node of nodes) {
    const destino = plano.destinosItens[node.id] ?? 'stash';
    if (destino === 'nenhum') continue;

    const dados = await materializarItem(node);
    if (destino === 'stash') {
      const qtd = Number(dados.system?.qtd) || 1;
      await stashAddItem(folderId, dados, qtd);
      criadosPorDestino.stash++;
    } else if (destino.startsWith('actor:')) {
      const actor = game.actors.get(destino.slice('actor:'.length));
      if (!actor) continue;
      const [doc] = await actor.createEmbeddedDocuments('Item', [dados]);
      if (doc) await finalizarPosCriacao(doc, node);
      criadosPorDestino[destino] = (criadosPorDestino[destino] ?? 0) + 1;
    }
  }

  const totais = totalDinheiro(tesouro);
  if (plano.modoDinheiro === 'nenhum' || !MOEDAS.some(m => totais[m] > 0)) {
    return criadosPorDestino;
  }

  if (plano.modoDinheiro === 'estoque' || !plano.membrosMarcados.length) {
    await stashAddMoney(folderId, totais);
    return criadosPorDestino;
  }

  // "igual": divide entre os membros marcados, sobra vai pro estoque.
  const porMembro = {};
  const sobra = {};
  for (const m of MOEDAS) {
    porMembro[m] = Math.floor((totais[m] || 0) / plano.membrosMarcados.length);
    sobra[m] = (totais[m] || 0) - porMembro[m] * plano.membrosMarcados.length;
  }
  for (const actorId of plano.membrosMarcados) {
    const actor = game.actors.get(actorId);
    if (!actor) continue;
    const atualizacoes = {};
    for (const m of MOEDAS) {
      if (porMembro[m]) atualizacoes[`system.dinheiro.${m}`] = (Number(actor.system?.dinheiro?.[m]) || 0) + porMembro[m];
    }
    if (!foundry.utils.isEmpty(atualizacoes)) await actor.update(atualizacoes);
  }
  if (MOEDAS.some(m => sobra[m] > 0)) await stashAddMoney(folderId, sobra);

  return criadosPorDestino;
}

/** Ponto de entrada: abre o diálogo e, se confirmado, distribui. Devolve `true` se distribuiu. */
export async function distribuirTesouroNaParty(tesouro, folderId) {
  const plano = await abrirDialogoDistribuicao(tesouro, folderId);
  if (!plano) return false;
  await executarDistribuicao(tesouro, folderId, plano);
  return true;
}
