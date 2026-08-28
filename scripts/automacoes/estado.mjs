import { AUTOMACOES } from './catalogo.mjs';
import { MODULE_ID } from './runtime.mjs';

export function idAutomacao(item) {
  const id = item?.getFlag?.(MODULE_ID, 'automacao');
  return id && AUTOMACOES[id] ? id : null;
}

export function definicaoDe(item) {
  const id = idAutomacao(item);
  return id ? { id, ...AUTOMACOES[id] } : null;
}

export function valorContador(item) {
  return Math.max(0, Number(item?.getFlag?.(MODULE_ID, 'contador')) || 0);
}

export function automacoesPara(item) {
  return Object.entries(AUTOMACOES)
    .filter(([, def]) => def.tipos.includes(item.type))
    .map(([id, def]) => ({ id, ...def }));
}

export function rotuloTipo(item) {
  const chave = CONFIG.Item?.typeLabels?.[item.type];
  return chave ? game.i18n.localize(chave) : item.type;
}
