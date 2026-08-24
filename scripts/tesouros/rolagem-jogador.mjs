/**
 * t20-hayd-tesouros | rolagem-jogador.mjs
 * "Diversão": em vez do Mestre rolar sozinho, pede a um jogador online que
 * role o dado da etapa. Posta uma mensagem sussurrada (Mestre + jogador)
 * com um botão de rolagem; quando clicado, cria uma nova mensagem com o
 * resultado marcada com o mesmo id de pedido, e quem pediu (com o app
 * aberto) recebe o resultado automaticamente via `createChatMessage`. Não
 * depende de socketlib — tudo passa pelo chat, que já é replicado a todos.
 */
import { MODULE_ID, FLAG_PEDIDO_ROLAGEM } from './constantes.mjs';

/** Jogadores (não-Mestre) atualmente online — para o seletor "Pedir a um jogador". */
export function jogadoresOnline() {
  return game.users.filter(u => u.active && !u.isGM);
}

/**
 * True se `roll` é uma rolagem "pura" de NdM — só aquele dado, sem soma nem
 * multiplicador (é isso que faz um "1d100" batido informalmente no chat por
 * um jogador contar pra uma etapa que pede 1d100; "4d4+2" ou algo com termo
 * extra não bate, mesmo que o dado principal seja o mesmo).
 */
function rollEhDadoPuro(roll, n, faces) {
  if (!roll || roll.terms?.length !== 1) return false;
  const termo = roll.terms[0];
  const dado = roll.dice?.[0];
  return !!dado && termo === roll.dice[0] && dado.number === n && dado.faces === faces;
}

/**
 * Escuta o chat esperando a PRIMEIRA rolagem "pura" de 1d<faces> (ou NdM,
 * se `n` > 1) feita por um JOGADOR (não o Mestre) — não precisa de botão
 * nem de pedido prévio, é o jogador rolando do jeito que quiser (comando,
 * macro, ficha...). Resolve com `{ roll, autor }` ou `null` se expirar.
 */
export function capturarRolagemDeJogador({ n = 1, faces, timeoutMs = 600000 }) {
  return new Promise(resolve => {
    let resolvido = false;
    const finalizar = valor => {
      if (resolvido) return;
      resolvido = true;
      Hooks.off('createChatMessage', aoChegarMensagem);
      clearTimeout(timer);
      resolve(valor);
    };
    const aoChegarMensagem = message => {
      const autor = message.author ?? game.users.get(message.user);
      if (!autor || autor.isGM) return; // só de jogador, nunca do Mestre
      const roll = message.rolls?.[0];
      if (!rollEhDadoPuro(roll, n, faces)) return;
      finalizar({ roll, autor });
    };
    Hooks.on('createChatMessage', aoChegarMensagem);
    const timer = setTimeout(() => finalizar(null), timeoutMs);
  });
}

/**
 * Pede a `userId` que role `formula` no chat. Resolve com `{ roll, cancelado }`
 * quando a rolagem chega (ou `{ roll: null, cancelado: true }` se expirar).
 */
export function pedirRolagemAoJogador({ userId, formula, rotulo, timeoutMs = 180000 }) {
  const requestId = foundry.utils.randomID();
  const usuario = game.users.get(userId);
  const destinatarios = [...new Set([...game.users.filter(u => u.isGM).map(u => u.id), userId])];

  return new Promise(resolve => {
    let resolvido = false;
    const finalizar = valor => {
      if (resolvido) return;
      resolvido = true;
      Hooks.off('createChatMessage', aoChegarMensagem);
      clearTimeout(timer);
      resolve(valor);
    };
    const aoChegarMensagem = message => {
      if (message.getFlag(MODULE_ID, FLAG_PEDIDO_ROLAGEM) !== requestId) return;
      // A mensagem de PEDIDO carrega o mesmo requestId e nasce depois deste
      // listener — sem exigir a marca de resposta, ela casava consigo mesma,
      // não trazia rolagem e o pedido "expirava" no mesmo instante.
      if (message.getFlag(MODULE_ID, 'respostaRolagem') !== true) return;
      const roll = message.rolls?.[0] ?? null;
      finalizar({ roll, cancelado: !roll });
    };
    Hooks.on('createChatMessage', aoChegarMensagem);
    const timer = setTimeout(() => finalizar({ roll: null, cancelado: true, expirado: true }), timeoutMs);

    const content = `
      <div class="t20g-tesouro-pedido">
        <p>${foundry.utils.escapeHTML(rotulo)} — <strong>${foundry.utils.escapeHTML(usuario?.name ?? 'Jogador')}</strong>, é sua vez de rolar!</p>
        <button type="button" class="t20g-tesouro-rolar-btn"
          data-formula="${foundry.utils.escapeHTML(formula)}"
          data-request-id="${requestId}"
          data-rotulo="${foundry.utils.escapeHTML(rotulo)}">
          <i class="fas fa-dice"></i> Rolar ${foundry.utils.escapeHTML(formula)}
        </button>
      </div>`;

    ChatMessage.create({
      content,
      whisper: destinatarios,
      flags: { [MODULE_ID]: { [FLAG_PEDIDO_ROLAGEM]: requestId, pedidoPara: userId } }
    });
  });
}

/** Liga o botão "Rolar" nas mensagens de pedido — qualquer cliente pode clicar (o pedido já é sussurrado). */
Hooks.on('renderChatMessageHTML', (message, html) => {
  const btn = html.querySelector?.('.t20g-tesouro-rolar-btn');
  if (!btn || btn.dataset.t20gLigado) return;
  btn.dataset.t20gLigado = '1';

  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    const { formula, requestId, rotulo } = btn.dataset;

    const roll = new Roll(formula);
    await roll.evaluate();
    // NÃO chama game.dice3d.showForRoll aqui — o ChatMessage.create logo abaixo
    // já leva `rolls: [roll]`, e o Dice So Nice anima sozinho toda rolagem que
    // chega numa mensagem nova. Chamar os dois animava a mesma rolagem 2x.

    await ChatMessage.create({
      content: `<p>${foundry.utils.escapeHTML(rotulo)}: <strong>${roll.total}</strong></p>`,
      whisper: message.whisper?.length ? message.whisper : [],
      rolls: [roll],
      speaker: ChatMessage.getSpeaker(),
      flags: { [MODULE_ID]: { [FLAG_PEDIDO_ROLAGEM]: requestId, respostaRolagem: true } }
    });

    btn.outerHTML = `<span class="t20g-tesouro-rolado"><i class="fas fa-check"></i> Rolado: ${roll.total}</span>`;
  });
});
