/**
 * t20-hayd-gmtools | encontros/tesouro-encontro.mjs
 * Tesouro gerado de antemão pela Calculadora de Encontros, no modo rápido
 * do gerador (sem pausas nem trilha no chat), pelos dois métodos do livro:
 * uma rolagem por criatura, ou uma só na linha do ND do encontro (AdA
 * p. 376). Cada rolagem é Padrão; a categoria das fichas (LB p. 327) o
 * Mestre aplica rolando de novo (Dobro/Triplo) ou cortando o dinheiro.
 *
 * O tesouro do encontro é um modelo "achatado": moedas somadas por tipo,
 * uma lista de itens (cada um, um item) e o histórico das rolagens com
 * cada dado — assim o Mestre edita unitariamente e acumula rolagens.
 */
import { gerarTesouro, alternarMetadeResultado } from '../tesouros/motor.mjs';
import { achatarColuna, materializarItem, finalizarPosCriacao, descreverResultado } from '../tesouros/distribuicao.mjs';
import { MOEDAS, rotuloMoeda } from '../tesouros/constantes.mjs';
import { ndRotulo, ndRecompensa } from './regras.mjs';
import { subpastaGMTools } from './pasta-gmtools.mjs';

export const CATEGORIAS = {
  nenhum: { rotulo: 'Nenhum', rolagens: 0 },
  metade: { rotulo: 'Metade', rolagens: 1, metade: true },
  padrao: { rotulo: 'Padrão', rolagens: 1 },
  dobro: { rotulo: 'Dobro', rolagens: 2 },
  triplo: { rotulo: 'Triplo', rolagens: 3 }
};

/** Lê a categoria do campo "Tesouro" da ficha ("Metade", "Dobro mais ...", "Nenhum"). */
export function categoriaDoTesouro(texto) {
  const t = String(texto ?? '').trim().toLocaleLowerCase('pt-BR');
  if (!t) return 'padrao';
  if (t.startsWith('nenhum')) return 'nenhum';
  if (t.startsWith('metade')) return 'metade';
  if (t.startsWith('dobro')) return 'dobro';
  if (t.startsWith('triplo')) return 'triplo';
  return 'padrao';
}

export function tesouroVazio() {
  return { moedas: Object.fromEntries(MOEDAS.map(m => [m, 0])), itens: [], rolagens: [] };
}

/** Chave da Tabela 8-1: S/S+ usam a linha do 20. */
function linhaTabela(nd) {
  return ndRotulo(Math.min(nd, 20));
}

const novoId = () => foundry.utils.randomID();

export function nomeDoNo(n) {
  if (n.tipo === 'itemSuperior') return `${n.item.nome} (Superior)`;
  if (n.tipo === 'itemMagico') return `${n.item.nome} (Mágico)`;
  return n.nome;
}

export function imgDoNo(n) {
  return (n.tipo === 'itemSuperior' || n.tipo === 'itemMagico' ? n.item.vinculo?.img : n.vinculo?.img) ?? 'icons/svg/chest.svg';
}

/** Soma uma entrada de coluna no tesouro achatado e registra a trilha dos dados. */
function absorver(t, entrada, coluna, rotulo) {
  for (const n of achatarColuna([entrada])) {
    if (n.tipo === 'dinheiro') t.moedas[n.moeda] = (t.moedas[n.moeda] ?? 0) + n.valor;
    else t.itens.push({ id: novoId(), nome: nomeDoNo(n), img: imgDoNo(n), node: n });
  }
  t.rolagens.push({
    id: novoId(), rotulo, coluna,
    passos: [...(entrada.trilhaColuna ?? []), ...(entrada.trilha ?? [])].map(p => ({
      rotulo: p.rotulo, formula: p.formula, total: p.total, ajustado: p.ajustado ?? null
    })),
    resultado: descreverResultado(entrada.resultado)
  });
}

async function rolar(t, nd, categoria, rotulo) {
  const cat = CATEGORIAS[categoria];
  if (!cat.rolagens) {
    t.rolagens.push({ id: novoId(), rotulo, coluna: '—', passos: [], resultado: 'Categoria Nenhum: sem rolagem' });
    return;
  }
  for (let i = 0; i < cat.rolagens; i++) {
    const r = await gerarTesouro(linhaTabela(nd));
    const sufixo = cat.rolagens > 1 ? ` (${i + 1}/${cat.rolagens})` : '';
    for (const e of r.dinheiro) {
      if (cat.metade) alternarMetadeResultado(e.resultado);
      absorver(t, e, `Dinheiro${cat.metade ? ' (metade)' : ''}`, rotulo + sufixo);
    }
    for (const e of r.itens) absorver(t, e, 'Itens', rotulo + sufixo);
  }
}

/**
 * Rola e SOMA ao tesouro `t` (não apaga o que já havia).
 * Cada chamada é uma rolagem Padrão: Dobro/Triplo o Mestre faz rolando de
 * novo, e Metade cortando o dinheiro na janela de edição.
 * @param {{modo:'encontro'|'criatura', ameacas:object[], ndEncontro:number}} p
 */
export async function rolarTesouroDoEncontro(t, { modo, ameacas, ndEncontro }) {
  if (modo === 'criatura') {
    for (const a of ameacas) {
      if (!(a.nd > 0) || a.recursoDe) continue;
      const categoria = 'padrao';
      const nd = ndRecompensa(a.nd, a.chefe);
      for (let i = 0; i < (a.qtd ?? 1); i++) {
        await rolar(t, nd, categoria, `${a.nome}${(a.qtd ?? 1) > 1 ? ` #${i + 1}` : ''} — ND ${linhaTabela(nd)}, ${CATEGORIAS[categoria].rotulo}`);
      }
    }
  } else {
        const categoria = 'padrao';
    await rolar(t, ndEncontro, categoria, `Encontro — ND ${linhaTabela(ndEncontro)}, ${CATEGORIAS[categoria].rotulo}`);
  }
  return t;
}

/** Item avulso (só nome) ou arrastado (documento) como nó materializável. */
export function itemManual({ nome, doc }) {
  const node = doc
    ? { tipo: 'item', nome: doc.name, vinculo: { status: 'vinculado', item: doc, img: doc.img } }
    : { tipo: 'item', nome, vinculo: null };
  return { id: novoId(), nome: node.nome, img: doc?.img ?? 'icons/svg/chest.svg', node, manual: true };
}

export function textoMoedas(moedas) {
  return MOEDAS.filter(m => moedas[m] > 0).map(m => `${moedas[m].toLocaleString('pt-BR')} ${rotuloMoeda(m)}`).join(', ');
}

/* ─── Entrega ─────────────────────────────────────────────────────────── */

/** Coloca itens e moedas no inventário de um ator do mundo. */
export async function entregarParaAtor(t, actor) {
  const atual = actor.system?.dinheiro ?? {};
  const upd = {};
  for (const m of MOEDAS) if (t.moedas[m]) upd[`system.dinheiro.${m}`] = (Number(atual[m]) || 0) + t.moedas[m];
  if (Object.keys(upd).length) await actor.update(upd);
  for (const it of t.itens) {
    const [doc] = await actor.createEmbeddedDocuments('Item', [await materializarItem(it.node)]);
    if (doc) await finalizarPosCriacao(doc);
  }
}

/**
 * Cria "Hayd GMTools" > "Tesouro do encontro: X" no diretório de itens com
 * os itens; os tibares viram um item cuja descrição diz a quantia.
 */
export async function entregarParaPasta(t, nome) {
  const pasta = await subpastaGMTools('Item', `Tesouro do encontro: ${nome}`);
  const dados = [];
  for (const it of t.itens) dados.push({ ...(await materializarItem(it.node)), folder: pasta.id });
  const txt = textoMoedas(t.moedas);
  if (txt) {
    dados.push({
      name: `Tibares: ${txt}`, type: 'tesouro', img: 'icons/svg/coins.svg', folder: pasta.id,
      system: {
        qtd: 1,
        description: { value: `<p><b>Dinheiro do tesouro do encontro:</b></p><ul>${
          MOEDAS.filter(m => t.moedas[m] > 0).map(m => `<li>${t.moedas[m].toLocaleString('pt-BR')} ${rotuloMoeda(m)}</li>`).join('')
        }</ul>` }
      }
    });
  }
  const criados = await Item.createDocuments(dados);
  for (const d of criados) await finalizarPosCriacao(d);
  return pasta;
}
