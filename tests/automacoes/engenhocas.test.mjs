import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APARATOS } from '../../scripts/automacoes/engenhocas/catalogo.mjs';
import {
  bonusPorDado,
  calcularCD,
  corrigirFalhaParaSucesso,
  corrigirSucessoParaFalha,
  custoAprimoramentos,
  custoPadraoDoCirculo,
  dadoExtraDaFormula,
  depoisDaTentativa,
  modificadorAparatos,
  normalizarEstado,
  resetarDia
} from '../../scripts/automacoes/engenhocas/regras.mjs';

test('custo base das magias segue os círculos de T20', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(custoPadraoDoCirculo), [1, 3, 6, 10, 15]);
});

test('CD soma custo base, aprimoramentos, usos diários e aparatos', () => {
  assert.equal(calcularCD({ custoBase: 3 }), 18);
  assert.equal(calcularCD({ custoBase: 3, aparatos: ['estabilizador'] }), 20);
  assert.equal(calcularCD({
    custoBase: 3,
    aprimoramentos: 2,
    usosDia: 2,
    aparatos: ['estabilizador', 'giroscopio']
  }), 35);
  assert.equal(calcularCD({ custoBase: 3, usosDia: 1, resfriada: true }), 18);
});

test('um aparato aumenta +2 e dois aumentam +5', () => {
  assert.equal(modificadorAparatos([]), 0);
  assert.equal(modificadorAparatos(['estabilizador']), 2);
  assert.equal(modificadorAparatos(['estabilizador', 'giroscopio']), 5);
});

test('Comutador reduz apenas o custo total dos aprimoramentos', () => {
  assert.equal(custoAprimoramentos(4, []), 4);
  assert.equal(custoAprimoramentos(4, ['comutador']), 3);
  assert.equal(custoAprimoramentos(0, ['comutador']), 0);
});

test('sucesso e falha aumentam a próxima CD e falha enguiça', () => {
  const base = normalizarEstado({ custoBase: 3 });
  const sucesso = depoisDaTentativa(base, { sucesso: true });
  assert.equal(sucesso.usosDia, 1);
  assert.equal(sucesso.enguicada, false);

  const falha = depoisDaTentativa(base, { sucesso: false });
  assert.equal(falha.usosDia, 1);
  assert.equal(falha.enguicada, true);
});

test('Supressor obedece ao checkbox sempre — "uma vez por cena" é só o padrão, não uma trava', () => {
  const base = normalizarEstado({ custoBase: 3, aparatos: ['supressor-seguranca'] });
  const primeira = depoisDaTentativa(base, { sucesso: false, usarSupressor: true });
  assert.equal(primeira.usosDia, 0);
  assert.equal(primeira.enguicada, false);
  assert.equal(primeira.supressorUsado, true);

  // Já usado nesta cena, mas o Mestre marca o checkbox de novo de propósito
  // (ele nunca fica desabilitado — "já usado" só desmarca por padrão). A
  // regra pura confia no `usarSupressor` recebido; quem decide "uma vez por
  // cena" é a UI, não depoisDaTentativa.
  const segunda = depoisDaTentativa(primeira, { sucesso: false, usarSupressor: true });
  assert.equal(segunda.usosDia, 0);
  assert.equal(segunda.enguicada, false);

  // Sem marcar (o padrão da UI quando já usado): volta a enguiçar normalmente.
  const semMarcar = depoisDaTentativa(primeira, { sucesso: false, usarSupressor: false });
  assert.equal(semMarcar.usosDia, 1);
  assert.equal(semMarcar.enguicada, true);
});

test('transformar falha em sucesso corrige a tentativa sem contar duas vezes', () => {
  const base = normalizarEstado({ custoBase: 3, usosDia: 2 });
  const falha = depoisDaTentativa(base, { sucesso: false });
  const corrigido = corrigirFalhaParaSucesso(falha, base);
  assert.equal(corrigido.usosDia, 3);
  assert.equal(corrigido.enguicada, false);

  const comSupressor = normalizarEstado({
    custoBase: 3,
    usosDia: 2,
    aparatos: ['supressor-seguranca']
  });
  const suprimida = depoisDaTentativa(comSupressor, { sucesso: false, usarSupressor: true });
  const corrigida = corrigirFalhaParaSucesso(suprimida, comSupressor, { usarSupressor: true });
  assert.equal(corrigida.usosDia, 3);
  assert.equal(corrigida.supressorUsado, false);
});

test('transformar sucesso em falha é o exato caminho inverso', () => {
  const base = normalizarEstado({ custoBase: 3, usosDia: 2 });
  const sucesso = depoisDaTentativa(base, { sucesso: true });
  const corrigido = corrigirSucessoParaFalha(sucesso, base);
  assert.equal(corrigido.usosDia, 3);
  assert.equal(corrigido.enguicada, true);

  // Ida e volta: sucesso -> falha -> sucesso devolve exatamente o estado do
  // sucesso original, não um usosDia acumulado a mais nem a menos.
  const deVolta = corrigirFalhaParaSucesso(corrigido, base);
  assert.deepEqual(deVolta, sucesso);
});

test('gatilho de corda: transformar em falha devolve o gatilho a como estava antes', () => {
  const base = normalizarEstado({ custoBase: 3, aparatos: ['gatilho-corda'], gatilhoPronto: true });
  // Um sucesso de verdade consumiria o gatilho (gatilhoPronto: false é
  // aplicado por fora de depoisDaTentativa, na própria ativação) — a correção
  // precisa saber disso e restaurar o valor de ANTES, não o atual.
  const posSucesso = { ...depoisDaTentativa(base, { sucesso: true }), gatilhoPronto: false };
  const corrigido = corrigirSucessoParaFalha(posSucesso, base);
  assert.equal(corrigido.gatilhoPronto, true);
});

test('descanso zera progressão diária sem consertar engenhoca', () => {
  const estado = normalizarEstado({
    custoBase: 3,
    usosDia: 4,
    enguicada: true,
    refrigeracaoUsada: true,
    resfriada: true,
    supressorUsado: true
  });
  const novo = resetarDia(estado);
  assert.equal(novo.usosDia, 0);
  assert.equal(novo.refrigeracaoUsada, false);
  assert.equal(novo.resfriada, false);
  assert.equal(novo.enguicada, true);
  assert.equal(novo.supressorUsado, true);
});

test('Aparatos de cura e dano transformam as fórmulas esperadas', () => {
  assert.equal(bonusPorDado('2d8+2d6+3'), '2d8+2d6+3+4');
  assert.equal(dadoExtraDaFormula('2d6+4'), '1d6');
});

test('catálogo contém todos os catorze aparatos descritos', () => {
  assert.equal(Object.keys(APARATOS).length, 14);
  assert.ok(APARATOS['captador-luz']);
  assert.ok(APARATOS['supressor-seguranca']);
  assert.equal(APARATOS['espera-melhorias'].repetivel, true);
});

test('botões do painel cobrem as fichas normal e em abas sem fingir ser uma linha nativa', () => {
  const fonte = readFileSync(new URL('../../scripts/automacoes/engenhocas/index.mjs', import.meta.url), 'utf8');
  assert.match(fonte, /\.list-spells > ul\.item-list/);
  assert.match(fonte, /\.tab\.spells > ul\.item-list/);
  assert.match(fonte, /lista\.before\(montarBotoesFicha\(ator\)\)/);
  assert.match(fonte, /Painel de Engenhocas/);
  assert.match(fonte, /Resetar engenhocas/);
  assert.doesNotMatch(fonte, /t20g-eng-painel item(?:\s|\")/);
});

test('não há mais promessa pendurada esperando uma rerrolagem detectada', () => {
  const fonte = readFileSync(new URL('../../scripts/automacoes/engenhocas/index.mjs', import.meta.url), 'utf8');
  // Substituído pelos botões "Transformar em sucesso/falha": a falha termina
  // a ativação na hora, sem prender o Item.roll() original por até 30 min.
  assert.doesNotMatch(fonte, /aguardarRerrolagem|ativacoesPendentes|aoAlterarRolagem/);
});

test('a engenhoca conjura sempre, sucesso ou falha — só o enguiço muda', () => {
  const fonte = readFileSync(new URL('../../scripts/automacoes/engenhocas/index.mjs', import.meta.url), 'utf8');
  const executarAtivacao = fonte.slice(
    fonte.indexOf('async function executarAtivacao'), fonte.indexOf('function podeComecar'));
  // Conjurar só no sucesso exigia corrigir uma falha rolando de novo, e uma
  // segunda rolagem perde os aparatos aplicados na primeira (Estimulador,
  // Estabilizador…) — o diálogo nativo reabre do zero. Sempre retornando
  // `configuracao`, aplicarEfeitosDosAparatos roda uma vez só, sempre.
  assert.doesNotMatch(executarAtivacao, /if \(sucesso\) \{/,
    'conjurar não pode mais depender de sucesso — só o enguiço depende');
  assert.match(executarAtivacao, /aplicarEfeitosDosAparatos\(item, configuracao, estado\);\s*\n\s*conjuracoesEmCurso\.set/);
});

test('pularEngenhoca não existe mais — nada precisa "pular" a checagem porque não há replay', () => {
  const fonte = readFileSync(new URL('../../scripts/automacoes/engenhocas/index.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(fonte, /pularEngenhoca/);
});

test('transformar em sucesso e em falha só corrigem estado — não rolam nada de novo', () => {
  const fonte = readFileSync(new URL('../../scripts/automacoes/engenhocas/index.mjs', import.meta.url), 'utf8');
  const emSucesso = fonte.slice(
    fonte.indexOf('async function transformarEmSucesso'), fonte.indexOf('async function transformarEmFalha'));
  const emFalha = fonte.slice(
    fonte.indexOf('async function transformarEmFalha'), fonte.indexOf('function criarBotao'));

  assert.match(emSucesso, /corrigirFalhaParaSucesso\(\s*\n\s*estadoDaEngenhoca\(item\)/);
  assert.match(emFalha, /corrigirSucessoParaFalha\(estadoDaEngenhoca\(item\), registro\.estadoAntes/);
  // A magia já foi conjurada na única rolagem que existe — nenhum dos dois
  // pode chamar item.roll() nem apagar a mensagem da magia.
  assert.doesNotMatch(emSucesso, /item\.roll\(\)/);
  assert.doesNotMatch(emFalha, /\.delete\(\)/);
  // Em vez disso, os dois (des)marcam o cartão da MAGIA — não o do teste.
  assert.match(emSucesso, /desmarcarConjuracaoFalhou\(mensagemMagia\)/);
  assert.match(emFalha, /marcarConjuracaoFalhou\(mensagemMagia\)/);
});

test('a marca de "conjuração falhou" só aparece no cartão quando a engenhoca realmente enguiça', () => {
  const fonte = readFileSync(new URL('../../scripts/automacoes/engenhocas/index.mjs', import.meta.url), 'utf8');
  assert.match(fonte, /async function marcarConjuracaoFalhou\(message\)/);
  assert.match(fonte, /async function desmarcarConjuracaoFalhou\(message\)/);
  // Idempotente nos dois sentidos: marcar de novo ou desmarcar sem estar
  // marcado não pode duplicar o aviso nem falhar.
  assert.match(fonte, /if \(!message\?\.id \|\| message\.getFlag\(MODULE_ID, FLAG_CONJURACAO_FALHOU\)\) return;/);
  assert.match(fonte, /if \(!message\?\.id \|\| !message\.getFlag\(MODULE_ID, FLAG_CONJURACAO_FALHOU\)\) return;/);
  // Chamado só quando a magia FOI conjurada E o teste falhou — não em toda
  // falha (às vezes o sistema nem chega a criar o cartão da magia).
  assert.match(fonte, /if \(conjurada && registro\.resultado === 'falha'\) \{/);
});

test('o cartão de resultado oferece só o botão oposto ao resultado atual', () => {
  const fonte = readFileSync(new URL('../../scripts/automacoes/engenhocas/index.mjs', import.meta.url), 'utf8');
  assert.match(fonte, /data-acao-engenhoca="transformar-sucesso"/);
  assert.match(fonte, /data-acao-engenhoca="transformar-falha"/);
  // "Consertar" não aparece mais em nenhum lugar do chat — só no Painel.
  const barraChat = fonte.slice(
    fonte.indexOf('export function montarBarraChat'),
    fonte.indexOf('export function injetarBarra'));
  const resultado = fonte.slice(
    fonte.indexOf('function conteudoResultadoAtivacao'),
    fonte.indexOf('async function atualizarMensagemAtivacao'));
  // Checa o botão de verdade, não a palavra solta — um comentário explicando
  // a mudança ("Consertar mora só no Painel...") não pode contar como sobra.
  assert.doesNotMatch(barraChat, /criarBotao\('consertar'/);
  assert.doesNotMatch(resultado, /data-acao-engenhoca="consertar"/);
});

test('o painel troca Ativar por Consertar quando a engenhoca está enguiçada', () => {
  const fonte = readFileSync(new URL('../../scripts/automacoes/engenhocas/index.mjs', import.meta.url), 'utf8');
  const linhaPainel = fonte.slice(
    fonte.indexOf('function linhaPainel'), fonte.indexOf('function conteudoPainel'));
  assert.match(linhaPainel, /estado\.enguicada\s*\n\s*\? `<button type="button" class="t20g-eng-painel-consertar"/);
  // Os dois nunca no ar ao mesmo tempo — só o ternário decide qual aparece.
  assert.doesNotMatch(linhaPainel, /estado\.enguicada \? `<button[^`]*Consertar/);
});

test('mensagem da ativação registra CD alvo e resultado e o reset pode ser revertido', () => {
  const fonte = readFileSync(new URL('../../scripts/automacoes/engenhocas/index.mjs', import.meta.url), 'utf8');
  assert.match(fonte, /CD alvo \$\{cd\}/);
  assert.match(fonte, /A engenhoca <b>\$\{esc\(item\.name\)\}<\/b> foi ativada/);
  assert.match(fonte, /data-eng-descanso="reverter"/);
  assert.match(fonte, /CDs antes e depois do reset diário/);
  assert.match(fonte, /Consertar engenhoca/);
  assert.match(fonte, /data-eng-painel-acao="ativar"/);
  assert.match(fonte, /if \(acao === 'ativar'\) return item\.roll\(\)/);
});

test('a penalidade de armadura só sai da base quando o efeito que a devolve entra', () => {
  const fonte = readFileSync(new URL('../../scripts/automacoes/engenhocas/index.mjs', import.meta.url), 'utf8');
  // Bug: subtrair para QUALQUER perícia mas só compensar em 'enge' fazia
  // Acrobacia/Furtividade rolar sem a própria PDA delas ao trocar a perícia
  // do teste de ativação. A base sem guarda nenhuma não pode mais existir.
  assert.doesNotMatch(fonte, /const base = Number\(pericia\.value\) - \(pericia\.pda/);
  assert.match(fonte, /periciaId === 'enge'\s*\n\s*\? Number\(pericia\.value\) - \(pericia\.pda \? pda : 0\)/);
});

test('cancelar o diálogo de ativação não é lido como o nome de uma perícia', () => {
  const fonte = readFileSync(new URL('../../scripts/automacoes/engenhocas/index.mjs', import.meta.url), 'utf8');
  // O botão Ativar devolve um OBJETO {pericia, resfriar, supressor}; o botão
  // Cancelar (sem callback) resolve com a própria string 'cancelar' — que já
  // falha o `typeof === 'object'` sozinha, sem precisar checar o valor.
  assert.match(fonte, /callback: \(_ev, botao\) => \(\{\s*\n\s*pericia: botao\.form\.elements\.pericia\.value/);
  assert.match(fonte, /if \(!escolha \|\| typeof escolha !== 'object' \|\| typeof escolha\.pericia !== 'string'\) return null;/);
});

test('refrigeração e supressor são checkboxes na própria janela de ativar', () => {
  const fonte = readFileSync(new URL('../../scripts/automacoes/engenhocas/index.mjs', import.meta.url), 'utf8');
  const escolherPericia = fonte.slice(
    fonte.indexOf('async function escolherPericia'), fonte.indexOf('/** Rola uma perícia'));
  assert.match(escolherPericia, /name="resfriar" data-eng-resfriar/);
  // O checkbox do Supressor nunca fica desabilitado — "já usado nesta cena"
  // só muda o padrão (desmarcado); o Mestre ainda pode marcá-lo à mão.
  assert.match(escolherPericia, /name="supressor" \$\{estado\.supressorUsado \? '' : 'checked'\}/);
  assert.doesNotMatch(escolherPericia, /name="supressor"[^>]*disabled/);
  // A CD exibida muda ao vivo ao marcar/desmarcar Refrigeração, sem fechar o
  // diálogo — sem isto o número mostrado mentiria até o próximo teste.
  assert.match(escolherPericia, /caixa\?\.addEventListener\('change'/);

  // Refrigeração muda a CD ANTES de rolar (não um botão separado depois), e
  // o Supressor só é gasto se o teste realmente falhar.
  const executarAtivacao = fonte.slice(
    fonte.indexOf('async function executarAtivacao'), fonte.indexOf('function podeComecar'));
  assert.match(executarAtivacao, /cdFinal = Math\.max\(0, cd - 5\)/);
  // "Uma vez por cena" não é mais imposto na ativação — travar de novo aqui
  // faria marcar o checkbox de propósito não ter efeito nenhum.
  assert.doesNotMatch(executarAtivacao, /!estado\.supressorUsado && !!escolha\.supressor/);
  assert.match(executarAtivacao, /const usarSupressor = !sucesso && temAparato\(estado, 'supressor-seguranca'\)\s*\n\s*&& !!escolha\.supressor;/);

  // O botão avulso "Resfriar (1 PM)" saiu do chat — duas formas de acionar o
  // mesmo aparato uma vez por dia permitiriam usá-lo duas vezes no mesmo dia.
  assert.doesNotMatch(fonte, /criarBotao\('resfriar'/);
});

test('a próxima CD do dia aparece no próprio resultado da ativação', () => {
  const fonte = readFileSync(new URL('../../scripts/automacoes/engenhocas/index.mjs', import.meta.url), 'utf8');
  assert.match(fonte, /Próxima CD no dia: <b>\$\{proximaCD\}<\/b>/);
  assert.match(fonte, /const proximaCD = cdAtual\(real, proximo\)/);
});

test('a CD do Estabilizador sobe no PRÓPRIO cartão da magia, não numa nota à parte', () => {
  const fonte = readFileSync(new URL('../../scripts/automacoes/engenhocas/index.mjs', import.meta.url), 'utf8');
  // O cartão da magia não lê resistencia.cd direto — mostra `labels.header`,
  // uma string tipo "Resistência: Vontade (CD 15);" já MONTADA em
  // `_prepareLabels()` antes do aparato entrar em jogo. Mutar o número sem
  // reconstruir o label deixa o cartão com a CD antiga — daí "ficou feio".
  const aplicarEfeitos = fonte.slice(
    fonte.indexOf('function aplicarEfeitosDosAparatos'), fonte.indexOf('function conteudoResultadoAtivacao'));
  assert.match(aplicarEfeitos, /item\.system\.resistencia\.bonus = \(Number\(item\.system\.resistencia\.bonus\) \|\| 0\) \+ 2;/);
  assert.match(aplicarEfeitos, /item\._prepareLabels\?\.\(\);/);
  // Nada de nota manual dizendo "CD agora X" na descrição do aparato — o
  // pedido explícito foi a CD subir no cartão, não o aprimoramento narrar.
  assert.doesNotMatch(aplicarEfeitos, /CD para resistir/);
});

test('transformar nunca falha em silêncio: toda saída cedo avisa alguma coisa', () => {
  const fonte = readFileSync(new URL('../../scripts/automacoes/engenhocas/index.mjs', import.meta.url), 'utf8');
  const transformarResultado = fonte.slice(
    fonte.indexOf('async function transformarResultado'),
    fonte.indexOf('/** Corrige a CD/enguiço'));
  // Um `return;` sozinho aqui é "o botão não faz nada" sem dizer por quê —
  // cada guarda precisa de um ui.notifications ao lado.
  assert.doesNotMatch(transformarResultado, /\breturn;(?!\s*\n\s*\})/,
    'toda saída cedo de transformarResultado precisa avisar algo, não só "return;"');
  assert.match(transformarResultado, /return ui\.notifications\.warn\('Esta mensagem não tem/);
  assert.match(transformarResultado, /return ui\.notifications\.warn\(`Você não controla/);
  assert.match(transformarResultado, /return ui\.notifications\.info\(`Esta ativação já está marcada/);
  // E o catch do clique não pode só logar no console — quem clicou precisa
  // ver alguma coisa na tela, não só quem tem o devtools aberto.
  assert.match(fonte, /Falha ao transformar o resultado da engenhoca`, err\);\s*\n\s*ui\.notifications\.error/);
});

test('o clone de Item.roll() nunca tem .id — chaveItem e itemReal não podem depender dele', () => {
  const fonte = readFileSync(new URL('../../scripts/automacoes/engenhocas/index.mjs', import.meta.url), 'utf8');
  // Bug do PRÓPRIO T20: `this.clone({ keepId: true })` passa `keepId` como
  // DADO (1º parâmetro de `clone(dados, contexto)`), não como CONTEXTO (2º,
  // onde `keepId` é de fato lido) — o clone SEMPRE perde o `_id`. Uma chave
  // ou lookup baseado em `.id` junta toda ativação sob "ator:undefined".
  const chaveItemFn = fonte.slice(fonte.indexOf('function chaveItem'), fonte.indexOf('function igual'));
  assert.doesNotMatch(chaveItemFn, /item\?\.id|item\.id/);
  assert.match(chaveItemFn, /item\?\.name/);

  const itemRealFn = fonte.slice(
    fonte.indexOf('const itensReaisPendentes = new Map();'), fonte.indexOf('async function gravarEstado'));
  assert.doesNotMatch(itemRealFn, /\.items\?\.get\?\.\(item\.id\)|\.items\.get\(item\.id\)/,
    'itemReal não pode voltar a procurar pelo id que o clone não tem');
  assert.match(itemRealFn, /itensReaisPendentes\.get\(chaveItem\(item\)\)/);

  // ligarFluxo precisa guardar o item REAL (this, não o clone) na mesma
  // chave, ANTES de original.call() criar o clone sem id — e limpar depois,
  // nos três desfechos possíveis (sucesso, erro, e o catch que relança).
  const ligarFluxoFn = fonte.slice(fonte.indexOf('export function ligarFluxo'), fonte.indexOf('/**\n * Corrige'));
  assert.match(ligarFluxoFn, /itensReaisPendentes\.set\(chave, this\);/);
  assert.match(ligarFluxoFn, /itensReaisPendentes\.delete\(chave\);[\s\S]*itensReaisPendentes\.delete\(chave\);/);
});

test('mensagens de chat de aparato não repetem "(lembrete)" — só a janela de configuração distingue', () => {
  const fonte = readFileSync(new URL('../../scripts/automacoes/engenhocas/index.mjs', import.meta.url), 'utf8');
  const aplicarEfeitos = fonte.slice(
    fonte.indexOf('function aplicarEfeitosDosAparatos'), fonte.indexOf('function conteudoResultadoAtivacao'));
  assert.doesNotMatch(aplicarEfeitos, /lembrete/);
  // A distinção manual/automático continua só no diálogo de Aparatos e no
  // diário — não é repetida a cada ativação no chat.
  assert.match(fonte, /<em>\$\{aparato\.manual \? 'lembrete' : 'automático'\}<\/em>/);
});

test('uma ativação em andamento bloqueia uma segunda antes de tocar o item', () => {
  const fonte = readFileSync(new URL('../../scripts/automacoes/engenhocas/index.mjs', import.meta.url), 'utf8');
  // A ativação fica aberta até 30 min esperando um possível rerrolar
  // (aguardarRerrolagem); sem trava, um segundo clique no meio disso faz duas
  // execuções lerem/gravarem o mesmo item ao mesmo tempo.
  assert.match(fonte, /const ativacoesEmAndamento = new Set\(\)/);
  assert.match(fonte, /if \(ativacoesEmAndamento\.has\(chave\)\)/);
  // .finally precisa estar no CHAMADOR (prepararAtivacao), não dentro de um
  // try/finally de executarAtivacao — senão libera assim que a função monta
  // o retorno, antes da promessa do rerrolar realmente resolver.
  assert.match(fonte,
    /return executarAtivacao\(item, real, configuracao\)\s*\n\s*\.finally\(\(\) => ativacoesEmAndamento\.delete\(chave\)\)/);
});

test('gravar estado e atualizar a mensagem não chamam .update()/.setFlag() sem uma referência com id', () => {
  const fonte = readFileSync(new URL('../../scripts/automacoes/engenhocas/index.mjs', import.meta.url), 'utf8');
  // Document#update faz `data._id = this.id` sem checar o valor; um item ou
  // mensagem sem `.id` vira o erro nativo "You must provide an _id...".
  assert.match(fonte, /if \(!real\?\.id\) \{/);
  assert.match(fonte, /if \(!message\?\.id\) return;/);
});
