import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarNome, semelhanca, sugerirAutomacoes } from '../../scripts/automacoes/sugestao.mjs';
import { AUTOMACOES } from '../../scripts/automacoes/catalogo.mjs';

const catalogo = Object.entries(AUTOMACOES).map(([id, def]) => ({ id, ...def }));
const paraPoder = catalogo.filter((a) => a.tipos.includes('poder'));
const nomes = (lista) => lista.map((a) => a.nome);

test('normaliza acento, caixa e pontuação', () => {
  assert.equal(normalizarNome('Sequência de Golpes'), 'sequencia de golpes');
  assert.equal(normalizarNome('Combinação: Um-Dois'), 'combinacao um dois');
  assert.equal(normalizarNome('  Sanguinário!  '), 'sanguinario');
  assert.equal(normalizarNome(null), '');
});

test('nome idêntico tem semelhança máxima', () => {
  assert.equal(semelhanca('Sanguinário', 'Sanguinário'), 1);
  assert.equal(semelhanca('sangue dos inimigos', 'Sangue dos Inimigos'), 1);
});

test('o prefixo "Combinação:" do catálogo não atrapalha', () => {
  // O poder na ficha se chama só "Um-Dois"
  assert.equal(semelhanca('Um-Dois', 'Combinação: Um-Dois'), 1);
  assert.equal(semelhanca('Chute no Joelho', 'Combinação: Chute no Joelho'), 1);
});

test('nomes sem relação não pontuam', () => {
  assert.equal(semelhanca('Bola de Fogo', 'Sanguinário'), 0);
  assert.equal(semelhanca('', 'Sanguinário'), 0);
});

test('sugere a automação certa para o nome do poder na ficha', () => {
  assert.deepEqual(nomes(sugerirAutomacoes('Sangue dos Inimigos', paraPoder)),
    ['Sangue dos Inimigos']);
  assert.deepEqual(nomes(sugerirAutomacoes('Estudar o Adversário', paraPoder)),
    ['Estudar o Adversário']);
  assert.deepEqual(nomes(sugerirAutomacoes('Um-Dois', paraPoder)),
    ['Combinação: Um-Dois']);
});

test('uma palavra comum a vários poderes não empurra o palpite errado', () => {
  // "Chute" sozinho é ambíguo entre Chute Circular e Chute no Joelho:
  // melhor não sugerir nada do que sugerir o errado em primeiro lugar.
  assert.deepEqual(sugerirAutomacoes('Chute', paraPoder), []);
  // Já o nome completo resolve a ambiguidade
  assert.deepEqual(nomes(sugerirAutomacoes('Chute Circular', paraPoder)),
    ['Combinação: Chute Circular']);
});

test('poder sem automação equivalente não sugere nada', () => {
  assert.deepEqual(sugerirAutomacoes('Ataque Poderoso', paraPoder), []);
  assert.deepEqual(sugerirAutomacoes('Foco em Arma', paraPoder), []);
});

test('a lista de origem é respeitada (magia não vira sugestão de poder)', () => {
  const magias = catalogo.filter((a) => a.tipos.includes('magia'));
  assert.deepEqual(nomes(sugerirAutomacoes('Seta Infalível de Talude', magias)),
    ['Seta Infalível de Talude']);
  // A mesma magia não aparece quando só poderes estão disponíveis
  assert.deepEqual(sugerirAutomacoes('Seta Infalível de Talude', paraPoder), []);
});

test('todas as automações têm categoria conhecida', () => {
  const validas = new Set(['barbaro', 'guerreiro', 'lutador', 'combate', 'magia']);
  for (const a of catalogo) {
    assert.ok(validas.has(a.categoria), `${a.nome} está sem categoria válida: ${a.categoria}`);
  }
  // Golpe Pessoal é poder de Guerreiro, não um poder de combate geral
  assert.equal(AUTOMACOES['golpe-pessoal'].categoria, 'guerreiro');
});

test('a fonte nomeia só o livro, sem capítulo', () => {
  const LIVROS = new Set([
    'Livro Básico',
    'Heróis de Arton',
    'Livro Básico e Heróis de Arton'
  ]);

  for (const a of catalogo) {
    assert.ok(a.fonte, `${a.nome} está sem fonte`);
    // A categoria já diz a classe; o capítulo deixava a linha longa à toa.
    assert.ok(LIVROS.has(a.fonte),
      `${a.nome}: a fonte deve ser só o livro, veio "${a.fonte}"`);
  }

  assert.equal(AUTOMACOES['estudar-o-adversario'].fonte, 'Heróis de Arton');
  assert.equal(AUTOMACOES['combinacao-um-dois'].fonte, 'Heróis de Arton');
});

test('o diário não repete a regra do poder — só o que a automação faz', async () => {
  const { readFile } = await import('node:fs/promises');
  const motor = await readFile(
    new URL('../../scripts/automacoes/motor.mjs', import.meta.url), 'utf8');

  // A regra vinha em <blockquote>${def.resumo}</blockquote>
  assert.doesNotMatch(motor, /blockquote/,
    'a regra do poder saiu das páginas do diário');
  assert.doesNotMatch(motor, /\.resumo/,
    'nem o diário nem o seletor devem exibir a descrição do poder');
});

test('o diário tem UMA página por categoria, não uma por poder', async () => {
  const { readFile } = await import('node:fs/promises');
  const motor = await readFile(
    new URL('../../scripts/automacoes/motor.mjs', import.meta.url), 'utf8');

  const ordem = [...motor.matchAll(/id: '(barbaro|guerreiro|lutador|combate|magia)'/g)]
    .map((m) => m[1]);
  assert.deepEqual(ordem, ['barbaro', 'guerreiro', 'lutador', 'combate', 'magia']);

  // A chave da página é a categoria: uma página agrupa todos os poderes dela
  assert.match(motor, /pagina: `cat-\$\{categoria\.id\}`/);
  assert.match(motor, /function paginaDaCategoria\(categoria\)/);
  // Cada poder vira uma seção <h2> dentro da página da categoria
  assert.match(motor, /<h2>\$\{def\.nome\}<\/h2>\$\{paginaDaAutomacao\(def\)\}/);

  // sort explícito para a ordem valer ao ATUALIZAR um diário já existente
  assert.match(motor, /sort: \(i \+ 1\) \* 100/);
  // A mecânica compartilhada abre a página do Lutador
  assert.match(motor, /abre: paginaCombinacoes/);
});

test('páginas do formato antigo são removidas ao atualizar o diário', async () => {
  const { readFile } = await import('node:fs/promises');
  const motor = await readFile(
    new URL('../../scripts/automacoes/motor.mjs', import.meta.url), 'utf8');

  // Sem isto, quem já tinha o diário ficaria com as páginas por poder órfãs
  // ao lado das novas páginas por categoria.
  assert.match(motor, /deleteEmbeddedDocuments\('JournalEntryPage', paraApagar\)/);
  // Só as páginas do módulo saem: as do Mestre não têm a flag
  assert.match(motor, /const chave = p\.getFlag\(MODULE_ID, 'pagina'\);\s*\n\s*return chave && !chavesAtuais\.has\(chave\);/);
});

test('a tabela do diário lista só o nome do efeito do Golpe Pessoal', async () => {
  const { readFile } = await import('node:fs/promises');
  const motor = await readFile(
    new URL('../../scripts/automacoes/motor.mjs', import.meta.url), 'utf8');

  assert.match(motor, /<td><b>\$\{ef\.nome\}<\/b><\/td>/);

  // A descrição sai da TABELA do diário, mas continua no construtor: lá ela
  // é o que permite escolher os efeitos com conhecimento de causa.
  const tabela = motor.slice(
    motor.indexOf('const tabela = (efeitos)'),
    motor.indexOf('</tbody></table>')
  );
  assert.doesNotMatch(tabela, /\$\{ef\.texto\}/);
});
