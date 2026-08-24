/**
 * t20-hayd-tesouros | integracao-itens.mjs
 * Ponte OPCIONAL com o módulo t20-hayd-itens: quando ele está ativo, as
 * melhorias/encantos/materiais rolados pelo motor são aplicados de verdade
 * no item criado (efeitos ativos, preço, etc.) em vez de ficarem só na
 * descrição. As chaves do catálogo de t20-hayd-itens são o nome oficial em
 * kebab-case sem acento, às vezes com sufixo de categoria quando o mesmo
 * nome existe para mais de uma categoria (ex.: "harmonizada" para armas vs.
 * "harmonizado-esoterico") — ver t20-hayd-itens/scripts/catalogo.mjs.
 */
import { slugify } from './utils.mjs';

const ID_ITENS = 't20-hayd-itens';

const SUFIXOS_POR_CATEGORIA = {
  arma: ['', '-arma'],
  'armadura-escudo': ['', '-armadura', '-escudo'],
  esoterico: ['', '-esoterico'],
  material: ['']
};

export function itensSuperioresAtivo() {
  return game.modules.get(ID_ITENS)?.active === true;
}

function apiItens() {
  return game.modules.get(ID_ITENS)?.api ?? null;
}

/** Tenta achar a chave do catálogo de t20-hayd-itens para uma melhoria/encanto/material do PDF. */
export function resolverChaveItens(nomeOuChave, categoria) {
  const api = apiItens();
  if (!api?.catalogo?.obterEntrada) return null;
  const base = slugify(nomeOuChave);
  const sufixos = SUFIXOS_POR_CATEGORIA[categoria] ?? [''];
  for (const sufixo of sufixos) {
    const tentativa = `${base}${sufixo}`;
    if (api.catalogo.obterEntrada(tentativa)) return tentativa;
  }
  return null;
}

/**
 * Aplica ao item (já criado, embarcado no mundo/ator) as melhorias/encantos
 * rolados (e o material especial embutido em cada um, se houver), usando a
 * API pública do t20-hayd-itens. Entradas sem correspondência conhecida no
 * catálogo daquele módulo voltam em `naoAplicadas` — quem chama (ver
 * distribuicao.mjs) escreve essas na descrição do item para o Mestre
 * aplicar manualmente. Sem o módulo ativo, tudo volta em `naoAplicadas`.
 */
export async function aplicarEntradasNoItem(item, { melhorias = [], encantos = [], categoria } = {}) {
  const entradas = [...melhorias, ...encantos];
  if (!itensSuperioresAtivo() || !entradas.length) return { aplicadas: [], naoAplicadas: entradas };

  const api = apiItens();
  const aplicadas = [];
  const naoAplicadas = [];

  for (const entrada of entradas) {
    if (entrada.materialEspecial && entrada.material) {
      const chaveMaterial = resolverChaveItens(entrada.material.chave ?? entrada.material.nome, 'material');
      if (!chaveMaterial) { naoAplicadas.push(entrada); continue; }
      try {
        await api.efeitos.adicionarMaterial(item, chaveMaterial);
        aplicadas.push({ ...entrada, chaveItens: chaveMaterial });
      } catch (err) {
        console.warn('t20-hayd-tesouros | Falha ao aplicar material via t20-hayd-itens', entrada, err);
        naoAplicadas.push(entrada);
      }
      continue;
    }

    const chave = resolverChaveItens(entrada.chave ?? entrada.nome, categoria);
    if (!chave) { naoAplicadas.push(entrada); continue; }
    try {
      await api.efeitos.adicionarEntrada(item, chave);
      aplicadas.push({ ...entrada, chaveItens: chave });
    } catch (err) {
      console.warn('t20-hayd-tesouros | Falha ao aplicar entrada via t20-hayd-itens', entrada, err);
      naoAplicadas.push(entrada);
    }
  }

  return { aplicadas, naoAplicadas };
}
