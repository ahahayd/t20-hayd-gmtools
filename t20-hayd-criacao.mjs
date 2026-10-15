/**
 * T20 Hayd GMTools — Assistente de Criação de Personagem.
 *
 * Ponto de entrada isolado (importado de t20-hayd-gmtools.mjs, não listado em
 * module.json) para hot-reload, mesmo padrão do Gerador de Tesouros.
 *
 * Quando o assistente aparece:
 *  - ao criar um Personagem de Jogador novo, para quem o criou (o Mestre
 *    escolhe se vale para todos, só para jogadores ou nunca);
 *  - pelo botão "Criar personagem" no cabeçalho da ficha, enquanto ela não
 *    tiver raça nem classe e o assistente não tiver sido concluído;
 *  - pela API: game.modules.get('t20-hayd-gmtools').api.criacao.abrir(ator).
 */
import { MODULE_ID } from './scripts/criacao/fontes.mjs';
import { registrarConfiguracaoFontes } from './scripts/criacao/fontes.mjs';
import { atalhoDeMenu } from './scripts/atalho-menu.mjs';
import { abrirFontesCriacao } from './scripts/criacao/app-fontes.mjs';
import { abrirAssistenteCriacao, TEMPLATES_CRIACAO } from './scripts/criacao/app-assistente.mjs';
import { FLAG_CONCLUIDA } from './scripts/criacao/aplicar.mjs';
import { abrirPlanejadorNiveis, TEMPLATES_NIVEIS } from './scripts/niveis/app-niveis.mjs';

/**
 * A ficha ainda está "em branco" para o assistente? Sem raça, sem classe e
 * sem uma criação concluída — um personagem pronto, importado ou feito à mão
 * nunca recebe o botão.
 */
export function precisaCriacao(actor) {
  if (actor?.type !== 'character' || modoAssistente() === 'desligado') return false;
  if (actor.getFlag(MODULE_ID, FLAG_CONCLUIDA)) return false;
  return !actor.items.some(i => i.type === 'race' || i.type === 'classe');
}

function ligado(chave) {
  try { return game.settings.get(MODULE_ID, chave) !== false; } catch { return true; }
}

/** O assistente desligado no mundo conta como o antigo modo "desligado". */
function modoAssistente() {
  if (!ligado('criacaoAtivo')) return 'desligado';
  try { return game.settings.get(MODULE_ID, 'criacaoAoCriar'); } catch { return 'todos'; }
}

/** O planejador de níveis está ligado no mundo? */
export function niveisAtivo() {
  return ligado('niveisAtivo');
}

/** Fichas de personagem abertas redesenham (o cabeçalho troca os botões). */
function redesenharFichas() {
  for (const app of Object.values(ui.windows)) if (app.actor?.type === 'character') app.render();
}

Hooks.once('init', () => {
  registrarConfiguracaoFontes();

  game.settings.register(MODULE_ID, 'criacaoAtivo', {
    name: 'Assistente de Criação de Personagem',
    hint: 'Conduz a criação do personagem pelas etapas do livro. Desligado, a ficha em branco volta a ter o botão "Definir Atributos" de antes.',
    scope: 'world', config: true, type: Boolean, default: true,
    onChange: redesenharFichas
  });

  game.settings.register(MODULE_ID, 'niveisAtivo', {
    name: 'Planejador de Níveis',
    hint: 'O botão "Níveis" no cabeçalho da ficha, para planejar e subir de nível.',
    scope: 'world', config: true, type: Boolean, default: true,
    onChange: redesenharFichas
  });

  game.settings.register(MODULE_ID, 'criacaoAoCriar', {
    name: 'Quando o assistente aparece',
    hint: 'A ficha em branco (sem raça nem classe) sempre mostra o botão "Criar personagem" no cabeçalho; aqui você escolhe se ele também abre sozinho.',
    scope: 'world', config: true, type: String, default: 'todos',
    choices: {
      todos: 'Ao criar personagem (todos)',
      jogadores: 'Ao criar personagem (só jogadores)',
      nunca: 'Só pelo botão na ficha'
    },
    onChange: redesenharFichas
  });

  game.settings.register(MODULE_ID, 'criacaoDinheiroInicial', {
    name: 'Dinheiro inicial',
    hint: 'Fórmula do botão "Rolar" na etapa de Equipamento, em T$. Deixe vazio para tirar o botão.',
    scope: 'world', config: true, type: String, default: '4d6'
  });

  game.settings.registerMenu(MODULE_ID, 'criacaoFontesMenu', {
    name: 'Fontes do Assistente de Criação',
    label: 'Escolher fontes',
    hint: 'Quais compêndios (do sistema, de módulos e do mundo) e se os itens do mundo entram nas listas de raças, classes, poderes, magias e itens do assistente.',
    icon: 'fa-solid fa-book-bookmark',
    restricted: true,
    type: atalhoDeMenu(abrirFontesCriacao)
  });

  foundry.applications.handlebars.loadTemplates([
    ...TEMPLATES_CRIACAO,
    ...TEMPLATES_NIVEIS,
    `modules/${MODULE_ID}/templates/criacao/fontes.hbs`,
    `modules/${MODULE_ID}/templates/criacao/fontes-rodape.hbs`
  ]);
});

Hooks.once('ready', async () => {
  // O antigo modo "Desligado" virou a chave "Assistente de Criação de Personagem".
  if (game.user === game.users.activeGM && game.settings.get(MODULE_ID, 'criacaoAoCriar') === 'desligado') {
    await game.settings.set(MODULE_ID, 'criacaoAtivo', false);
    await game.settings.set(MODULE_ID, 'criacaoAoCriar', 'nunca');
  }
  const mod = game.modules.get(MODULE_ID);
  if (mod) {
    mod.api = {
      ...(mod.api ?? {}),
      criacao: { abrir: abrirAssistenteCriacao, abrirFontes: abrirFontesCriacao, precisaCriacao },
      niveis: { abrir: (actor) => (niveisAtivo() ? abrirPlanejadorNiveis(actor) : null) }
    };
  }
});

/* Personagem novo: abre o assistente para quem o criou. Esperar um quadro
 * deixa a ficha (que o Foundry abre logo após criar) nascer antes, e o
 * assistente fica por cima dela. */
Hooks.on('createActor', (actor, options, userId) => {
  if (userId !== game.userId || !precisaCriacao(actor) || !actor.isOwner) return;
  // Ator vindo de compêndio ou duplicado não é personagem novo.
  if (actor._stats?.compendiumSource || actor._stats?.duplicateSource) return;
  const modo = modoAssistente();
  if (!['todos', 'jogadores'].includes(modo) || (modo === 'jogadores' && game.user.isGM)) return;
  setTimeout(() => abrirAssistenteCriacao(actor), 250);
});

/* Botão no cabeçalho da ficha (App V1 — a ficha do sistema e a Ficha Hayd). */
Hooks.on('getActorSheetHeaderButtons', (sheet, buttons) => {
  const actor = sheet.actor ?? sheet.object;
  if (!sheet.isEditable || !precisaCriacao(actor)) return;
  buttons.unshift({
    label: 'Criar personagem',
    class: 't20g-cc-header',
    icon: 'fa-solid fa-wand-magic-sparkles',
    onclick: () => abrirAssistenteCriacao(actor)
  });
});

/* Planejador de níveis: no cabeçalho de toda ficha de personagem que já tem
 * classe (a ficha em branco tem o "Criar personagem" no lugar). */
Hooks.on('getActorSheetHeaderButtons', (sheet, buttons) => {
  const actor = sheet.actor ?? sheet.object;
  if (actor?.type !== 'character' || !actor.isOwner || !niveisAtivo()) return;
  if (!actor.items.some(i => i.type === 'classe')) return;
  const i = buttons.findIndex(b => b.class === 'configure-sheet');
  const botao = { label: 'Níveis', class: 't20g-nv-header', icon: 'fa-solid fa-stairs', onclick: () => abrirPlanejadorNiveis(actor) };
  if (i >= 0) buttons.splice(i, 0, botao); else buttons.unshift(botao);
});

/* O cabeçalho v1 só é montado no primeiro render: quando o assistente termina
 * com a ficha aberta, o "Criar personagem" some e o "Níveis" entra na hora —
 * feito a partir do próprio botão do cabeçalho, para sair com o mesmo visual
 * (a Ficha Hayd mostra só o ícone, com tooltip). */
Hooks.on('renderActorSheet', (app) => {
  const actor = app.actor;
  if (actor?.type !== 'character') return;
  const janela = app.element instanceof HTMLElement ? app.element : app.element?.[0];
  const cabecalho = janela?.querySelector?.('.window-header');
  if (!cabecalho) return;
  const criar = cabecalho.querySelector('.header-button.t20g-cc-header');
  if (criar) criar.style.display = precisaCriacao(actor) ? '' : 'none';

  const temClasse = niveisAtivo() && actor.isOwner && actor.items.some(i => i.type === 'classe');
  let niveis = cabecalho.querySelector('.header-button.t20g-nv-header');
  if (temClasse && !niveis && criar) {
    niveis = criar.cloneNode(false);
    niveis.classList.replace('t20g-cc-header', 't20g-nv-header');
    niveis.style.display = '';
    const rotulo = 'Níveis';
    if (niveis.hasAttribute('data-tooltip')) niveis.setAttribute('data-tooltip', rotulo);
    if (niveis.hasAttribute('aria-label')) niveis.setAttribute('aria-label', rotulo);
    // Com rótulo visível (ficha do sistema), o texto vai junto do ícone.
    const comTexto = criar.textContent.trim().length > 0;
    niveis.innerHTML = `<i class="fa-solid fa-stairs"></i>${comTexto ? rotulo : ''}`;
    niveis.addEventListener('click', (ev) => { ev.preventDefault(); abrirPlanejadorNiveis(actor); });
    const antes = cabecalho.querySelector('.header-button.configure-sheet');
    if (antes) antes.before(niveis); else criar.after(niveis);
  }
  if (niveis) niveis.style.display = temClasse ? '' : 'none';
});
