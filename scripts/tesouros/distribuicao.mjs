/**
 * t20-hayd-tesouros | distribuicao.mjs
 * Materializa a árvore de resultado do motor em Items reais do Foundry,
 * concede dinheiro/itens a um ator e posta o resumo no chat.
 */
import { MOEDAS, rotuloMoeda } from './constantes.mjs';
import { ICONE_TESOURO_PADRAO } from './dados-icones.mjs';
import { aplicarEntradasNoItem, itensSuperioresAtivo } from './integracao-itens.mjs';

/* ─── Achatamento da árvore de resultado ───────────────────────────────── */

function achatarResultado(resultado, out) {
  if (!resultado) return;
  switch (resultado.tipo) {
    case 'dinheiro':
    case 'item':
    case 'itemSuperior':
    case 'itemMagico':
      out.push(resultado);
      break;
    case 'grupo':
      for (const item of resultado.itens) out.push(item);
      break;
    default:
      break;
  }
}

export function achatarColuna(coluna) {
  const nodes = [];
  for (const entrada of coluna ?? []) achatarResultado(entrada.resultado, nodes);
  return nodes;
}

export function totalDinheiro(tesouro) {
  const nodes = achatarColuna(tesouro.dinheiro).filter(n => n.tipo === 'dinheiro');
  const total = Object.fromEntries(MOEDAS.map(m => [m, 0]));
  for (const n of nodes) total[n.moeda] = (total[n.moeda] ?? 0) + n.valor;
  return total;
}

/** Todos os nós "materializáveis" (não-dinheiro) das duas colunas. */
export function itensGerados(tesouro) {
  return [...achatarColuna(tesouro.dinheiro), ...achatarColuna(tesouro.itens)].filter(n => n.tipo !== 'dinheiro');
}

/* ─── Materialização em Item do Foundry ────────────────────────────────── */

function descricaoFonte(livro, pagina) {
  return livro ? `<p><em>Fonte: ${livro}${pagina ? ` p.${pagina}` : ''}</em></p>` : '';
}

function listaEntradas(titulo, entradas) {
  if (!entradas?.length) return '';
  const linhas = entradas
    .map(e => `<li>${e.nome}${e.materialEspecial && e.material ? ` — material: ${e.material.nome}` : ''}</li>`)
    .join('');
  return `<p><strong>${titulo}:</strong></p><ul>${linhas}</ul>`;
}

/** Dados de Item a partir de um nó "item" terminal (usa o vínculo já resolvido pelo motor). */
async function dadosBaseDoNode(node) {
  if (node.vinculo?.item) {
    const dados = node.vinculo.item.toObject();
    delete dados._id;
    delete dados.folder;
    delete dados.sort;
    dados.system ??= {};
    if (dados.system.qtd !== undefined) dados.system.qtd = 1;
    return dados;
  }
  return {
    name: node.nome,
    type: 'tesouro',
    img: node.vinculo?.img ?? ICONE_TESOURO_PADRAO,
    system: {
      description: { value: descricaoFonte(node.livro, node.pagina) },
      preco: node.preco ?? 0,
      peso: node.espacos ?? 0,
      qtd: 1
    }
  };
}

/**
 * Dados de Item prontos para `createEmbeddedDocuments`/`Item.create`, a
 * partir de qualquer nó terminal (item simples, superior ou mágico). Para
 * "Superior"/"Mágico", melhorias/encantos entram na descrição — se
 * t20-hayd-itens estiver ativo, `finalizarPosCriacao` os aplica de verdade
 * depois (precisa do Document real, criado só depois destes dados).
 */
export async function materializarItem(node) {
  if (node.tipo === 'itemSuperior' || node.tipo === 'itemMagico') {
    const base = await dadosBaseDoNode(node.item);
    const lista = node.tipo === 'itemSuperior' ? node.melhorias : node.encantos;
    const rotulo = node.tipo === 'itemSuperior' ? 'Melhorias' : 'Encantos';
    const naoAutomatizadas = itensSuperioresAtivo() ? [] : lista;

    base.name = `${base.name} (${node.tipo === 'itemSuperior' ? 'Superior' : 'Mágico'})`;
    base.system ??= {};
    base.system.description ??= {};
    base.system.description.value = (base.system.description.value ?? '') + listaEntradas(rotulo, naoAutomatizadas);
    foundry.utils.setProperty(base, 'flags.t20-hayd-gmtools.tesouroGerado', {
      tipo: node.tipo, categoria: node.item.categoria, nivel: node.nivel ?? null,
      melhorias: node.melhorias ?? [], encantos: node.encantos ?? [],
      // Com o t20-hayd-itens ativo a lista NÃO entra na descrição, porque será
      // aplicada de verdade depois. `pendente` marca que isso ainda não
      // aconteceu — é o que permite aplicar quando o item vira um Document,
      // inclusive saindo do estoque do grupo (que guarda só dado cru).
      pendente: itensSuperioresAtivo()
    });
    return base;
  }
  return dadosBaseDoNode(node);
}

/**
 * Aplica de verdade as melhorias/encantos NO ITEM JÁ CRIADO, a partir da flag
 * gravada por `materializarItem`.
 *
 * Trabalha pela FLAG, e não pelo nó da rolagem, porque o item pode chegar aqui
 * muito depois — uma entrada de estoque do grupo é dado cru numa flag da
 * pasta, sem Document para atualizar na hora. A flag viaja com o item e a
 * aplicação acontece quando ele finalmente vira um Item de verdade na ficha.
 *
 * Idempotente: baixa a marca `pendente` ANTES de aplicar, então a chamada
 * direta e o hook de criação nunca duplicam os efeitos.
 */
export async function aplicarBuildPendente(itemDocumento) {
  const flag = itemDocumento?.getFlag?.('t20-hayd-gmtools', 'tesouroGerado');
  if (!flag?.pendente) return;
  await itemDocumento.setFlag('t20-hayd-gmtools', 'tesouroGerado', { ...flag, pendente: false });

  const melhorias = flag.tipo === 'itemSuperior' ? (flag.melhorias ?? []) : [];
  const encantos = flag.tipo === 'itemMagico' ? (flag.encantos ?? []) : [];
  if (!melhorias.length && !encantos.length) return;

  const { naoAplicadas } = await aplicarEntradasNoItem(itemDocumento, {
    melhorias, encantos, categoria: flag.categoria
  });
  if (naoAplicadas.length) {
    const rotulo = flag.tipo === 'itemSuperior' ? 'Melhorias (aplicar manualmente)' : 'Encantos (aplicar manualmente)';
    const atual = itemDocumento.system?.description?.value ?? '';
    await itemDocumento.update({ 'system.description.value': atual + listaEntradas(rotulo, naoAplicadas) });
  }
}

/** Compatibilidade: os caminhos diretos continuam chamando isto após criar o Item. */
export async function finalizarPosCriacao(itemDocumento) {
  return aplicarBuildPendente(itemDocumento);
}

/* ─── Conceder a um ator ────────────────────────────────────────────────── */

/** Concede dinheiro + itens de um tesouro já resolvido a um ator. */
export async function concederTesouro(tesouro, actor) {
  if (!actor) throw new Error('t20-hayd-tesouros | Ator inválido para conceder tesouro');

  const totais = totalDinheiro(tesouro);
  const atualizacoes = {};
  for (const m of MOEDAS) {
    if (totais[m]) atualizacoes[`system.dinheiro.${m}`] = (Number(actor.system?.dinheiro?.[m]) || 0) + totais[m];
  }
  if (!foundry.utils.isEmpty(atualizacoes)) await actor.update(atualizacoes);

  const criados = [];
  for (const node of itensGerados(tesouro)) {
    const dados = await materializarItem(node);
    const [doc] = await actor.createEmbeddedDocuments('Item', [dados]);
    if (doc) {
      await finalizarPosCriacao(doc);
      criados.push(doc);
    }
  }
  return { moedas: totais, itens: criados };
}

/* ─── Card de chat ─────────────────────────────────────────────────────── */

/**
 * Descrição textual de um resultado ainda não achatado (dinheiro/grupo
 * incluídos) — usada pelo card de trilha em chat.mjs, que mostra o
 * resultado de UMA entrada de coluna antes de ela virar itens separados.
 */
export function descreverResultado(resultado) {
  if (!resultado) return 'Nada';
  switch (resultado.tipo) {
    case 'dinheiro': return `${resultado.valor} ${rotuloMoeda(resultado.moeda)}`;
    case 'grupo': return resultado.itens.length ? resultado.itens.map(it => it.nome).join(', ') : 'Nada';
    case 'itemSuperior': return `${resultado.item.nome} (Superior: ${resultado.melhorias.map(m => m.nome).join(', ') || '—'})`;
    case 'itemMagico': return `${resultado.item.nome} (Mágico: ${resultado.encantos.map(e => e.nome).join(', ') || '—'})`;
    case 'item': return resultado.nome;
    default: return 'Resultado';
  }
}

function nomeENodeVisual(node) {
  if (node.tipo === 'itemSuperior') return { nome: `${node.item.nome} (Superior)`, img: node.item.vinculo?.img };
  if (node.tipo === 'itemMagico') return { nome: `${node.item.nome} (Mágico)`, img: node.item.vinculo?.img };
  return { nome: node.nome, img: node.vinculo?.img };
}

/** Posta um resumo do tesouro no chat (ícones + nomes + dinheiro), independente de conceder a alguém. */
export async function postarCardTesouro(tesouro, { titulo = 'Tesouro Gerado', destinatario = null } = {}) {
  const totais = totalDinheiro(tesouro);
  const linhaMoedas = MOEDAS.filter(m => totais[m] > 0).map(m => `${totais[m]} ${m.toUpperCase()}`).join(', ');
  const linhasItens = itensGerados(tesouro).map(node => {
    const { nome, img } = nomeENodeVisual(node);
    return `<li><img src="${img ?? ICONE_TESOURO_PADRAO}" width="24" height="24" style="vertical-align:middle;border:none;margin-right:4px;"/>${nome}</li>`;
  }).join('');

  const content = `
    <div class="t20g-tesouro-chat">
      <h3>${titulo}${destinatario ? ` — ${destinatario}` : ''}</h3>
      ${linhaMoedas ? `<p><strong>Dinheiro:</strong> ${linhaMoedas}</p>` : ''}
      ${linhasItens ? `<ul class="t20g-tesouro-chat-itens">${linhasItens}</ul>` : ''}
      ${!linhaMoedas && !linhasItens ? '<p><em>Nenhum tesouro.</em></p>' : ''}
    </div>`;

  return ChatMessage.create({ content, speaker: { alias: 'Gerador de Tesouros' } });
}
