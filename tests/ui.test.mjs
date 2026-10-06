import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const raiz = new URL('../', import.meta.url);
const base = await readFile(new URL('styles/hayd-ui-base.css', raiz), 'utf8');
const gmtools = await readFile(new URL('t20-hayd-gmtools.css', raiz), 'utf8');
const entrada = await readFile(new URL('t20-hayd-gmtools.mjs', raiz), 'utf8');
const uiBase = await readFile(new URL('scripts/ui-base.mjs', raiz), 'utf8');
const manifesto = JSON.parse(await readFile(new URL('module.json', raiz), 'utf8'));

// Os comentários falam SOBRE as regras — inclusive citando o que é proibido.
// Um teste que lê comentário testa a prosa, não o CSS.
const semComentarios = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const baseCru = semComentarios(base);

/** Seletores de regra, sem comentários e sem os `}` que fecham blocos. */
/** Separa uma lista de seletores pelas vírgulas de TOPO (as de dentro de
 *  `:not(a, b)` e `:where(a, b)` não separam nada). */
const porVirgulaDeTopo = (sel) => {
  const partes = [];
  let nivel = 0, atual = '';
  for (const ch of sel) {
    if (ch === '(') nivel++;
    else if (ch === ')') nivel--;
    if (ch === ',' && nivel === 0) { partes.push(atual); atual = ''; continue; }
    atual += ch;
  }
  partes.push(atual);
  return partes.map((p) => p.trim()).filter(Boolean);
};

const seletoresDe = (css) => [...semComentarios(css).matchAll(/(?:^|\})\s*([^@{}]+?)\s*\{/g)]
  .map((m) => m[1].trim())
  .filter((sel) => /[.#[:a-z]/i.test(sel) && !/^(from|to|\d+%)$/.test(sel));

test('nenhum token do módulo vaza para fora das janelas do módulo', () => {
  // Um módulo divide a página com o core, com o sistema e com os outros
  // módulos. Declarar `--t20g-*` em `:root`, `body` ou `.application` seria
  // impor a nossa paleta à casa dos outros.
  assert.doesNotMatch(baseCru, /^:root\s*\{/m, 'tokens não podem ser declarados em :root');
  assert.doesNotMatch(baseCru, /^(body|html)\s*\{/m, 'seletor global demais');
  for (const sel of seletoresDe(base)) {
    assert.ok(/\.(hayd|t20g)-ui/.test(sel), `seletor sem escopo em hayd-ui-base.css: ${sel}`);
  }
});

test('o tema claro do Foundry refaz a rampa inteira', () => {
  // Sem isto, uma janela do módulo fica escura à força dentro de um mundo
  // claro — o erro clássico de módulo que ignora o tema do usuário.
  const i = base.indexOf('.theme-light :is(.hayd-ui, .t20g-ui)');
  assert.ok(i > 0, 'não achou o bloco de tema claro');
  const claro = base.slice(i, base.indexOf('}', i));
  for (const token of ['--t20g-s0', '--t20g-s1', '--t20g-ink', '--t20g-accent', '--t20g-line']) {
    assert.match(claro, new RegExp(`${token}:`), `${token} não é refeito no tema claro`);
  }
});

test('a ponte para as telas antigas não ganha das regras de componente', () => {
  // `:not()` SOMA especificidade (a do argumento mais específico). Com o
  // `:not` solto, a ponte empatava — ou ganhava — das regras das próprias
  // telas, e o botão principal das janelas de tesouro voltava a ficar cinza.
  // Dentro de `:where()` a exclusão custa zero.
  //
  // Só interessa `:not()` com classe ou id dentro; `:not(:disabled)` as
  // regras de componente também têm, então não desequilibra nada.
  // A fatia começa DENTRO do comentário de seção, então o abre-comentário
  // fica para trás e o limpador não o reconheceria: corta-se até o fim dele.
  const secao = base.slice(base.indexOf('Ponte para as telas antigas'));
  assert.ok(secao.length > 0, 'não achou a seção da ponte');
  const ponte = secao.slice(secao.indexOf('*/') + 2);
  for (const sel of seletoresDe(ponte)) {
    for (const trecho of porVirgulaDeTopo(sel)) {
      const fora = trecho.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, '');
      assert.doesNotMatch(fora, /:not\([^)]*[.#]/,
        `:not() com classe fora de :where() na ponte: ${trecho.trim()}`);
    }
  }
});

test('a ponte só alcança títulos que nenhuma tela desenhou', () => {
  // `h3` sem classe é título solto de tela antiga. Um `h3` COM classe já foi
  // desenhado de propósito — e a regra genérica o deixava em caixa alta (foi
  // o que aconteceu com o nome do membro na Ficha do Grupo).
  assert.match(baseCru, /:where\(h3:not\(\[class\]\), h4:not\(\[class\]\)\)/);
});

test('nada de efeito caro de composição nas janelas', () => {
  // Numa mesa de VTT a cena, o chat e os tokens já disputam quadro. Blur de
  // fundo e filtros custam uma camada de composição por janela aberta.
  assert.doesNotMatch(baseCru, /backdrop-filter/);
  assert.doesNotMatch(baseCru, /filter:\s*blur/);
  // Transição com `all` anima propriedades de layout sem querer.
  assert.doesNotMatch(baseCru, /transition:\s*all/);
});

test('as listas longas do módulo pulam a composição do que está fora da tela', () => {
  // Vínculos de tesouro passa de 250 linhas; sem isto a rolagem engasga.
  assert.match(baseCru, /content-visibility:\s*auto/);
  assert.match(semComentarios(gmtools), /content-visibility:\s*auto/);
});

test('a base entra pelos arquivos que o manifesto já carrega', () => {
  // De propósito: `module.json` só é relido quando o SERVIDOR do Foundry
  // reinicia. Entrando por @import e pelo esmodule principal, uma
  // atualização do módulo passa a valer com um F5.
  assert.match(gmtools, /^\/\*[^\n]*\*\/\s*@import url\("styles\/hayd-ui-base\.css"\);/);
  assert.match(entrada, /import '\.\/scripts\/ui-base\.mjs';/);
  assert.ok(!manifesto.styles.includes('styles/hayd-ui-base.css'),
    'não duplicar: o CSS base entra por @import, não pelo manifesto');
  assert.ok(!manifesto.esmodules.includes('scripts/ui-base.mjs'),
    'não duplicar: o hook entra pelo esmodule principal');
});

test('a marcação das janelas é um teste por render, e não observação contínua', () => {
  // O hook roda em TODA janela que o Foundry abre, inclusive as do core e de
  // outros módulos. Um MutationObserver aqui custaria para a mesa inteira.
  assert.doesNotMatch(uiBase, /MutationObserver|setInterval|requestAnimationFrame/);
  assert.match(uiBase, /Hooks\.on\('renderApplicationV2'/);
  assert.match(uiBase, /Hooks\.on\('renderDialogV2'/);
  // Só marca o que é do módulo: janela de terceiro não pode receber a classe.
  assert.match(uiBase, /\[class\*="t20g-"\], \[class\*="thm-"\]/);
});

test('a base visual só alcança as janelas do próprio módulo', () => {
  // Regressão real: o critério era "tem markup nosso dentro". Só que o
  // módulo injeta markup NAS JANELAS DOS OUTROS — uma seção na tela de
  // configurações do Foundry, um botão na ficha do sistema, o painel de
  // engenhocas na aba de magias. O resultado foi a barra lateral, o chat, o
  // diretório de atores e a tela de configurações do core recebendo a base
  // visual do módulo, que não é nossa para redesenhar.
  assert.match(uiBase, /JANELAS_PROPRIAS/);
  assert.match(uiBase, /app instanceof foundry\.applications\.api\.DialogV2/);
  // Janela própria entra pelo nome da classe, não por conteúdo.
  for (const janela of ['PartySheetApp', 'PartyManagerApp', 'TesourosGeradorApp']) {
    assert.ok(uiBase.includes(janela), `${janela} fora da lista de janelas próprias`);
  }
  // E o conteúdo só decide dentro de um diálogo nosso.
  const fn = uiBase.slice(uiBase.indexOf('function ehNossa'), uiBase.indexOf('function marcar'));
  assert.match(fn, /ehDialogo && \(raiz\.matches\(MARCADOR\)/);
});
