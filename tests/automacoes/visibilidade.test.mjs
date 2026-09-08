import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const raiz = new URL('../../', import.meta.url);
const motor = await readFile(new URL('scripts/automacoes/motor.mjs', raiz), 'utf8');
const hooks = await readFile(new URL('scripts/automacoes/hooks.mjs', raiz), 'utf8');
const runtime = await readFile(new URL('scripts/automacoes/runtime.mjs', raiz), 'utf8');

const trecho = (inicio, fim) => {
  const i = motor.indexOf(inicio);
  assert.ok(i > 0, `não achei: ${inicio}`);
  const f = motor.indexOf(fim, i);
  return motor.slice(i, f > 0 ? f : undefined);
};

/**
 * A contagem é informação de mesa: todo jogador vê. Mexer continua restrito a
 * quem é dono da ficha (o Foundry trata GM como OWNER, então o Mestre entra
 * junto). Se alguém voltar a barrar a injeção por `isOwner`, a mesa deixa de
 * enxergar os contadores sem ninguém perceber.
 */
test('a barra é injetada para quem não é dono da ficha', () => {
  const injecao = trecho('export function injetarControlesAutomacao', 'card.addEventListener');
  assert.doesNotMatch(injecao, /if \(!ator\?\.isOwner\) return;/,
    'a injeção não pode mais ser barrada por propriedade da ficha');
  assert.match(injecao, /if \(!ator\) return;/);
});

test('permissão é decidida por podeControlar, não por isOwner espalhado', () => {
  // Mora no runtime desde que as auras passaram a precisar dele: `aura/*` não
  // pode importar `motor.mjs` sem criar ciclo.
  assert.match(runtime, /export function podeControlar\(ator\)\s*\{\s*return !!ator\?\.isOwner;/);
  assert.match(motor, /podeControlar/, 'o motor continua consumindo a permissão');

  // Cada construtor de barra precisa consultar a permissão em algum ponto
  const construtores = {
    montarBarra: trecho('function montarBarra(item', '\n/**'),
    montarBarraCombinacoes: trecho('function montarBarraCombinacoes(ator', '\n/* ─'),
    montarBarraEstudo: trecho('function montarBarraEstudo(item', '\n/* ─'),
    montarBarraGolpe: trecho('function montarBarraGolpe(item', '/** Refaz as barras')
  };
  for (const [nome, corpo] of Object.entries(construtores)) {
    assert.match(corpo, /podeControlar\(/, `${nome} não consulta a permissão`);
  }
});

test('o clique é barrado no handler, não só escondendo o botão', () => {
  const handler = trecho("card.addEventListener('click'", 'const item = ator.items.get');
  assert.match(handler, /if \(!podeControlar\(ator\)\) return;/);
});

/**
 * Sem estes dois hooks o espectador veria o número congelado: quem clica
 * repinta só a própria tela.
 */
test('a mudança de contagem repinta a barra em todos os clientes', () => {
  const porItem = hooks.slice(
    hooks.indexOf("Hooks.on('updateItem'"),
    hooks.indexOf("Hooks.on('deleteItem'")
  );
  // O refresh precisa vir ANTES do filtro de "só quem agiu"
  const refresh = porItem.indexOf('atualizarRotulos');
  const filtro = porItem.indexOf('userId !== game.user.id');
  assert.ok(refresh > 0 && refresh < filtro,
    'atualizarRotulos precisa rodar antes do filtro de autoria');

  // O rótulo precisa ser achado pela BARRA: quem só assiste não tem botão,
  // e localizar o número através deles deixaria o valor dele congelado.
  const rotulos = trecho('function atualizarRotulos(item)', '/* ─');
  assert.match(rotulos, /\.t20g-contador-barra\[data-item-id=/);
  assert.doesNotMatch(rotulos, /\.t20g-auto-btn\[data-item-id=/);
  assert.match(rotulos, /if \(!def\?\.contador\) return;/,
    'sem esta guarda, item de outra automação teria o valor sobrescrito por +0');
  assert.match(motor, /barra\.className = 't20g-auto-barra t20g-contador-barra'/);

  assert.match(hooks, /Hooks\.on\('updateActor'/,
    'contagens de Combinação e Estudo vivem em flags do ator');
  const porAtor = hooks.slice(hooks.indexOf("Hooks.on('updateActor'"));
  assert.match(porAtor, /atualizarBarrasCombinacao/);
  assert.match(porAtor, /atualizarBarrasEstudo/);
  assert.doesNotMatch(porAtor.slice(0, porAtor.indexOf('});')), /userId/,
    'o repinte não pode ser restrito a quem fez a alteração');
});

/**
 * Contador de criatura do Mestre é efeito ativo dela: exibir "+5" no cartão
 * entregaria o que a chave "Efeitos ativos nas criaturas" esconde.
 */
test('a contagem de criatura do Mestre não vaza para jogador restrito', async () => {
  const segredos = await readFile(new URL('scripts/automacoes/segredos.mjs', raiz), 'utf8');
  const gmtools = await readFile(new URL('t20-hayd-gmtools.mjs', raiz), 'utf8');

  // O corte acontece antes de montar qualquer barra
  const injecao = trecho('export function injetarControlesAutomacao', 'const comControles');
  assert.match(injecao, /if \(ocultarContagemDe\(ator\)\) return;/);

  // Nomes do contrato do metagame — se um lado renomear, este teste quebra
  // antes de virar vazamento silencioso.
  for (const nome of ["'metagame'", "'ocultarSegredos'", "'npc'", "'hazard'", "'simple'"]) {
    assert.ok(segredos.includes(nome), `segredos.mjs perdeu ${nome}`);
    assert.ok(gmtools.includes(nome), `t20-hayd-gmtools.mjs perdeu ${nome}`);
  }

  // Caminho quente: só lê a configuração depois dos filtros baratos
  const tipos = segredos.indexOf('TIPOS_COM_SEGREDO.has');
  const restrito = segredos.indexOf('usuarioRestrito()', tipos);
  const leSetting = segredos.indexOf('opcoes()', restrito);
  assert.ok(tipos > 0 && restrito > tipos && leSetting > restrito,
    'ler a configuração precisa ser o último passo, não o primeiro');
});

/**
 * Para quem só assiste, `alvosMirados()` seria o alvo DELE, não o de quem
 * rolou. Mesmo para quem controla, reler a mira num repinte faria cartões
 * antigos mudarem enquanto o usuário navega entre inimigos.
 */
test('o alvo exibido fica congelado na mensagem até a troca explícita', () => {
  const corpoAlvos = trecho('function alvosDaBarra(', '/** Autor do cartão');
  assert.match(corpoAlvos, /return alvosDaMensagem\(message\)/);
  assert.doesNotMatch(corpoAlvos, /alvosMirados\(\)/,
    'repintar o cartão não pode reler a mira atual');

  for (const nome of ['montarBarraCombinacoes(ator', 'montarBarraEstudo(item']) {
    const corpo = trecho(`function ${nome}`, 'const barra = document.createElement');
    assert.match(corpo, /alvosDaBarra\(message\)/,
      `${nome} deve montar a lista de alvos por alvosDaBarra`);
    assert.doesNotMatch(corpo, /alvosMirados\(\)/,
      `${nome} não pode ler a mira de quem olha direto`);
    assert.match(corpo, /if \(!controla && !alvos\.length\) return null;/,
      `${nome} deve omitir a barra do espectador quando não há nada registrado`);
  }
});

test('autor e Mestre podem trocar o alvo persistido por exatamente um mirado', () => {
  const permissao = trecho('function podeTrocarAlvoDaMensagem(', '/** Substitui o alvo');
  assert.match(permissao, /podeControlar\(ator\)/);
  assert.match(permissao, /game\.user\.isGM \|\| message\?\.isAuthor/);

  const troca = trecho('async function trocarAlvoDaMensagem(', '/** Maior contagem');
  assert.match(troca, /if \(!podeTrocarAlvoDaMensagem\(message, ator\)\) return false/,
    'a permissão deve ser validada também no handler, não apenas no DOM');
  assert.match(troca, /if \(alvos\.length !== 1\)/);
  assert.match(troca, /message\.setFlag\(MODULE_ID, FLAG_ALVOS/,
    'a troca precisa ser persistida para todos os clientes');
  assert.match(troca, /tokens: \[alvos\[0\]\.id\]/,
    'a troca deve substituir, não acrescentar, o alvo');
  assert.match(troca, /migrarRetroativasParaAlvoDaMensagem\(message, ator, alvos\[0\]\.id\)/,
    'a troca visual também precisa migrar o alvo do dano retroativo');

  const linha = trecho('function montarLinhaTrocaAlvo(', '/** Substitui o alvo');
  assert.match(linha, /podeTrocarAlvoDaMensagem\(message, ator\)/);
  assert.match(linha, /dataset\[campoAcao\] = 'trocar-alvo'/);

  const barra = trecho('function montarBarraCombinacoes(ator', 'return barra;');
  assert.match(barra, /montarLinhaTrocaAlvo\(message, ator, alvos, 'acaoComb'\)/);
});

test('Estudar o Adversário também permite definir ou trocar o alvo do cartão', () => {
  const barra = trecho('function montarBarraEstudo(item', 'return barra;');
  assert.doesNotMatch(barra, /barra\.appendChild\(linha\);\s*return barra;\s*}/,
    'a barra sem alvo não pode retornar antes de montar o botão para defini-lo');
  assert.match(barra, /montarLinhaTrocaAlvo\(message, ator, alvos, 'acaoEstudo'\)/,
    'Estudar deve compartilhar a mesma ação de alvo das Combinações');

  const handler = trecho("card.addEventListener('click'", 'const item = ator.items.get');
  assert.match(handler, /botao\.dataset\.acaoEstudo === 'trocar-alvo'/);
  assert.match(handler, /await trocarAlvoDaMensagem\(message, ator\)/,
    'o botão de Estudo deve persistir o alvo para toda a mesa');
});

test('trocar ou definir alvo recalcula o dano e migra seu registro retroativo', () => {
  const migracao = trecho(
    'async function migrarRetroativasParaAlvoDaMensagem(',
    '/** É um termo numérico');

  assert.match(migracao, /reg\.mensagem === message\.id/,
    'somente registros pertencentes ao cartão trocado devem ser migrados');
  assert.match(migracao, /contagemAtual\(ator, chaveAlvo\)/,
    'o dano deve usar a contagem do novo alvo, inclusive quando o antigo era nulo');
  assert.match(migracao, /reescreverBonusNaMensagem\(message, reg, valorAtual\)/,
    'a troca precisa corrigir imediatamente o dano que já aparece no cartão');
  assert.match(migracao, /alvo: chaveAlvo/,
    'os próximos cliques devem acompanhar o novo alvo');
  assert.match(migracao, /valor: valorAtual/,
    'o registro deve partir do valor que foi aplicado ao cartão');
  assert.match(migracao, /ator\.setFlag\(MODULE_ID, FLAG_RETRO, registros\)/,
    'a migração precisa chegar aos demais clientes');
});

/**
 * O alvo mostrado no cartão é o de QUEM ROLOU: sem isso o Mestre abrindo o
 * ataque de um jogador via a própria seleção (quase sempre vazia) em vez do
 * oponente que o jogador mirou.
 */
test('o cartão guarda os alvos de quem rolou, não os de quem lê', () => {
  // Gravado no preCreate: nasce junto com a mensagem, sem escrita extra e
  // sem depender de quem estava conectado na hora.
  assert.match(hooks, /Hooks\.on\('preCreateChatMessage'/);
  assert.match(hooks, /s\.marcarAlvosDaRolagem\(message\)/);

  const corpo = trecho('export function marcarAlvosDaRolagem(', 'function alvosDaMensagem');
  assert.match(corpo, /message\.updateSource\(/,
    'os alvos precisam entrar na própria mensagem, antes dela ser gravada');
  assert.doesNotMatch(corpo, /if \(!tokens\.length\) return/,
    'nenhum alvo também deve ser persistido explicitamente como uma lista vazia');
  // Só os IDs: o nome sai de nomeDoToken na hora de desenhar, para o metagame
  // continuar mandando em quem lê o quê.
  assert.match(corpo, /tokens = alvosMirados\(\)\.map\(\(t\) => t\.id\)/);
  assert.match(motor,
    /function alvosDaMensagem\(message\) \{[\s\S]*nomeDoToken\(id, marca\?\.cena\)/,
    'o nome deve ser resolvido na cena persistida junto com o alvo');
});

test('mensagem sem alvo registra bônus retroativo zero e alvo nulo', () => {
  const registro = trecho('async function registrarMensagemRetroativa(', '/* --- Efeitos');
  assert.match(registro, /maiorContagemEntre\(ator, doCartao\)/,
    'o valor retroativo deve considerar somente os alvos persistidos no cartão');
  assert.doesNotMatch(registro, /maiorContagemMirada\(ator\)/,
    'a mira consultada depois da criação não pode preencher um cartão que nasceu sem alvo');
  assert.match(registro, /alvo: alvo\?\.id \?\? null/);
});
