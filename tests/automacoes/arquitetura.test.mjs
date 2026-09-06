import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const raiz = new URL('../../', import.meta.url);
const motor = await readFile(new URL('scripts/automacoes/motor.mjs', raiz), 'utf8');
const hooks = await readFile(new URL('scripts/automacoes/hooks.mjs', raiz), 'utf8');
const catalogo = await readFile(new URL('scripts/automacoes/catalogo.mjs', raiz), 'utf8');
const fachada = await readFile(new URL('t20-hayd-automacoes.mjs', raiz), 'utf8');

test('fachada pública continua exportando os controles de chat', () => {
  assert.match(fachada, /export\s*\{\s*injetarControlesAutomacao\s*\}/);
  assert.match(fachada, /scripts\/automacoes\/motor\.mjs/);
});

test('domínios declarativos e Seta Infalível estão fora do motor', () => {
  assert.match(motor, /from '\.\/catalogo\.mjs'/);
  assert.match(motor, /from '\.\/estado\.mjs'/);
  assert.match(motor, /from '\.\/seta-infalivel\.mjs'/);
  assert.doesNotMatch(motor, /function analisarDano\(/);
});

test('motor importa todos os leitores de estado que utiliza', () => {
  const importEstado = motor.match(/import\s*\{([^}]+)\}\s*from '\.\/estado\.mjs'/s)?.[1] ?? '';
  for (const nome of ['idAutomacao', 'definicaoDe', 'valorContador', 'automacoesPara', 'rotuloTipo']) {
    assert.match(importEstado, new RegExp(`\\b${nome}\\b`), `import ausente: ${nome}`);
  }
});

test('efeitos de uso sem gasto usam custo zero, nunca vazio', () => {
  assert.doesNotMatch(motor, /custo:\s*''/);
  assert.doesNotMatch(catalogo, /custo:\s*''/);
  assert.doesNotMatch(motor, /custo:\s*null/);
  assert.doesNotMatch(catalogo, /custo:\s*null/);
});

test('motor importa os elementos e alcances usados pelo Golpe Pessoal', () => {
  const importGolpe = motor.match(/import\s*\{([^}]+)\}\s*from '\.\/golpe-pessoal\/catalogo\.mjs'/s)?.[1] ?? '';
  assert.match(importGolpe, /\bGP_ELEMENTOS\b/);
  assert.match(importGolpe, /\bGP_ALCANCES\b/);
  assert.match(importGolpe, /\brotuloDano\b/);
  assert.match(importGolpe, /\brotuloAlcance\b/);
});

test('flags persistentes mantêm seus nomes publicados', () => {
  for (const flag of [
    'automacao', 'contador', 'automacaoOrigem', 'combinacoes',
    'msgRetroativa', 'combDebuff', 'condicoesDeCombinacao', 'golpe',
    'estudarAdversario', 'alvosDaRolagem'
  ]) assert.ok(motor.includes(`'${flag}'`), `flag ausente: ${flag}`);
});

test('Estudar o Adversário fica em domínio próprio e usa o índice no alvo', () => {
  assert.match(motor, /from '\.\/estudar-adversario\.mjs'/);
  // O cálculo do bônus não pode voltar para o motor
  assert.doesNotMatch(motor, /function bonusDoEstudo\(/);

  const alvo = hooks.slice(
    hooks.indexOf("Hooks.on('targetToken'"),
    hooks.indexOf("Hooks.on('updateCombat'")
  );
  assert.match(alvo, /sincronizarEstudos\(\)/);

  const sincronizador = hooks.slice(
    hooks.indexOf('const sincronizarEstudos'),
    hooks.indexOf("Hooks.on('targetToken'")
  );
  assert.match(sincronizador, /indiceEstudo\.listar\(\)/);
  assert.doesNotMatch(sincronizador, /for \(const ator of game\.actors\)/);
});

test('caminhos quentes de alvo e combate usam o índice', () => {
  const alvo = hooks.slice(hooks.indexOf("Hooks.on('targetToken'"), hooks.indexOf("Hooks.on('updateCombat'"));
  const combate = hooks.slice(hooks.indexOf("Hooks.on('updateCombat'"), hooks.indexOf("Hooks.on('createChatMessage'"));
  const sincronizador = hooks.slice(hooks.indexOf('const sincronizarAtores'), hooks.indexOf("Hooks.on('targetToken'"));
  assert.match(sincronizador, /indiceCombinacoes\.listar\(\)/);
  assert.match(alvo, /sincronizarAtores\(\)/);
  assert.doesNotMatch(alvo, /for \(const ator of game\.actors\)/);
  assert.match(combate, /sincronizarAtores\(\{ reaplicar: true \}\)/);
  assert.doesNotMatch(combate, /for \(const ator of game\.actors\)/);
});

test('Golpe Pessoal respeita o interruptor mundial dentro do wrapper', () => {
  const inicio = motor.indexOf('function ligarConjurador()');
  const fim = motor.indexOf('/* --- Construtor do golpe', inicio);
  assert.match(motor.slice(inicio, fim), /automacoesAtivas\(\) && configuracao/);
});

test('Golpe Pessoal substitui a configuração e elimina efeitos duplicados', () => {
  const inicio = motor.indexOf('async function sincronizarGolpe(item)');
  const fim = motor.indexOf('/** Ajusta o contador do Sequencial', inicio);
  const sincronizacao = motor.slice(inicio, fim);
  assert.match(sincronizacao, /efeitosPorChave\(ator, item\.id\)/);
  assert.match(sincronizacao, /principais\.slice\(1\)/);

  const construtor = motor.slice(
    motor.indexOf('async function abrirConstrutorGolpe(item)'),
    motor.indexOf('/* --- Uso do golpe', motor.indexOf('async function abrirConstrutorGolpe(item)'))
  );
  assert.match(construtor, /unsetFlag\(MODULE_ID, FLAG_GOLPE\)/);
  assert.match(construtor, /setFlag\(MODULE_ID, FLAG_GOLPE, salvo\)/);
});

test('o dano retroativo é corrigido antes das escritas de efeito', () => {
  // O número no cartão é o que a mesa está olhando. Deixado por último, atrás
  // de sincronizarCombinacoes e atualizarDebuffsAplicados (várias escritas de
  // banco), ele só subia um ou dois segundos depois do clique numa mesa
  // online.
  for (const nome of ['somarCombinacao', 'subtrairCombinacao']) {
    const inicio = motor.indexOf(`async function ${nome}(ator, chaveAlvo)`);
    assert.ok(inicio > 0, `não achei ${nome}`);
    const corpo = motor.slice(inicio, motor.indexOf('\n}', inicio));
    const retro = corpo.indexOf('atualizarMensagensRetroativas');
    const sync = corpo.indexOf('sincronizarCombinacoes');
    assert.ok(retro > 0 && sync > 0, `${nome} perdeu uma das chamadas`);
    assert.ok(retro < sync, `${nome} deve corrigir a mensagem antes de sincronizar efeitos`);
  }
});

test('a correção retroativa tem um dono só, e não depende de quem clicou', () => {
  // Editar a mensagem exige permissão NELA, não na ficha: outro dono do
  // personagem pode clicar no "+" e não conseguir corrigir o cartão alheio.
  // O autor assume enquanto está conectado; o Mestre ativo cobre o resto —
  // exatamente um cliente em cada caso, senão os dois escreviam por cima.
  const eleicao = motor.slice(
    motor.indexOf('function podeCorrigirMensagem(message)'),
    motor.indexOf('async function atualizarMensagensRetroativas'));
  assert.match(eleicao, /message\?\.author\?\.active/);
  assert.match(eleicao, /game\.user === game\.users\.activeGM/);
  assert.match(motor, /if \(!podeCorrigirMensagem\(message\)\) continue;/);
  assert.doesNotMatch(motor, /if \(!message\.isAuthor && !game\.user\.isGM\) continue;/);

  // Quem não clicou também precisa reagir: a contagem muda na ficha e o hook
  // roda em todos os clientes.
  assert.match(hooks, /s\.corrigirRetroativasDoAtor\(ator\)/);
});
