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
    'estudarAdversario', 'alvosDaRolagem', 'resistenciaResultado'
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

test('efeitos dependentes da mira são sincronizados antes de qualquer rolagem', () => {
  const preparacao = motor.slice(
    motor.indexOf('async function sincronizarMiraAntesDaRolagem('),
    motor.indexOf('/** Instala a barreira'));
  assert.match(preparacao, /sincronizarCombinacoes\(ator\)/,
    'Combinações precisam refletir alvo nenhum como contagem zero');
  assert.match(preparacao, /sincronizarEstudo\(ator\)/,
    'Estudar o Adversário deve seguir a mesma regra de alvo explícito');

  const wrapper = motor.slice(
    motor.indexOf('function ligarSincronizacaoDaMira()'),
    motor.indexOf('/**\n * Enxerta a conjuração'));
  const sincroniza = wrapper.indexOf('sincronizarMiraAntesDaRolagem(this)');
  const rola = wrapper.indexOf('original.apply(this, args)');
  assert.ok(sincroniza > 0 && rola > sincroniza,
    'a sincronização deve terminar antes de o sistema copiar/aplicar os efeitos');
  assert.match(motor, /Hooks\.once\('ready',[\s\S]*ligarSincronizacaoDaMira\(\)/);
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

test('automações que substituem a mecânica do poder oferecem apagar os efeitos originais', () => {
  // As famílias que o usuário pediu: 5 poderes soltos + a base das Combinações
  // (que se espalha em todos os poderes de Combinação e no Mestre das Combinações).
  const marcadas = (catalogo.match(/^\s*apagarEfeitos:\s*true/gm) || []).length;
  assert.ok(marcadas >= 6, `esperava >=6 marcações de apagarEfeitos no catálogo, achei ${marcadas}`);
  for (const bloco of ['sangue-dos-inimigos', 'sanguinario', 'sequencia-de-golpes',
    'estudar-o-adversario', 'aura-sagrada']) {
    const i = catalogo.indexOf(`'${bloco}':`) >= 0
      ? catalogo.indexOf(`'${bloco}':`)
      : catalogo.indexOf(`${bloco}:`);
    const fim = catalogo.indexOf('\n  },', i);
    assert.match(catalogo.slice(i, fim), /apagarEfeitos:\s*true/, `${bloco} sem apagarEfeitos`);
  }

  // O motor consulta a flag, mostra a lista e só apaga com confirmação.
  assert.match(motor, /def\?\.apagarEfeitos/);
  assert.match(motor, /sugerirApagarEfeitosOriginais\(item, AUTOMACOES\[escolha\]\)/);
  assert.match(motor, /item\.deleteEmbeddedDocuments\('ActiveEffect'/);
  // Nunca automático: precisa passar pela resposta do diálogo.
  const fn = motor.slice(
    motor.indexOf('async function sugerirApagarEfeitosOriginais('),
    motor.indexOf('/* ─── Automações de ação'));
  assert.match(fn, /if \(resposta !== 'apagar'\) return;/);
  assert.match(fn, /\[\.\.\.\(item\.effects \?\? \[\]\)\]/, 'deve olhar os efeitos do próprio item');
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

test('o botão de resistência funciona mesmo sem nenhuma automação configurada no item', () => {
  // Não é uma automação por poder — não pode ficar atrás do early-return de
  // injetarControlesAutomacao (comControles/combinacoes/estudos vazios),
  // senão uma Bola de Fogo comum, sem nada configurado, nunca ganharia o
  // botão.
  const inicio = motor.indexOf('export function injetarControlesAutomacao');
  const fimAutomacao = motor.indexOf(
    'if (!comControles.length && !combinacoes.length && !estudos.length) return;', inicio);
  const inicioResist = motor.indexOf('export function injetarBotaoResistencia');
  assert.ok(inicio > 0 && fimAutomacao > inicio, 'não achei o early-return de injetarControlesAutomacao');
  assert.ok(inicioResist > 0 && (inicioResist < inicio || inicioResist > fimAutomacao + 200),
    'injetarBotaoResistencia precisa ser uma função própria, fora de injetarControlesAutomacao');

  assert.match(hooks, /s\.injetarBotaoResistencia\(message, container\)/);
});

test('cartões de ameaças resolvem primeiro o ator sintético do token', () => {
  // Tokens não vinculados compartilham o actorId do ator-base, mas podem ter
  // itens próprios no ActorDelta. Consultar game.actors primeiro encontra um
  // ator válido e impede o fallback, embora nele não exista a habilidade que
  // gerou o cartão — exatamente o caso em que "Rolar Reflexos" desaparecia.
  const corpo = motor.slice(
    motor.indexOf('function atorDoCard'),
    motor.indexOf('/** Cria um botão de ação da barra.', motor.indexOf('function atorDoCard')));
  const speaker = corpo.indexOf('message?.speaker');
  const tokenActor = corpo.indexOf('tokens.get(tokenId)?.actor');
  const baseActor = corpo.indexOf('game.actors.get(actorId)');

  assert.ok(speaker >= 0 && tokenActor > speaker, 'não resolveu o ator pelo speaker do token');
  assert.ok(baseActor > tokenActor,
    'o ator-base só pode ser consultado depois do ator sintético do token');
});

test('o teste de resistência rola nos tokens SELECIONADOS, não nos mirados', () => {
  // O fluxo é "Mestre seleciona os 4 goblins e clica" — seleção de canvas
  // (canvas.tokens.controlled), não mira de alvo (game.user.targets), que é
  // outro conceito já usado por Combinações/Estudo.
  const corpo = motor.slice(
    motor.indexOf('async function rolarTesteResistencia'),
    motor.indexOf('async function anotarResultadoResistencia'));
  assert.match(corpo, /canvas\?\.tokens\?\.controlled/);
  assert.match(corpo, /\.filter\(\(a\) => a\?\.isOwner\)/);
  assert.doesNotMatch(corpo, /alvosMirados\(\)/);

  // Sem nada selecionado, cai pro personagem vinculado do usuário — só pede
  // seleção como último recurso, quando nem isso existe.
  assert.match(corpo, /game\.user\?\.character/);

  // O `event` do clique precisa chegar inteiro no rollPericia: é o shiftKey
  // dele que decide (regra do próprio sistema) se abre a janela de uso ou
  // rola direto — reinventar essa checagem aqui divergiria da rolagem normal
  // de perícia do jogador.
  assert.match(corpo, /rollPericia\(chave, \{ event: ev \}\)/);
});

test('o resultado do teste de resistência é só para o Mestre', () => {
  const corpo = motor.slice(
    motor.indexOf('async function anotarResultadoResistencia'),
    motor.indexOf('export function injetarBotaoResistencia'));
  assert.match(corpo, /data-gm-only="1"/);
  assert.match(corpo, /passouNoTeste\(total, cd\)/);

  // A marca precisa sumir do DOM de quem não é Mestre antes da tela pintar —
  // mesmo mecanismo que o metagame já usa para esconder segredo de rolagem.
  assert.match(hooks, /if \(container && !game\.user\.isGM\) \{\s*\n\s*container\.querySelectorAll\('\[data-gm-only\]'\)\.forEach/);
});

test('o botão de resistência é largo, como o "Colocar Área de Efeito" nativo', () => {
  const corpo = motor.slice(
    motor.indexOf('export function injetarBotaoResistencia'),
    motor.indexOf('/**\n * Barra de contagem das Combinações'));
  assert.match(corpo, /testesCitados\(item\?\.system\?\.resistencia\?\.txt\)/);
  assert.match(corpo, /criarBotao\(item, 'resistencia',[\s\S]*\{ largo: true, dataset: \{ chave \} \}\)/);
  assert.match(corpo, /criarBotao\(item, 'resistencia', 'fa-dice-d20', null,/,
    'o botão de resistência não deve criar data-tooltip');
  assert.doesNotMatch(corpo, /ResistDica/);
  // `.t20g-auto-barra` é flex-column: sem envolver o botão numa
  // `.t20g-auto-linha` (flex-row, como todo outro botão largo do módulo), o
  // botão vira filho direto da coluna em vez de uma linha — mesma classe,
  // mas fora do layout que o resto do chat usa.
  assert.match(corpo, /linha\.appendChild\(botao\);\s*\n\s*barra\.appendChild\(linha\);/);
});

test('o botão de resistência entra logo abaixo do conteúdo nativo, não junto das automações do item', () => {
  // Pedido explícito: não pode ficar no mesmo nível de Aparatos/contadores —
  // nada a ver com essa funcionalidade. `ultimoElementoNativo` acha o último
  // filho do cartão que NÃO é um `.t20g-auto-barra` (ou seja, é nativo — o
  // footer do "Colocar Área de Efeito", de aplicar efeito, ou o que houver)
  // e insere logo depois dele, empurrando tudo que já era nosso pra baixo.
  const funcao = motor.slice(
    motor.indexOf('function ultimoElementoNativo'),
    motor.indexOf('export function injetarBotaoResistencia'));
  assert.match(funcao, /!filhos\[i\]\.classList\.contains\('t20g-auto-barra'\)/);

  const corpo = motor.slice(
    motor.indexOf('export function injetarBotaoResistencia'),
    motor.indexOf('/**\n * Barra de contagem das Combinações'));
  assert.match(corpo, /let ancora = ultimoElementoNativo\(card\);/);
  assert.match(corpo, /ancora\.insertAdjacentElement\('afterend', barra\)/);
  assert.doesNotMatch(corpo, /card\.appendChild\(barra\);\s*\n\s*\}\s*\n\}/,
    'não pode voltar a só jogar a barra no fim do cartão');
});

test('o botão de resistência usa a mesma fonte do cartão, sem o tamanho fixo dos outros botões largos', async () => {
  // O "Colocar Área de Efeito" nativo não define fonte própria nenhuma — ele
  // herda a do cartão. Os outros botões largos do módulo (Aparatos,
  // Reaplicar…) têm 0.85em fixo; ao lado de um botão nativo isso destoaria.
  const css = await readFile(new URL('t20-hayd-gmtools.css', raiz), 'utf8');
  const marca = '.tormenta20.chat-card .t20g-resist-barra button.t20g-auto-btn.t20g-auto-btn-largo {';
  assert.ok(css.includes(marca), 'não achei a regra de fonte do botão de resistência');
  const regra = css.slice(css.indexOf(marca), css.indexOf('}', css.indexOf(marca)));
  assert.match(regra, /font:\s*inherit/);
});
