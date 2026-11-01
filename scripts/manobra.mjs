/**
 * Regras do marcador "Manobra" da janela de uso.
 *
 * Lógica pura, fora do arquivo que fala com o Foundry: mesmo padrão de
 * custo-pm.mjs.
 */

const MODULE_ID = 't20-hayd-gmtools';

export const FLAG_MANOBRA = 'manobra';

/** Id fixo do efeito de tamanho: o formulário da janela e a prévia casam por ele. */
export const ID_EFEITO_TAMANHO = 't20gManobraTaman';

export const FLAG_TAMANHO = 'manobraTamanho';
export const TAMANHOS = ['min', 'peq', 'med', 'gra', 'eno', 'col'];

/** Modificador de manobra por tamanho. */
const MODIFICADOR_POR_TAMANHO = { min: -5, peq: -2, gra: 2, eno: 5, col: 10 };

export function modificadorDeManobra(tamanho) {
  return MODIFICADOR_POR_TAMANHO[tamanho] ?? 0;
}

export function ehEfeitoDeManobra(efeito) {
  return !!efeito?.flags?.[MODULE_ID]?.[FLAG_MANOBRA];
}

/**
 * Dados do efeito de uso do tamanho, no formato do v13 (ver `paraOSistema`).
 * Sem `disabled`: quando a Manobra é marcada, o tamanho já vem aplicado.
 *
 */
export function dadosDoEfeitoDeTamanho({ tamanho, nome, origem }) {
  const modificador = modificadorDeManobra(tamanho);
  return {
    _id: ID_EFEITO_TAMANHO,
    name: nome,
    img: 'icons/svg/upgrade.svg',
    origin: origem,
    disabled: false,
    changes: modificador ? [{ key: 'ataque', mode: 2, value: String(modificador), priority: 20 }] : [],
    flags: { tormenta20: { onuse: true, attack: true, custo: '' } }
  };
}

export function unicosPorId(efeitos) {
  const vistos = new Set();
  return efeitos.filter((efeito) => !vistos.has(efeito.id) && vistos.add(efeito.id));
}
