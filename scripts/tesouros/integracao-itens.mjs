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
import { ehV14 } from '../versao.mjs';

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

/**
 * v14 (Tormenta20 1.6.5): melhorias, encantos e materiais viraram efeitos do
 * compêndio do mundo "Melhorias e Encantos", listados em
 * `CONFIG.upgradeEffects`. Basta pôr o uuid em `system.upgrades.<tipo>` e o
 * próprio sistema cria o efeito no item. No v13 isso não existe.
 */
export function upgradesNativosDisponiveis() {
  return ehV14() && Array.isArray(CONFIG.upgradeEffects) && CONFIG.upgradeEffects.length > 0;
}

/** Há como aplicar melhorias/encantos de verdade (módulo ou sistema)? */
export function aplicacaoAutomaticaDisponivel() {
  return itensSuperioresAtivo() || upgradesNativosDisponiveis();
}

/** Tipos de item do sistema (`upgrade.itemType`) aceitos em cada categoria do tesouro. */
const TIPOS_NATIVOS = {
  arma: ['weapon'],
  'armadura-escudo': ['armor', 'shield'],
  esoterico: ['esoteric']
};

/** Entrada nativa (de `CONFIG.upgradeEffects`) com este nome, tipo e categoria. */
function upgradeNativo(nome, tipo, categoria) {
  const alvo = slugify(nome);
  const aceitos = TIPOS_NATIVOS[categoria] ?? [];
  return (CONFIG.upgradeEffects ?? []).find((u) => u.type === tipo
    && slugify(u.name) === alvo
    && (!aceitos.length || [...(u.itemType ?? [])].some((t) => aceitos.includes(t)))) ?? null;
}

/**
 * v14: aplica pelo recurso nativo do sistema. Uma atualização só, com todas
 * as listas: o sistema cria e apaga os efeitos comparando cada lista enviada.
 */
async function aplicarNativo(item, { melhorias, encantos, categoria }) {
  const aplicadas = [];
  const naoAplicadas = [];
  const atuais = item.system?.upgrades;
  if (!atuais || !item.isOwner) return { aplicadas, naoAplicadas: [...melhorias, ...encantos] };

  const listas = {};
  const incluir = (tipo, uuid) => {
    listas[tipo] ??= new Set(atuais[tipo] ?? []);
    listas[tipo].add(uuid);
  };
  const tentar = (entrada, tipo) => {
    const ehMaterial = entrada.materialEspecial && entrada.material;
    const nativo = ehMaterial
      ? upgradeNativo(entrada.material.nome, 'material', categoria)
      : upgradeNativo(entrada.nome, tipo, categoria);
    if (!nativo) return naoAplicadas.push(entrada);
    incluir(ehMaterial ? 'material' : tipo, nativo.uuid);
    aplicadas.push({ ...entrada, uuidNativo: nativo.uuid });
  };
  for (const entrada of melhorias) tentar(entrada, 'improvement');
  for (const entrada of encantos) tentar(entrada, 'enchantment');

  if (Object.keys(listas).length) {
    const upd = Object.fromEntries(Object.entries(listas).map(([tipo, uuids]) => ['system.upgrades.' + tipo, [...uuids]]));
    await item.update(upd);
  }
  return { aplicadas, naoAplicadas };
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
  if (!entradas.length) return { aplicadas: [], naoAplicadas: entradas };
  if (!itensSuperioresAtivo()) {
    if (upgradesNativosDisponiveis()) return aplicarNativo(item, { melhorias, encantos, categoria });
    return { aplicadas: [], naoAplicadas: entradas };
  }

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
