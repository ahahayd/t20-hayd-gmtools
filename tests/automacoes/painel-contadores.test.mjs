import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const raiz = new URL('../../', import.meta.url);
const motor = await readFile(new URL('scripts/automacoes/motor.mjs', raiz), 'utf8');
const hooks = await readFile(new URL('scripts/automacoes/hooks.mjs', raiz), 'utf8');
const css = await readFile(new URL('t20-hayd-gmtools.css', raiz), 'utf8');
const idioma = JSON.parse(await readFile(new URL('lang/pt-BR.json', raiz), 'utf8'));

const trecho = (inicio, fim) => {
  const i = motor.indexOf(inicio);
  assert.ok(i >= 0, `não achei: ${inicio}`);
  const f = motor.indexOf(fim, i);
  assert.ok(f > i, `não achei o fim de: ${inicio}`);
  return motor.slice(i, f);
};

test('o botão de contadores é injetado somente na aba Efeitos de fichas controladas', () => {
  const injecao = trecho('function injetarPainelContadores(', '/* ─── Botões no cartão');
  assert.match(injecao, /ator\?\.documentName !== 'Actor'/);
  assert.match(injecao, /!podeControlar\(ator\)/);
  assert.match(injecao, /\.tab\.effects\[data-tab="effects"\]/);
  assert.match(injecao, /:scope > ol\.effects-list/);
  assert.match(hooks, /Hooks\.on\('renderActorSheet',[\s\S]*s\.injetarPainelContadores\(app, html\)/);
});

test('o painel cobre todos os formatos de contagem das automações', () => {
  const grupos = trecho('function gruposDoPainelContadores(', 'function htmlLinhaPainelContadores(');
  assert.match(grupos, /definicaoDe\(item\)\?\.contador/,
    'faltam Sangue dos Inimigos, Sanguinário e Sequência de Golpes');
  assert.match(grupos, /definicaoDe\(item\)\?\.golpe && temSequencial\(item\)/,
    'falta o Sequencial do Golpe Pessoal');
  assert.match(grupos, /poderesDeCombinacao\(ator\)\.length/);
  assert.match(grupos, /tipo: 'combinacao'/);
  assert.match(grupos, /poderesDeEstudo\(ator\)\.length/);
  assert.match(grupos, /tipo: 'estudo'/);
  const alvos = trecho('function alvosEditaveisDoAtor(', '/** Descrição canônica');
  assert.match(alvos, /alvosMirados\(\)/,
    'um alvo mirado ainda sem registro deve poder ser adicionado com valor zero');
});

test('salvar altera somente campos editados e respeita o tipo do contador', () => {
  const leitura = trecho('function lerEdicoesPainelContadores(', '/** Aplica apenas campos');
  assert.match(leitura, /edicao\.valor !== edicao\.original/);

  const aplicacao = trecho('async function aplicarEdicoesPainelContadores(', 'async function abrirPainelContadores(');
  assert.match(aplicacao, /definirContador\(item, edicao\.valor\)/);
  assert.match(aplicacao, /definirSequencial\(item, edicao\.valor\)/);
  assert.match(aplicacao, /definirCombinacao\(ator, edicao\.chave, edicao\.valor\)/);
  assert.match(aplicacao, /definirEstudo\(ator, edicao\.chave, edicao\.valor\)/);
});

test('edições manuais atualizam efeitos e cartões do chat quando aplicável', () => {
  const comum = trecho('async function definirContador(', '/** Diálogo de escolha');
  assert.match(comum, /sincronizarEfeito\(item\)/);
  assert.match(comum, /atualizarRotulos\(item\)/);

  const combinacao = trecho('async function definirCombinacao(', '/**\n * Põe os efeitos de uso');
  assert.match(combinacao, /atualizarMensagensRetroativas\(ator, chaveAlvo\)/,
    'Boca do Estômago precisa acompanhar a correção manual');
  assert.match(combinacao, /sincronizarCombinacoes\(ator\)/);
  assert.match(combinacao, /atualizarDebuffsAplicados\(ator, chaveAlvo\)/);
  assert.match(combinacao, /atualizarBarrasCombinacao\(ator\)/);

  const estudo = trecho('async function definirEstudo(', '/**\n * Fila por ator');
  assert.match(estudo, /sincronizarEstudo\(ator\)/);
  assert.match(estudo, /atualizarBarrasEstudo\(ator\)/);

  const sequencial = trecho('async function definirSequencial(', '/* --- Conjurador');
  assert.match(sequencial, /sincronizarGolpe\(item\)/);
  assert.match(sequencial, /atualizarBarrasGolpe\(item\)/);
});

test('o painel tem estilos próprios e todas as traduções usadas', () => {
  assert.match(css, /\.t20g-contadores-ficha/);
  assert.match(css, /\.t20g-contadores-dialogo/);
  assert.match(css, /\.t20g-contadores-linha/);

  for (const chave of [
    'ContadoresBotao', 'ContadoresDica', 'ContadoresTitulo', 'ContadoresAjuda',
    'ContadoresComuns', 'ContadoresGolpePessoal', 'ContadoresSequencial',
    'ContadoresCombinacoes', 'ContadoresEstudo', 'ContadoresPorInimigo',
    'ContadoresLimite', 'ContadoresBonusEstudo', 'ContadoresSemAlvos',
    'ContadoresAlvoDesconhecido',
    'ContadoresAtualizados', 'ContadoresErro'
  ]) assert.equal(typeof idioma.T20HaydGMTools[chave], 'string', `tradução ausente: ${chave}`);
});
