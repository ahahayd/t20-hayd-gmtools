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


test('o dano recalculado pelo crítico sai da rolagem da mensagem, não do item', () => {
  // Bug relatado: numa espada 1d12 (19/x2) com Golpe Divino (+1d8), rerolar o
  // ataque para crítico dava 2d12 e perdia o 1d8.
  //
  // O item do ator tem só os dados da arma. O que valeu naquele uso — o +1d8
  // do Golpe Divino, o bônus digitado na janela de uso — fica num clone que o
  // sistema descarta depois de rolar, e o flag `tormenta20.itemData` guarda o
  // item DE ORIGEM, sem essas somas (conferido em jogo: num ataque com +555 de
  // bônus, o flag trazia só [1d20, luta, 0]). Rolar o dano pelo item, por
  // qualquer um dos dois caminhos, descarta tudo o que foi somado: o dano tem
  // de ser remontado a partir da rolagem que está na mensagem.
  const sub = gmtools.slice(
    gmtools.indexOf('async function substituicoesDeDanoPorCritico'),
    gmtools.indexOf('async function rerolarResultado'));
  assert.ok(sub.length > 0, 'não achou substituicoesDeDanoPorCritico');
  assert.match(sub, /const atual = message\.rolls\[idx\]/);
  assert.match(sub, /rolarComTermos\(atual, termosNovos\)/);
  assert.doesNotMatch(sub, /rollDamage|rolarDanoDoItem|itemDaRolagem/);
  assert.doesNotMatch(gmtools, /rolarDanoDoItem/);
});

test('virar crítico multiplica só o que o sistema multiplicaria, e nada mais', () => {
  // `damageRoll` do Tormenta20 multiplica terms[0], se for dado, e todo dado
  // marcado `danoMultiplicavel`. Um 1d8 somado por um poder não é nenhum dos
  // dois: tem de atravessar a mudança de estado intacto.
  const crit = gmtools.slice(
    gmtools.indexOf('function termosNoCritico'), gmtools.indexOf('function termosSemCritico'));
  assert.match(crit, /i === 0 \|\| t\.options\?\.flavor === 'danoMultiplicavel'/);
  assert.match(crit, /if \(!ehTermoDeDado\(t\) \|\| !multiplica\) return t\.formula;/);
  // Modificadores e flavor do dado sobrevivem à remontagem; o flavor
  // danoMultiplicavel é mantido de propósito (o sistema o apaga), senão a
  // volta ao dano normal não saberia o que desfazer.
  const dado = gmtools.slice(
    gmtools.indexOf('function dadoComQuantidade'), gmtools.indexOf('function termosDaRolagem'));
  assert.match(dado, /\(term\.modifiers \?\? \[\]\)\.join\(''\)/);
  assert.match(dado, /term\.options\?\.flavor/);
});

test('o termo que só vale no crítico volta ao virar crítico de novo', () => {
  // Bug relatado: um `danoCritico` (+10 só no crítico) saía ao deixar de ser
  // crítico e não voltava ao virar crítico outra vez. O sistema DESCARTA esses
  // termos ao montar um dano normal, então não há como deduzi-los da rolagem
  // normal — eles têm de ficar guardados na mensagem.
  const semCrit = gmtools.slice(
    gmtools.indexOf('function termosSemCritico'), gmtools.indexOf('async function rolarComTermos'));
  assert.match(semCrit, /t\.options\?\.flavor === 'danoCritico'/);
  // Descarta o operador junto, senão a fórmula fica com um "+" solto.
  assert.match(semCrit, /ehTextoDeOperador\(out\[out\.length - 1\]\)/);

  const sub = gmtools.slice(
    gmtools.indexOf('async function substituicoesDeDanoPorCritico'),
    gmtools.indexOf('async function rerolarResultado'));
  assert.match(sub, /getFlag\(MODULE_ID, FLAG_DANO_CRITICO\)/);
  // Guarda os dois estados: o que estava valendo e o que passou a valer.
  assert.match(sub, /\[estadoAtual\]: termosAtuais, \[estadoNovo\]: termosNovos/);
  // E reusa o estado já visto, em vez de deduzir, quando ele existe.
  assert.match(sub, /lembrados\[idx\]\?\.\[estadoNovo\]/);
  // O flag vai junto do update das rolagens, não num segundo write.
  const aplicar = gmtools.slice(
    gmtools.indexOf('async function aplicarNovasRolagens'), gmtools.indexOf('// ─── Recálculo automático'));
  assert.match(aplicar, /Object\.assign\(flagsExtra, sub\.flags \?\? \{\}\)/);
  assert.match(aplicar, /const update = \{\r?\n\s*\.\.\.flagsExtra,/);
});
