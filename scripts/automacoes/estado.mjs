import { AUTOMACOES } from './catalogo.mjs';
import { MODULE_ID } from './runtime.mjs';
import { FLAG_MODELO, specDoModelo } from './aura/modelo.mjs';

export function idAutomacao(item) {
  const id = item?.getFlag?.(MODULE_ID, 'automacao');
  return id && AUTOMACOES[id] ? id : null;
}

export function definicaoDe(item) {
  const id = idAutomacao(item);
  if (!id) return null;
  const def = { id, ...AUTOMACOES[id] };
  // Modelo de Aura: o bloco `aura` vem da configuração do próprio item.
  if (def.auraModelo) {
    def.aura = specDoModelo(item.getFlag(MODULE_ID, FLAG_MODELO), {
      lerDados: dadosDeRolagem, condicao: condicaoDoSistema
    });
  }
  return def;
}

/**
 * Dados que as fórmulas do Modelo de Aura enxergam: o `getRollData` do
 * sistema, com atributos e nível sempre como número (`@car`, `@nivel`).
 */
function dadosDeRolagem(ator) {
  if (!ator) return {};
  const dados = { ...(ator.getRollData?.() ?? {}) };
  const sistema = ator.system ?? {};
  for (const [chave, atributo] of Object.entries(sistema.atributos ?? {})) {
    if (Number.isFinite(Number(atributo?.value))) dados[chave] = Number(atributo.value);
  }
  const nivel = Number(sistema.attributes?.nivel?.value);
  if (Number.isFinite(nivel)) {
    dados.nivel = nivel;
    dados.meionivel ??= Math.floor(nivel / 2);
  }
  for (const recurso of ['pv', 'pm']) {
    const r = sistema.attributes?.[recurso];
    if (r) dados[recurso] = { value: Number(r.value) || 0, max: Number(r.max) || 0 };
  }
  dados.defesa = Number(sistema.attributes?.defesa?.value) || 0;
  return dados;
}

function condicaoDoSistema(id) {
  return (CONFIG.statusEffects ?? []).find((s) => s.id === id) ?? null;
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
