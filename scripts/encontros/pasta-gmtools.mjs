/**
 * t20-hayd-gmtools | encontros/pasta-gmtools.mjs
 * Tudo o que as ferramentas de encontro criam fica dentro de uma pasta
 * "Hayd GMTools" — no diretório de atores (pastas de encontro, chefes
 * importados, bandos avulsos) e no de itens (tesouros de encontro).
 */
export const NOME_PASTA = 'Hayd GMTools';

const MODULE_ID = 't20-hayd-gmtools';

/**
 * Pasta do módulo no diretório do tipo pedido; criada na primeira vez.
 * É achada pela flag onde quer que o Mestre a tenha posto (movida para
 * dentro de outra pasta ou renomeada); sem flag, pelo nome, em qualquer
 * nível — e aí ganha a flag para as próximas vezes.
 */
export async function pastaGMTools(tipo = 'Actor') {
  const marcada = game.folders.find(f => f.type === tipo && f.getFlag(MODULE_ID, 'raiz'));
  if (marcada) return marcada;
  const pelaNome = game.folders.find(f => f.type === tipo && f.name === NOME_PASTA);
  if (pelaNome) {
    await pelaNome.setFlag(MODULE_ID, 'raiz', true);
    return pelaNome;
  }
  return Folder.create({ name: NOME_PASTA, type: tipo, color: '#7a4b1f', sorting: 'a', flags: { [MODULE_ID]: { raiz: true } } });
}

/**
 * Subpasta dentro da pasta do módulo. Se o Mestre moveu a "Hayd GMTools"
 * para o fundo da árvore e não cabe mais um nível, usa a própria pasta.
 */
export async function subpastaGMTools(tipo, nome) {
  const raiz = await pastaGMTools(tipo);
  const max = CONST.FOLDER_MAX_DEPTH ?? 4;
  if ((raiz.depth ?? 1) >= max) return raiz;
  return Folder.create({ name: nome, type: tipo, folder: raiz.id, color: '#7a4b1f' });
}

/** Subpasta de encontro dentro da pasta do módulo. */
export function criarPastaDeEncontro(nome) {
  return subpastaGMTools('Actor', nome);
}
