/**
 * Ofícios personalizados (ferreiro, escriba...) no assistente e no
 * planejador de níveis. Enquanto é escolha, o ofício novo é guardado como
 * `novo-oficio:Nome` nas mesmas listas das outras perícias; ao aplicar, vira
 * uma perícia `ofiN` na ficha, igual à que o botão "+" do sistema cria.
 *
 * As funções puras recebem rótulos e chaves por parâmetro (testáveis sem o
 * Foundry); só `oficiosDaFicha` e `updOficiosNovos` olham o ator.
 */
import { normalizar } from './regras.mjs';

export const PREFIXO_OFICIO = 'novo-oficio:';
const CHAVE_FICHA = /^ofi[1-9]$/;

export const ehOficioNovo = (k) => typeof k === 'string' && k.startsWith(PREFIXO_OFICIO);
export const nomeOficioNovo = (k) => k.slice(PREFIXO_OFICIO.length);

/** "Ofício: Ferreiro" → "Ferreiro". */
export const semPrefixoOficio = (rotulo) => String(rotulo ?? '').replace(/^\s*of[ií]cio\s*[:(]?\s*/i, '').replace(/\)\s*$/, '').trim();

/**
 * O que o jogador digitou vira uma chave: a de um ofício do sistema ou de um
 * já criado na ficha, se o nome bate; senão, uma chave de ofício novo.
 * `conhecidos` é [[chave, rótulo]]. Texto vazio devolve null.
 */
export function chaveDoOficio(texto, conhecidos = []) {
  const nome = semPrefixoOficio(String(texto ?? '').replace(/\s+/g, ' '));
  if (!nome) return null;
  const alvo = normalizar(nome);
  const achado = conhecidos.find(([, r]) => normalizar(semPrefixoOficio(r)) === alvo);
  if (achado) return achado[0];
  return PREFIXO_OFICIO + nome.charAt(0).toUpperCase() + nome.slice(1);
}

/** Ofícios personalizados que a ficha já tem: [[chave, rótulo completo]]. */
export function oficiosDaFicha(actor) {
  return Object.entries(actor?.system?.pericias ?? {})
    .filter(([k, p]) => CHAVE_FICHA.test(k) && p?.label)
    .map(([k, p]) => [k, p.label]);
}

/** Rótulo de qualquer chave: do sistema, da ficha ou de ofício novo. */
export function rotuloPericia(k, rotulos, actor = null) {
  if (ehOficioNovo(k)) return `Ofício: ${nomeOficioNovo(k)}`;
  return rotulos[k] ?? actor?.system?.pericias?.[k]?.label ?? null;
}

/**
 * Update que cria na ficha os ofícios novos de `chaves` (as outras são
 * ignoradas). Nome que a ficha já tem só fica treinado. A ficha comporta
 * nove (ofi1 a ofi9, o limite do sistema); os que não couberem voltam em
 * `semVaga`.
 */
export function updOficiosNovos(actor, chaves) {
  const upd = {};
  const semVaga = [];
  const usadas = new Set(Object.keys(actor.system.pericias ?? {}).filter(k => CHAVE_FICHA.test(k)));
  const daFicha = oficiosDaFicha(actor);
  const Base = globalThis.tormenta20?.data?.fields?.SkillData;
  const base = Base ? new Base().toObject() : {};
  const prefixo = game.i18n.localize('T20.SkillOfic');
  for (const k of chaves) {
    if (!ehOficioNovo(k)) continue;
    const nome = nomeOficioNovo(k);
    const existente = chaveDoOficio(nome, daFicha);
    if (!ehOficioNovo(existente)) { upd[`system.pericias.${existente}.treinado`] = true; continue; }
    const n = [1, 2, 3, 4, 5, 6, 7, 8, 9].find(i => !usadas.has(`ofi${i}`));
    if (!n) { semVaga.push(nome); continue; }
    usadas.add(`ofi${n}`);
    upd[`system.pericias.ofi${n}`] = { ...base, label: `${prefixo}: ${nome}`, custom: true, atributo: 'int', st: true, treinado: 1 };
  }
  return { upd, semVaga };
}
