/**
 * t20-hayd-tesouros | homebrew.mjs
 * Entradas customizadas por tabela, guardadas numa única setting de mundo.
 * Formato: { "<tabelaId>": { entradas: [{min,max,...}], dadoMax: Number } }
 * `dadoMax`, quando maior que o dado oficial da tabela, estende a rolagem
 * (ex.: 100 → 101 para caber uma entrada homebrew extra).
 */
import { MODULE_ID } from './constantes.mjs';

const SETTING = 'tesourosHomebrew';

export function registrarHomebrewSettings() {
  game.settings.register(MODULE_ID, SETTING, {
    scope: 'world',
    config: false,
    type: Object,
    default: {}
  });
}

function tudo() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTING) ?? {});
}

/**
 * `{ entradas, dadoMax, overrides }` da tabela — nunca null, sempre com as
 * chaves. `overrides` mapeia a chave de uma entrada OFICIAL para uma
 * customização do Mestre: `{ nome }` renomeia e `{ removida: true }` tira a
 * entrada do sorteio.
 */
export function obterHomebrewTabela(tabelaId) {
  const registro = tudo()[tabelaId];
  return {
    entradas: registro?.entradas ?? [],
    dadoMax: registro?.dadoMax ?? null,
    overrides: registro?.overrides ?? {}
  };
}

async function salvar(tabelaId, dados) {
  const todos = tudo();
  todos[tabelaId] = dados;
  await game.settings.set(MODULE_ID, SETTING, todos);
}

/**
 * Customiza uma entrada OFICIAL da tabela: `{ nome }` renomeia,
 * `{ removida: true }` tira do sorteio, `null` volta ao padrão.
 *
 * As entradas oficiais não são editadas no lugar — ficam no código, e o que o
 * Mestre muda vive aqui por cima. Assim uma atualização do módulo pode corrigir
 * a tabela sem apagar o que a mesa customizou.
 */
export async function definirOverrideOficial(tabelaId, chave, dados) {
  const atual = obterHomebrewTabela(tabelaId);
  const overrides = { ...atual.overrides };
  if (dados) overrides[chave] = dados;
  else delete overrides[chave];
  await salvar(tabelaId, { entradas: atual.entradas, dadoMax: atual.dadoMax, overrides });
}

/** Descarta TODA a customização de uma tabela (entradas novas e overrides). */
export async function restaurarPadraoTabela(tabelaId) {
  const todos = tudo();
  delete todos[tabelaId];
  await game.settings.set(MODULE_ID, SETTING, todos);
}

/** Descarta a customização de TODAS as tabelas. */
export async function restaurarPadraoTudo() {
  await game.settings.set(MODULE_ID, SETTING, {});
}

/**
 * Adiciona uma entrada homebrew na próxima faixa livre da tabela (depois do
 * dado oficial e de qualquer homebrew já existente), estendendo `dadoMax`.
 * `entradaSemFaixa` é o resto da entrada (nome, livro, página, chave, ...).
 */
export async function adicionarEntradaHomebrew(tabelaId, dadoOficial, entradaSemFaixa) {
  const atual = obterHomebrewTabela(tabelaId);
  const proximo = Math.max(dadoOficial, atual.dadoMax ?? 0) + 1;
  const entrada = { min: proximo, max: proximo, tipo: 'catalogo', homebrew: true, ...entradaSemFaixa };
  const entradas = [...atual.entradas, entrada];
  await salvar(tabelaId, { entradas, dadoMax: proximo });
  return entrada;
}

/** Remove uma entrada homebrew pelo índice dentro da lista homebrew (não recalcula faixas das demais). */
export async function removerEntradaHomebrew(tabelaId, indice) {
  const atual = obterHomebrewTabela(tabelaId);
  const entradas = atual.entradas.filter((_, i) => i !== indice);
  await salvar(tabelaId, { entradas, dadoMax: atual.dadoMax });
}
