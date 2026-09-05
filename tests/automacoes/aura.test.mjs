import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarEstado,
  aurasAtivas,
  raioEfetivo,
  dentroDoRaio,
  alvoElegivel,
  diferencaDeAlvos,
  curaDaAura,
  clampCura,
  desfazerCura,
  precisaAvisar,
  pedidoPendente
} from '../../scripts/automacoes/aura/regras.mjs';

/* ─── Raio ───────────────────────────────────────────────────────────────── */

test('raio usa o maior modificador, sem somar ampliações', () => {
  assert.equal(raioEfetivo(9, []), 9);
  assert.equal(raioEfetivo(9, [{ raio: 30 }]), 30);
  // Dois poderes de ampliação não viram 60
  assert.equal(raioEfetivo(9, [{ raio: 30 }, { raio: 18 }]), 30);
  // Modificador sem raio (Aura de Cura) não mexe no alcance
  assert.equal(raioEfetivo(9, [{ cura: { fixo: 5 } }]), 9);
  assert.equal(raioEfetivo(undefined, []), 0);
});

test('o limite do raio é inclusivo e tolera erro de ponto flutuante', () => {
  assert.equal(dentroDoRaio(9, 9), true, '9 m exatos estão dentro');
  assert.equal(dentroDoRaio(9.0000000001, 9), true, 'erro binário não pode excluir');
  assert.equal(dentroDoRaio(9.01, 9), false);
  assert.equal(dentroDoRaio(0, 9), true);
  assert.equal(dentroDoRaio(NaN, 9), false);
  assert.equal(dentroDoRaio(5, undefined), false);
});

/* ─── Elegibilidade ──────────────────────────────────────────────────────── */

test('só aliados entram; a fonte entra por ser a fonte', () => {
  const spec = { disposicoes: ['FRIENDLY'], incluirFonte: true };

  assert.equal(alvoElegivel({ disposicao: 'FRIENDLY' }, spec), true);
  assert.equal(alvoElegivel({ disposicao: 'HOSTILE' }, spec), false);
  assert.equal(alvoElegivel({ disposicao: 'NEUTRAL' }, spec), false);
  assert.equal(alvoElegivel({ disposicao: 'SECRET' }, spec), false);

  // A fonte entra mesmo que o token dela não seja "friendly"
  assert.equal(alvoElegivel({ disposicao: 'HOSTILE', ehFonte: true }, spec), true);
  assert.equal(alvoElegivel({ ehFonte: true }, { incluirFonte: false }), false);

  assert.equal(alvoElegivel(null, spec), false);
});

test('token escondido fica de fora, salvo se a aura disser o contrário', () => {
  assert.equal(alvoElegivel({ disposicao: 'FRIENDLY', oculto: true }, {}), false);
  assert.equal(alvoElegivel({ disposicao: 'FRIENDLY', oculto: true }, { ocultos: true }), true);
});

/* ─── Diferença de alvos ─────────────────────────────────────────────────── */

test('só mexe em quem entrou ou saiu da área', () => {
  const d = diferencaDeAlvos(['a', 'b', 'c'], ['b', 'c', 'd']);
  assert.deepEqual(d.criar, ['d']);
  assert.deepEqual(d.manter, ['b', 'c']);
  assert.deepEqual(d.remover, ['a']);
});

test('nada mudou = nada a criar nem remover', () => {
  const d = diferencaDeAlvos(['a', 'b'], ['a', 'b']);
  assert.deepEqual(d.criar, []);
  assert.deepEqual(d.remover, []);
  assert.deepEqual(d.manter, ['a', 'b']);
});

test('alvo repetido e valor vazio não viram trabalho duplicado', () => {
  const d = diferencaDeAlvos([null, 'a'], ['a', 'a', undefined, 'b']);
  assert.deepEqual(d.criar, ['b']);
  assert.deepEqual(d.manter, ['a']);
  assert.deepEqual(d.remover, []);
});

/* ─── Cura ───────────────────────────────────────────────────────────────── */

test('cura é o fixo do poder mais o atributo da fonte', () => {
  const mod = { cura: { fixo: 5, atributo: 'car' } };
  assert.equal(curaDaAura(mod, 4), 9);
  assert.equal(curaDaAura(mod, 0), 5);
  assert.equal(curaDaAura(mod, -3), 2);
  // Sem o poder de cura não há cura nenhuma
  assert.equal(curaDaAura({ raio: 30 }, 4), 0);
  assert.equal(curaDaAura(undefined, 4), 0);
});

test('cura respeita o PV máximo e informa o ganho real', () => {
  assert.deepEqual(clampCura(10, 30, 9), { novo: 19, ganho: 9 });
  assert.deepEqual(clampCura(28, 30, 9), { novo: 30, ganho: 2 }, 'trava no máximo');
  assert.deepEqual(clampCura(30, 30, 9), { novo: 30, ganho: 0 }, 'já cheio não ganha nada');
  assert.deepEqual(clampCura(-5, 30, 9), { novo: 4, ganho: 9 }, 'PV negativo sobe normalmente');
});

test('desfazer devolve o ganho e nunca leva abaixo de zero', () => {
  assert.equal(desfazerCura(19, 9), 10);
  assert.equal(desfazerCura(30, 2), 28);
  assert.equal(desfazerCura(3, 9), 0, 'não passa para negativo');
  assert.equal(desfazerCura(19, 0), 19);
});

/* ─── Lembrete de sustentar ──────────────────────────────────────────────── */

test('o lembrete não repete na mesma rodada, mas volta na seguinte', () => {
  const contexto = { combate: 'c1', rodada: 3 };
  assert.equal(precisaAvisar(null, contexto), true, 'nunca avisado');

  const avisado = { aviso: { combate: 'c1', rodada: 3 } };
  assert.equal(precisaAvisar(avisado, contexto), false, 'vai e volta do turno não duplica');
  assert.equal(precisaAvisar(avisado, { combate: 'c1', rodada: 4 }), true);
  assert.equal(precisaAvisar(avisado, { combate: 'c2', rodada: 3 }), true, 'outro encontro avisa');
});

/* ─── Canal pedido/feito ─────────────────────────────────────────────────── */

test('pedido já executado não roda de novo (corta o laço de updateActor)', () => {
  assert.equal(pedidoPendente({ pedido: { id: 'x', tipo: 'cura' }, feito: null })?.tipo, 'cura');
  assert.equal(pedidoPendente({ pedido: { id: 'x' }, feito: 'x' }), null, 'mesmo id = já feito');
  assert.equal(pedidoPendente({ pedido: { id: 'y' }, feito: 'x' })?.id, 'y', 'pedido novo roda');
  assert.equal(pedidoPendente({ feito: 'x' }), null);
  assert.equal(pedidoPendente(null), null);
});

/* ─── Estado ─────────────────────────────────────────────────────────────── */

test('estado ausente ou corrompido não explode', () => {
  assert.equal(normalizarEstado(null), null);
  assert.equal(normalizarEstado('lixo'), null);
  assert.deepEqual(normalizarEstado({}).aviso, null);
  assert.equal(normalizarEstado({ aviso: { combate: 'c1', rodada: 'x' } }).aviso.rodada, null);
  assert.deepEqual(aurasAtivas(null), []);
  assert.deepEqual(aurasAtivas({ i1: null }), []);
});

test('cada item da ficha carrega a própria aura', () => {
  const ativas = aurasAtivas({
    i1: { id: 'aura-sagrada', cena: 's1' },
    i2: { id: 'outra-aura', cena: 's1' }
  });
  assert.equal(ativas.length, 2);
  assert.deepEqual(ativas.map((a) => a.itemId).sort(), ['i1', 'i2']);
});

/* ─── Contrato de arquitetura ────────────────────────────────────────────── */

test('a geometria fica no domínio, não no motor', async () => {
  const { readFile } = await import('node:fs/promises');
  const raiz = new URL('../../', import.meta.url);
  const motor = await readFile(new URL('scripts/automacoes/motor.mjs', raiz), 'utf8');
  const alcance = await readFile(new URL('scripts/automacoes/aura/alcance.mjs', raiz), 'utf8');

  // Medir distância e testar parede não podem voltar para o motor
  assert.doesNotMatch(motor, /testCollision\(/);
  assert.doesNotMatch(motor, /function tokensNaAura\(/);
  assert.match(alcance, /testCollision\(/);
  assert.match(alcance, /getOccupiedGridSpaceOffsets/);

  // A área mede pela régua padrão do próprio Tormenta20 — a grade REAL da
  // cena, com a diagonal dobrada de verdade — não a grade espelhada sem
  // diagonal do módulo, e não distância reta (a diagonal dobrada faz a área
  // real ser um losango, não um círculo).
  assert.doesNotMatch(alcance, /from '\.\.\/\.\.\/grade\.mjs'/);
  assert.doesNotMatch(alcance, /Math\.hypot\(/);
  assert.match(alcance, /\.measurePath\(/);

  // A régua opcional continua com a própria regra de diagonal, intacta
  const regua = await readFile(new URL('t20-hayd-regua.mjs', raiz), 'utf8');
  assert.match(regua, /from '\.\/scripts\/grade\.mjs'/);
  assert.doesNotMatch(regua, /function gradeSemDiagonal\(/,
    'a régua não pode ter a própria cópia da regra de diagonal');
});

test('as flags persistentes da aura estão travadas', async () => {
  const { readFile } = await import('node:fs/promises');
  const raiz = new URL('../../scripts/automacoes/', import.meta.url);
  const estado = await readFile(new URL('aura/estado.mjs', raiz), 'utf8');
  const efeitos = await readFile(new URL('aura/efeitos.mjs', raiz), 'utf8');
  const chat = await readFile(new URL('aura/chat.mjs', raiz), 'utf8');

  assert.match(estado, /'auras'/);
  assert.match(efeitos, /'auraEfeito'/);
  assert.match(chat, /'auraCura'/);
});

test('só o Mestre ativo escreve, e os gatilhos saem cedo sem aura ligada', async () => {
  const { readFile } = await import('node:fs/promises');
  const raiz = new URL('../../scripts/automacoes/', import.meta.url);
  const index = await readFile(new URL('aura/index.mjs', raiz), 'utf8');
  const hooks = await readFile(new URL('hooks.mjs', raiz), 'utf8');

  // Escrever efeito em ficha de outro jogador exige o Mestre
  assert.match(index, /souGmAtivo\(\)/);
  // Rajada de movimento/parede não pode virar dezenas de escritas
  assert.match(index, /debounce\(/);

  // O gatilho de cena morre antes de qualquer trabalho quando não há aura
  const gatilho = hooks.slice(
    hooks.indexOf('const aoMexerNaCena'),
    hooks.indexOf("Hooks.on('getItemSheetHeaderButtons'")
  );
  assert.match(gatilho, /if \(!automacoesAtivas\(\) \|\| !s\.aura\.existeAlguma\(\)\) return;/);
  // Geometria e ficha: três laços de infraestrutura, não um hook por poder
  assert.match(gatilho, /'createToken', 'deleteToken'/);
  assert.match(gatilho, /'createWall', 'updateWall', 'deleteWall'/);
  assert.match(gatilho, /'createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect'/);
});

test('a posição vem de _source, nunca da que a animação está interpolando', async () => {
  const { readFile } = await import('node:fs/promises');
  const raiz = new URL('../../scripts/automacoes/', import.meta.url);
  const alcance = await readFile(new URL('aura/alcance.mjs', raiz), 'utf8');

  // A animação de movimento escreve as coordenadas interpoladas DENTRO do
  // documento (Token##animateFrame faz mergeObject(this.document, ...)), então
  // `doc.x` no meio de um passo ainda é quase a posição anterior. Ler daí era
  // o que fazia o bônus entrar e sair só no movimento seguinte.
  assert.match(alcance, /function posicaoGravada\(doc\)/);
  assert.match(alcance, /doc\?\._source/);

  // Nenhuma medição pode voltar a ler a posição animada
  assert.doesNotMatch(alcance, /token\?\.center|fonte\.center|origem\.center|alvo\.center/,
    'center do placeable é derivado da posição animada do documento');
  assert.match(alcance, /getOccupiedGridSpaceOffsets\?\.\(posicao\)/,
    'os quadrados ocupados precisam ser calculados na posição gravada');
  assert.match(alcance, /getCenterPoint\?\.\(posicao\)/);
});

test('a fonte é lida do token vivo da cena, não da instância do índice', async () => {
  const { readFile } = await import('node:fs/promises');
  const raiz = new URL('../../scripts/automacoes/', import.meta.url);
  const efeitos = await readFile(new URL('aura/efeitos.mjs', raiz), 'utf8');

  // Token não vinculado tem ator sintético: a cópia guardada no índice fica
  // velha depois de um movimento, e a área sairia medida na posição anterior
  // (o "andei uma vez e não valeu, andei de novo e valeu").
  assert.match(efeitos, /function tokenVivoDaFonte\(/);
  assert.match(efeitos, /canvas\?\.tokens\?\.get\(estado\.token\)/);
  assert.doesNotMatch(efeitos, /fonte\.token\?\.object/,
    'nenhum caminho pode voltar a confiar na instância do índice');
});

test('a prévia pinta os quadrados do efeito, com o mesmo recorte de parede', async () => {
  const { readFile } = await import('node:fs/promises');
  const raiz = new URL('../../scripts/automacoes/', import.meta.url);
  const desenho = await readFile(new URL('aura/desenho.mjs', raiz), 'utf8');
  const alcance = await readFile(new URL('aura/alcance.mjs', raiz), 'utf8');
  const hooks = await readFile(new URL('hooks.mjs', raiz), 'utf8');

  // Losango, não círculo: quadrado a quadrado, pela mesma função do efeito
  assert.match(alcance, /export function quadradosNaAura\(/);
  assert.match(desenho, /quadradosNaAura\(/);
  assert.match(desenho, /highlightPosition\(/);
  assert.doesNotMatch(desenho, /drawCircle\(/);

  // Quadrado atrás de parede não é pintado
  assert.match(alcance, /spec\?\.bloqueavel && pontoBloqueado\(/);

  // Cosmético: não grava documento, e não é privilégio do Mestre
  assert.doesNotMatch(desenho, /\.(create|update|delete)Embedded[A-Za-z]*\(/);
  assert.doesNotMatch(desenho, /souGmAtivo|isGM/);
  assert.match(hooks, /Hooks\.on\('hoverToken'/);
});

test('ligar ou cancelar repinta o cartão do chat na hora', async () => {
  const { readFile } = await import('node:fs/promises');
  const raiz = new URL('../../scripts/automacoes/', import.meta.url);
  const motor = await readFile(new URL('motor.mjs', raiz), 'utf8');
  const hooks = await readFile(new URL('hooks.mjs', raiz), 'utf8');

  // O estado da aura é flag do ator: sem repintar, o botão só mudaria quando
  // o jogador reenviasse o poder para o chat.
  assert.match(motor, /function atualizarBarrasAura\(ator\)/);
  assert.match(motor, /botao\.dataset\.acao = resumo\.ativa \? 'aura-cancelar' : 'aura-ativar'/);
  assert.match(hooks, /s\.atualizarBarrasAura\(ator\)/);
});

test('manter a aura desconta o PM de quem sustenta', async () => {
  const { readFile } = await import('node:fs/promises');
  const raiz = new URL('../../scripts/automacoes/', import.meta.url);
  const index = await readFile(new URL('aura/index.mjs', raiz), 'utf8');
  const chat = await readFile(new URL('aura/chat.mjs', raiz), 'utf8');
  const lang = JSON.parse(await readFile(
    new URL('../../lang/pt-BR.json', import.meta.url), 'utf8'));

  assert.match(index, /system\.attributes\.pm\.value/);
  // Sem PM sobrando a aura NÃO cai sozinha: o módulo não encerra poder
  assert.match(index, /faltou: Math\.max\(0, custo - antes\)/);
  assert.match(chat, /AuraManteveSemPM/);

  const chaves = lang['T20HaydGMTools'] ?? lang;
  for (const k of ['AuraManteveTexto', 'AuraManteveSemPM', 'AuraManteveSemDesconto']) {
    assert.ok(chaves[k], `falta a chave ${k}`);
  }
  assert.doesNotMatch(chaves.AuraLembreteTexto, /não desconta/,
    'o texto do lembrete precisa acompanhar a mudança de regra');
});

test('o valor acompanha o Carisma da fonte sem depender de alguém andar', async () => {
  const { readFile } = await import('node:fs/promises');
  const hooks = await readFile(
    new URL('../../scripts/automacoes/hooks.mjs', import.meta.url), 'utf8');

  // Magia de atributo (ou edição na ficha) muda `system`, não flag nossa: sem
  // este gatilho o bônus só acertava no próximo movimento de alguém na área.
  assert.match(hooks, /if \(mudancas\?\.system\) aoMexerNaCena\(\);/);
});

test('curar de novo exige confirmação, e dá para reverter tudo de uma vez', async () => {
  const { readFile } = await import('node:fs/promises');
  const raiz = new URL('../../scripts/automacoes/', import.meta.url);
  const chat = await readFile(new URL('aura/chat.mjs', raiz), 'utf8');
  const index = await readFile(new URL('aura/index.mjs', raiz), 'utf8');
  const lang = JSON.parse(await readFile(
    new URL('../../lang/pt-BR.json', import.meta.url), 'utf8'));

  // Botão vira "já aplicada"; repetir passa por confirmação
  assert.match(chat, /FLAG_CURA_FEITA = 'auraCuraFeita'/);
  assert.match(chat, /export async function marcarCuraAplicada\(/);
  assert.match(chat, /jaCurou\(message, botao\) && !await confirmarRepetir\(\)/);
  // Quem reescreve é o Mestre: ele publicou a mensagem
  assert.match(index, /chat\.marcarCuraAplicada\(pendente\.mensagem\)/);

  // Reverter tudo, além do desfazer individual
  assert.match(index, /async function desfazerTudo\(message\)/);
  assert.match(chat, /data-aura-acao="desfazer-tudo"/);
  assert.match(chat, /acao === 'desfazer' \|\| acao === 'desfazer-tudo'/);

  // O trecho reescrito é delimitado por comentário, não por </div>: o corpo
  // tem div aninhada e o regex comeria a tag errada.
  assert.match(chat, /MARCA = \{ abre: '<!--t20g-cura-->'/);

  const chaves = lang['T20HaydGMTools'] ?? lang;
  for (const k of ['AuraCuraJaAplicada', 'AuraCuraRepetirTitulo',
    'AuraCuraRepetirTexto', 'AuraCuraDesfazerTudo']) {
    assert.ok(chaves[k], `falta a chave ${k}`);
  }
});

test('o efeito no aliado tem duração só para virar ícone, mas quem remove é a geometria', async () => {
  const { readFile } = await import('node:fs/promises');
  const raiz = new URL('../../scripts/automacoes/', import.meta.url);
  const efeitos = await readFile(new URL('aura/efeitos.mjs', raiz), 'utf8');

  // Sem isto o T20 classifica o efeito como passivo e nenhum ícone aparece
  // no token — foi validado à mão pelo usuário antes deste teste existir.
  assert.match(efeitos, /duration:\s*\{\s*rounds:\s*999\s*\}/);
  // O número é só cosmético: sair da área continua removendo o efeito,
  // nunca a contagem de rodadas expirando sozinha.
  assert.match(efeitos, /sincronizarAura/);
});

test('um ator nunca pode ficar com dois efeitos da mesma aura', async () => {
  const { readFile } = await import('node:fs/promises');
  const raiz = new URL('../../scripts/automacoes/', import.meta.url);
  const efeitos = await readFile(new URL('aura/efeitos.mjs', raiz), 'utf8');

  // Bug relatado: arrastar a fonte por mais tempo que o debounce disparava
  // duas sincronizações sobrepostas, cada uma vendo "ainda não tem efeito" e
  // criando um cada — o aliado ficava com dois, somando bônus em dobro.
  // efeitosDaAura agora agrupa por ator e apaga toda duplicata, mantendo só
  // uma; os dois pontos que a chamam (sincronizarAura e limparAura) esperam
  // essa limpeza terminar antes de decidir o que criar/remover.
  const efeitosDaAura = efeitos.slice(
    efeitos.indexOf('async function efeitosDaAura'), efeitos.indexOf('/** Dados do efeito'));
  assert.match(efeitosDaAura, /porAtor\.get\(ator\.uuid\)\.push/);
  assert.match(efeitosDaAura, /for \(const \{ efeito \} of duplicatas\) await efeito\.delete\(\)/);
  assert.match(efeitos, /const existentes = await efeitosDaAura\(fonte\.id, item\.id\);/);
  assert.match(efeitos, /const existentes = await efeitosDaAura\(fonteId, itemId\);/);
});

test('duas rodadas de recalcular() nunca correm ao mesmo tempo', async () => {
  const { readFile } = await import('node:fs/promises');
  const raiz = new URL('../../scripts/automacoes/', import.meta.url);
  const index = await readFile(new URL('aura/index.mjs', raiz), 'utf8');

  // Causa raiz da corrida acima: um arrasto mais longo que os 100ms do
  // debounce dispara recalcular() de novo antes do anterior terminar de
  // gravar. Enquanto uma rodada está em `_executando`, a próxima só fica
  // pendente e roda depois — nunca em paralelo com a que ainda está de pé.
  const dispararRecalculo = index.slice(
    index.indexOf('function dispararRecalculo'), index.indexOf('export function agendarRecalculo'));
  assert.match(dispararRecalculo, /if \(_executando\) \{\s*\n\s*_pendente = true;\s*\n\s*return;/);
  assert.match(dispararRecalculo, /_executando = recalcular\(\)/);
  assert.match(index, /_agendado \?\?= foundry\.utils\.debounce\(dispararRecalculo, 100\);/);
});

