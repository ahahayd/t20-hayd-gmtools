import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const raiz = new URL('../', import.meta.url);
const gmtools = await readFile(new URL('t20-hayd-gmtools.mjs', raiz), 'utf8');
const css = await readFile(new URL('t20-hayd-gmtools.css', raiz), 'utf8');

const injetarIndicador = gmtools.slice(
  gmtools.indexOf('function injetarIndicador'), gmtools.indexOf('/**\n * Aplica uma rolagem substituta'));

test('o histórico de rerolagem nunca fica DENTRO de .dice-total', () => {
  // Bug relatado: o sistema aplica dano lendo Number(dice-total.innerText) no
  // botão "Aplicar dano" do cartão de chat nativo. Com o histórico riscado
  // como FILHO de `.dice-total`, um total anterior "2" ao lado do novo total
  // "15" virava dano 152 aplicado (a concatenação de texto, não de números) —
  // e cada rerolagem seguinte acoplava mais um número ao ler o innerText de
  // novo. A correção move o histórico para IRMÃO de `.dice-total`, nunca
  // filho, então `.dice-total` continua com só o número de verdade dentro.
  assert.match(injetarIndicador, /total\.insertAdjacentElement\('afterend', historico\)/);
  assert.doesNotMatch(injetarIndicador, /total\.appendChild\(/);
});

test('a linha de histórico tem altura fixa, e os botões de aplicar dano/cura sobem por igual', () => {
  // Bug relatado: os botões nativos de aplicar dano/cura (`.dice-btn.result`)
  // são `position: absolute; bottom: 1px` relativos ao `.roll` de fora. A
  // linha de histórico, em fluxo normal logo abaixo de `.dice-total`,
  // aumenta a altura de `.roll` e empurra esses botões pra baixo,
  // descolando-os do total. A correção não tira o histórico do fluxo — só
  // trava a altura dele num valor conhecido e sobe os botões pelo mesmo
  // valor, então eles voltam a ficar exatamente onde ficavam sem a linha.
  const historicoRule = css.slice(
    css.indexOf('.t20g-reroll-historico {'), css.indexOf('}', css.indexOf('.t20g-reroll-historico {')));
  assert.ok(historicoRule.length > 0, 'não achou a regra CSS de .t20g-reroll-historico');
  assert.match(historicoRule, /height:\s*14px/);

  const marcaBotao = '.roll:has(.t20g-reroll-historico) .dice-btn.result {';
  assert.ok(css.includes(marcaBotao), 'não achou a regra que sobe os botões nativos');
  const botaoRule = css.slice(css.indexOf(marcaBotao), css.indexOf('}', css.indexOf(marcaBotao)));
  assert.match(botaoRule, /bottom:\s*17px/);
});

test('jogador (não só o Mestre) enxerga as opções de rerolar/inserir no menu do chat', () => {
  // Bug relatado: um `if (!game.user.isGM) return` logo no início do hook
  // escondia TODO o menu do módulo para jogadores comuns — inclusive Rerolar
  // e Inserir resultado, que são deles por padrão (jogadoresReroll e
  // jogadoresManual, os dois `default: true`). Cada opção já se autoprotege
  // na própria `condition` (podeRerolar/podeInserir para essas duas,
  // `game.user.isGM` embutido nas de metagame) — travar de novo por cima
  // delas aqui é o próprio bug voltando.
  const hook = gmtools.slice(
    gmtools.indexOf("Hooks.on('getChatMessageContextOptions'"),
    gmtools.indexOf('// ─── Organização das configurações'));
  assert.ok(hook.length > 0, 'não achou o hook getChatMessageContextOptions');
  assert.doesNotMatch(hook, /if \(!game\.user\.isGM\) return;/);
  assert.match(hook, /addContextMenuOptions\(options\)/);
});

test('rolagem sem .dice-roll no content (ex.: /r no chat) também mostra o indicador', () => {
  // Issue #1: `/r d20+13` rerolado ou com resultado inserido trocava o valor
  // sem marcador nenhum. O Foundry monta o `.dice-roll` dessas mensagens a
  // partir de `message.rolls` só na renderização, então o indicador gravado
  // no `content` não tinha onde entrar. A correção guarda o indicador nos
  // flags e o reinjeta no hook de render.
  const aplicar = gmtools.slice(
    gmtools.indexOf('async function aplicarNovasRolagens'), gmtools.indexOf('// ─── Recálculo automático'));
  assert.match(aplicar, /rerollIndicadores`\]: indicadores/);
  const reinjetar = gmtools.slice(
    gmtools.indexOf('function reinjetarIndicadoresDeRerolagem'),
    gmtools.indexOf('if (container) reinjetarIndicadoresDeRerolagem'));
  assert.ok(reinjetar.length > 0, 'não achou reinjetarIndicadoresDeRerolagem');
  assert.match(reinjetar, /getFlag\?\.\(MODULE_ID, 'rerolls'\)/);
  assert.match(reinjetar, /\.t20g-reroll-historico/);
  assert.match(reinjetar, /injetarIndicador\(bloco, anteriores, indicador\)/);
  // O hook não pode depender de isRestrictedUser: o Mestre também precisa ver.
  const hook = gmtools.slice(gmtools.indexOf('function reinjetarIndicadoresDeRerolagem'));
  assert.match(hook, /Hooks\.on\('renderChatMessageHTML', \(message, html\) => \{\r?\n  const container[^\n]*\n  if \(container\) reinjetarIndicadoresDeRerolagem/);
});
