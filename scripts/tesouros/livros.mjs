/**
 * t20-hayd-tesouros | livros.mjs
 * Quais livros-fonte entram nas rolagens de tesouro.
 *
 * Mesa que não usa Heróis de Arton (por exemplo) desliga o livro aqui e as
 * entradas dele somem do sorteio. O espaço delas é redividido entre as que
 * ficam, proporcionalmente à raridade original (ver `redistribuirFaixas`) —
 * mesmo tratamento das entradas que o Mestre tira à mão pelo homebrew.
 *
 * Entradas SEM livro (homebrew do próprio Mestre, exemplos de riqueza) nunca
 * são filtradas: não pertencem a livro nenhum.
 */
import { MODULE_ID, SETTING_LIVROS, LIVROS } from './constantes.mjs';

export function registrarLivrosSettings() {
  game.settings.register(MODULE_ID, SETTING_LIVROS, {
    scope: 'world',
    config: false,
    type: Object,
    // Todos habilitados por padrão.
    default: Object.fromEntries(LIVROS.map(l => [l, true]))
  });
}

/** Estado salvo, completado com o padrão (livro novo entra habilitado). */
export function obterLivros() {
  let salvo = null;
  try { salvo = game.settings.get(MODULE_ID, SETTING_LIVROS); } catch { /* antes do init */ }
  const base = Object.fromEntries(LIVROS.map(l => [l, true]));
  return { ...base, ...(salvo ?? {}) };
}

export async function definirLivro(livro, habilitado) {
  await game.settings.set(MODULE_ID, SETTING_LIVROS, { ...obterLivros(), [livro]: !!habilitado });
}

export async function habilitarTodosOsLivros() {
  await game.settings.set(MODULE_ID, SETTING_LIVROS, Object.fromEntries(LIVROS.map(l => [l, true])));
}

/** True se a entrada pode ser sorteada com a configuração atual de livros. */
export function livroHabilitado(entrada) {
  const livro = entrada?.livro;
  if (!livro) return true;
  const cfg = obterLivros();
  // Livro que não está na lista conhecida (homebrew com fonte livre) passa.
  return cfg[livro] ?? true;
}

/** True se algum livro está desligado — usado para avisar na interface. */
export function haLivroDesligado() {
  const cfg = obterLivros();
  return LIVROS.some(l => !cfg[l]);
}
