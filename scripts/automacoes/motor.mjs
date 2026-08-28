/**
 * t20-hayd-gmtools | Automações de poderes
 *
 * Poderes com funcionamento específico que o sistema não automatiza. O botão
 * "Automação" no topo da ficha do item escolhe qual comportamento aquele item
 * terá; o módulo cuida do resto (efeitos de uso, botões no chat, contadores).
 *
 * Automações com contador (ex.: Sangue dos Inimigos) mantêm um Efeito Ativo
 * "de uso" na ficha do ator, com o valor acumulado no nome e nas mudanças —
 * assim o bônus aparece pronto na janela de rolagem de ataques e do poder.
 */

import {
  MODULE_ID,
  automacoesAtivas,
  souResponsavelPeloAtor
} from './runtime.mjs';
import { IndiceAtoresAutomacoes } from './indice-atores.mjs';
import { AUTOMACOES } from './catalogo.mjs';
import {
  idAutomacao,
  definicaoDe,
  valorContador,
  automacoesPara,
  rotuloTipo
} from './estado.mjs';
import { registrarHooksAutomacoes } from './hooks.mjs';
import { ocultarContagemDe } from './segredos.mjs';
import { sugerirAutomacoes } from './sugestao.mjs';
import { abrirDistribuicao } from './seta-infalivel.mjs';
import {
  GP_CARREGADO,
  GP_SEQUENCIAL,
  passoSequencial,
  GP_EFEITOS,
  GP_ELEMENTOS,
  GP_ALCANCES,
  rotuloDano,
  rotuloAlcance
} from './golpe-pessoal/catalogo.mjs';
import {
  idCombateAtual,
  historicoDoCombate,
  contagemNaRodada,
  criarEntrada,
  criarEntradaValor
} from './combinacoes/historico.mjs';
import {
  marcaAplicacao,
  normalizarRegistroCondicoes,
  aplicacaoExpirada
} from './combinacoes/duracao.mjs';
import {
  normalizarEstudo,
  bonusDoEstudo,
  registrarEstudo,
  desfazerEstudo
} from './estudar-adversario.mjs';

const { DialogV2 } = foundry.applications.api;

/** Flag no ITEM: id da automação escolhida. */
const FLAG_AUTOMACAO = 'automacao';
/** Flag no ITEM: valor acumulado do contador. */
const FLAG_CONTADOR = 'contador';
/** Flag no EFEITO do ator: id do item que o originou. */
const FLAG_ORIGEM = 'automacaoOrigem';

/* ─── Catálogo de automações ─────────────────────────────────────────────── */

/**
 * Cada automação descreve para quais tipos de item serve e, quando é do tipo
 * "contador", como o bônus vira mudanças no efeito de uso.
 *
 * contador.limite(ator) → teto do acumulado (null = sem teto)
 * contador.changes(n)   → mudanças do Efeito Ativo para o valor n
 * contador.alvos        → flags tormenta20 que definem onde o efeito aparece
 *                         (attack = rolagens de arma, power = poderes, ...)
 */
/**
 * Quem pode MEXER nos contadores de um personagem.
 *
 * Ver é liberado para a mesa inteira (o valor da contagem é informação de
 * jogo, não segredo); alterar continua restrito a quem é dono da ficha. O
 * Mestre passa aqui porque o Foundry trata GM como OWNER de tudo, então ele
 * mantém o controle para ajudar os jogadores.
 */
function podeControlar(ator) {
  return !!ator?.isOwner;
}

/** Efeito de uso que este item mantém na ficha do ator (ou undefined). */
function efeitoDoItem(item) {
  return item.actor?.effects?.find((ef) => ef.getFlag(MODULE_ID, FLAG_ORIGEM) === item.id);
}

/** Todos os efeitos mantidos por um item — o principal e os extras. */
function efeitosDoItem(ator, itemId) {
  return (ator?.effects ?? []).filter((ef) => {
    const chave = ef.getFlag(MODULE_ID, FLAG_ORIGEM);
    return chave === itemId || (typeof chave === 'string' && chave.startsWith(`${itemId}:`));
  });
}

/**
 * Cria, atualiza ou remove o efeito de uso conforme o contador do item.
 * Contador zerado (ou automação desligada) remove o efeito.
 */
async function sincronizarEfeito(item) {
  const ator = item.actor;
  if (!ator) return;

  const def = definicaoDe(item);

  // Combinações têm sincronização própria (contagem por oponente)
  if (def?.combinacao) return sincronizarCombinacoes(ator);
  // O Golpe Pessoal monta os efeitos a partir do golpe salvo no item
  if (def?.golpe) return sincronizarGolpe(item);

  const valor = valorContador(item);
  const efeito = efeitoDoItem(item);

  if (!def?.contador || valor <= 0) {
    if (efeito) await efeito.delete();
    return;
  }

  const dados = {
    name: `${item.name}: +${valor}`,
    img: item.img,
    disabled: false,
    changes: def.contador.changes(valor),
    flags: {
      tormenta20: { onuse: true, custo: '0', ...def.contador.alvos },
      [MODULE_ID]: { [FLAG_ORIGEM]: item.id }
    }
  };

  if (efeito) {
    if (!efeitoEmDia(efeito, dados)) await efeito.update(dados);
  } else {
    await ator.createEmbeddedDocuments('ActiveEffect', [{ ...dados, origin: item.uuid }]);
  }
}

/**
 * Ajusta o contador (delta) ou zera (delta === null), respeitando o limite.
 * O efeito de uso é sincronizado em seguida.
 */
async function ajustarContador(item, delta) {
  const def = definicaoDe(item);
  if (!def?.contador) return;

  const atual = valorContador(item);
  let novo;
  if (delta === null) {
    novo = 0;
  } else {
    const limite = def.contador.limite?.(item.actor);
    const teto = Number.isFinite(limite) ? limite : Infinity;
    novo = Math.min(Math.max(atual + delta, 0), teto);
    if (novo === atual) {
      const aviso = delta > 0
        ? game.i18n.format('T20HaydGMTools.AutoNoLimite', {
          nome: def.nome, valor: teto, limite: def.contador.limiteTexto ?? 'sem limite'
        })
        : game.i18n.format('T20HaydGMTools.AutoNoMinimo', { nome: def.nome });
      return ui.notifications.info(aviso);
    }
  }
  if (novo === atual) return;

  await item.setFlag(MODULE_ID, FLAG_CONTADOR, novo);
  await sincronizarEfeito(item);
}

/* ─── Botão e diálogo na ficha do item ───────────────────────────────────── */

/** Diálogo de escolha da automação para um item. */
async function abrirDialogoAutomacao(item) {
  const disponiveis = automacoesPara(item);
  const atual = idAutomacao(item);

  if (!disponiveis.length) {
    // O botão aparece em todo item; quando ainda não há automação para o tipo,
    // explica em vez de abrir um seletor vazio.
    return DialogV2.prompt({
      window: { title: game.i18n.localize('T20HaydGMTools.AutoTitulo'), icon: 'fa-solid fa-wand-magic-sparkles' },
      position: { width: 420 },
      content: `<div class="t20g-auto-dialogo">
        <p>${game.i18n.format('T20HaydGMTools.AutoSemOpcoes', { tipo: rotuloTipo(item) })}</p>
        <p class="notes">${game.i18n.localize('T20HaydGMTools.AutoSemOpcoesDica')}</p>
      </div>`,
      ok: { label: game.i18n.localize('T20HaydGMTools.AutoEntendi'), icon: 'fa-solid fa-check' },
      rejectClose: false
    }).catch(() => null);
  }

  // O nome do item quase sempre é o do poder que se quer automatizar; o que
  // casar vai para um grupo próprio no topo, para não caçar na lista inteira.
  const sugeridas = sugerirAutomacoes(item.name, disponiveis);
  const sugeridasIds = new Set(sugeridas.map((a) => a.id));
  const demais = disponiveis.filter((a) => !sugeridasIds.has(a.id));

  // Só o nome do poder: a fonte é longa e deixava a lista difícil de ler.
  // Ela continua na página do diário de cada automação.
  const opcao = (a) =>
    `<option value="${a.id}" ${atual === a.id ? 'selected' : ''}>${a.nome}</option>`;

  const grupo = (rotulo, lista) => (lista.length
    ? `<optgroup label="${rotulo}">${lista.map(opcao).join('')}</optgroup>`
    : '');

  const opcoes = [
    `<option value="" ${!atual ? 'selected' : ''}>${game.i18n.localize('T20HaydGMTools.AutoNenhuma')}</option>`,
    grupo(game.i18n.localize('T20HaydGMTools.AutoSugeridas'), sugeridas),
    sugeridas.length
      ? grupo(game.i18n.localize('T20HaydGMTools.AutoDemais'), demais)
      : demais.map(opcao).join('')
  ].join('');

  // Sem a regra do poder: quem abre isto já tem o poder na ficha e sabe o que
  // ele faz. O que falta é o que a AUTOMAÇÃO faz.
  const detalhes = disponiveis
    .map(
      (a) => `<div class="t20g-auto-detalhe" data-para="${a.id}">
        ${a.comoUsar ? `<p>${a.comoUsar}</p>` : ''}
      </div>`
    )
    .join('');

  const escolha = await DialogV2.wait({
    window: { title: game.i18n.localize('T20HaydGMTools.AutoTitulo'), icon: 'fa-solid fa-wand-magic-sparkles' },
    position: { width: 420 },
    content: `
      <div class="t20g-auto-dialogo">
        <p class="notes">${game.i18n.localize('T20HaydGMTools.AutoAjuda')}</p>
        <div class="form-group">
          <label>${game.i18n.localize('T20HaydGMTools.AutoCampo')}</label>
          <select name="automacao">${opcoes}</select>
        </div>
        ${detalhes}
      </div>`,
    buttons: [
      {
        action: 'salvar',
        label: game.i18n.localize('T20HaydGMTools.AutoSalvar'),
        icon: 'fa-solid fa-check',
        default: true,
        callback: (ev, botao) => botao.form.elements.automacao.value
      },
      { action: 'cancelar', label: game.i18n.localize('T20HaydGMTools.AutoCancelar'), icon: 'fa-solid fa-xmark' }
    ],
    render: (ev, dialogo) => {
      const el = dialogo.element;
      const select = el.querySelector('select[name="automacao"]');
      const atualizar = () => {
        for (const d of el.querySelectorAll('.t20g-auto-detalhe')) {
          d.style.display = d.dataset.para === select.value ? '' : 'none';
        }
      };
      select.addEventListener('change', atualizar);
      atualizar();
    },
    rejectClose: false
  });

  if (typeof escolha !== 'string') return; // cancelado
  if (escolha === (atual ?? '')) return;   // sem mudança

  if (!escolha) {
    // Desligar: remove todos os efeitos mantidos e limpa o contador
    for (const ef of efeitosDoItem(item.actor, item.id)) await ef.delete();
    await item.unsetFlag(MODULE_ID, FLAG_AUTOMACAO);
    await item.unsetFlag(MODULE_ID, FLAG_CONTADOR);
    await item.unsetFlag(MODULE_ID, FLAG_GOLPE);
    return ui.notifications.info(game.i18n.localize('T20HaydGMTools.AutoRemovida'));
  }

  await item.setFlag(MODULE_ID, FLAG_AUTOMACAO, escolha);
  await sincronizarEfeito(item);
  ui.notifications.info(
    game.i18n.format('T20HaydGMTools.AutoAplicada', { nome: AUTOMACOES[escolha].nome })
  );

  // O Golpe Pessoal não faz nada até ser montado — já abre o construtor
  if (AUTOMACOES[escolha].golpe && !golpeDoItem(item)) await abrirConstrutorGolpe(item);
}

/* ─── Automações de ação (recuperação de recursos) ───────────────────────── */

/**
 * Executa a ação de uma automação: recupera PV/PM no ator e anuncia no chat.
 * Respeita os máximos da ficha — a mensagem informa o que de fato entrou.
 */
async function executarAcao(item) {
  const def = definicaoDe(item);
  const ator = item.actor;
  if (!def?.acao || !ator) return;

  const attrs = ator.system?.attributes ?? {};
  const recuperar = (chave, quanto) => {
    if (!quanto) return { ganho: 0 };
    const atual = Number(attrs[chave]?.value) || 0;
    const max = Number(attrs[chave]?.max);
    const novo = Number.isFinite(max) ? Math.min(atual + quanto, max) : atual + quanto;
    return { ganho: Math.max(0, novo - atual), novo };
  };

  const pv = recuperar('pv', def.acao.pv);
  const pm = recuperar('pm', def.acao.pm);

  const update = {};
  if (pv.ganho) update['system.attributes.pv.value'] = pv.novo;
  if (pm.ganho) update['system.attributes.pm.value'] = pm.novo;
  if (Object.keys(update).length) await ator.update(update);

  const partes = [];
  if (def.acao.pv) partes.push(`<b>${pv.ganho}</b> PV`);
  if (def.acao.pm) partes.push(`<b>${pm.ganho}</b> PM`);
  const nada = !pv.ganho && !pm.ganho;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: ator }),
    content: `<div class="t20g-auto-chat">
      <i class="${def.icone ?? 'fa-solid fa-bolt'}"></i>
      ${game.i18n.format(nada ? 'T20HaydGMTools.AutoRecuperouNada' : 'T20HaydGMTools.AutoRecuperou', {
        ator: ator.name,
        valores: partes.join(' e '),
        poder: item.name
      })}
    </div>`
  });
}

/* ─── Combinações Desarmadas (contagem por oponente) ─────────────────────── */

/** Flag no ATOR: { [tokenIdDoOponente]: [{ r: rodada, d: incremento }, ...] } */
const FLAG_COMBINACOES = 'combinacoes';

/** Poderes do ator que são Combinações (com efeito de uso). */
function poderesDeCombinacao(ator) {
  return ator?.items?.filter((i) => definicaoDe(i)?.combinacao) ?? [];
}

/**
 * Reaproveitado pelos caminhos quentes de alvo e turno. A lista só é
 * reconstruída quando um item muda ou quando a cena do canvas é trocada.
 */
const indiceCombinacoes = new IndiceAtoresAutomacoes(
  (ator) => poderesDeCombinacao(ator).length > 0
);

/** +2 se o ator tem Mestre das Combinações; senão +1. */
function incrementoDaContagem(ator) {
  const temMestre = ator?.items?.some((i) => definicaoDe(i)?.marcador === 'incremento2');
  return temMestre ? 2 : 1;
}

/** Rodada atual do combate (0 fora de combate — aí nada expira). */
function rodadaAtual() {
  return Number(game.combat?.round) || 0;
}

/** Combatente que representa o ator, inclusive quando ele vem de token não vinculado. */
function combatenteDoAtor(combate, ator) {
  if (!combate || !ator) return null;
  return [...(combate.combatants ?? [])].find((combatente) =>
    combatente.actor === ator
    || combatente.actor?.uuid === ator.uuid
    || combatente.actor?.id === ator.id
    || combatente.actorId === ator.id
    || combatente.token?.actor === ator
    || (ator.token?.id && combatente.tokenId === ator.token.id)
  ) ?? null;
}

/** Marca uma aplicação na posição atual da iniciativa de quem usou o poder. */
function marcaAplicacaoAtual(ator) {
  const combate = game.combat;
  return marcaAplicacao(idCombateAtual(), rodadaAtual(), {
    turno: Number.isFinite(Number(combate?.turn)) ? Number(combate.turn) : null,
    combatente: combatenteDoAtor(combate, ator)?.id ?? null
  });
}

/**
 * Tokens mirados pelo usuário (os oponentes da contagem).
 *
 * A contagem é individual por inimigo, então com mais de um alvo marcado cada
 * um é tratado separadamente — escolher "o primeiro" fazia o valor pular entre
 * oponentes conforme a ordem da seleção mudava.
 */
function alvosMirados() {
  return [...(game.user?.targets ?? [])].filter((t) => t?.id);
}

/**
 * Oponentes com contagem viva contra este ator, para quem só assiste.
 *
 * `alvosMirados()` é o alvo de QUEM OLHA, não de quem rolou — para um
 * espectador ele mostraria a contagem contra o próprio alvo dele, que não tem
 * relação com o cartão. Aqui a lista sai do que está de fato registrado na
 * ficha, que é a informação útil para a mesa acompanhar.
 */
function oponentesComContagem(ator, contar) {
  const tudo = ator?.getFlag?.(MODULE_ID, FLAG_COMBINACOES) ?? {};
  return Object.keys(tudo)
    .map((tokenId) => ({ id: tokenId, name: nomeDoToken(tokenId), valor: contar(tokenId) }))
    .filter((linha) => linha.valor > 0 && linha.name);
}

/** Mesma ideia, para o registro de Estudar o Adversário. */
function oponentesComEstudo(ator) {
  const tudo = ator?.getFlag?.(MODULE_ID, FLAG_ESTUDO) ?? {};
  return Object.keys(tudo)
    .map((tokenId) => ({
      id: tokenId, name: nomeDoToken(tokenId), valor: normalizarEstudo(tudo[tokenId]).n
    }))
    .filter((linha) => linha.valor > 0 && linha.name);
}

/** Maior contagem entre os oponentes mirados, com o token correspondente. */
function maiorContagemMirada(ator) {
  let melhor = { valor: 0, token: null };
  for (const token of alvosMirados()) {
    const valor = contagemAtual(ator, token.id);
    if (valor > melhor.valor || !melhor.token) melhor = { valor, token };
  }
  return melhor;
}

/** Histórico de acertos do ator contra um oponente. */
function historicoCombinacao(ator, chaveAlvo) {
  const tudo = ator?.getFlag?.(MODULE_ID, FLAG_COMBINACOES) ?? {};
  const lista = tudo[chaveAlvo];
  return Array.isArray(lista) ? lista : [];
}

/**
 * Contagem derivada do histórico para uma rodada.
 *
 * A contagem zera quando passa uma rodada inteira sem acerto de Combinação.
 * Como o valor é SEMPRE recalculado a partir do histórico (e não guardado
 * pronto), voltar o combate para uma rodada anterior devolve o valor correto
 * daquela rodada — nada é perdido ao avançar sem querer.
 */
/** Contagem atual do ator contra o oponente mirado. */
function contagemAtual(ator, chaveAlvo) {
  if (!chaveAlvo) return 0;
  return contagemNaRodada(historicoCombinacao(ator, chaveAlvo), rodadaAtual());
}

/**
 * Ids de token que representam este ator (para saber "quem sou eu" na mesa).
 * Tokens não vinculados têm ator próprio (`actor.token`); os vinculados podem
 * ter vários tokens na cena.
 */
function tokensDoAtor(destino) {
  const ids = new Set();
  if (destino?.token?.id) ids.add(destino.token.id);
  else if (destino?.id) {
    for (const t of canvas?.scene?.tokens ?? []) {
      if (t.actorId === destino.id) ids.add(t.id);
    }
  }
  return ids;
}

/**
 * Maior contagem de Combinações que alguém tem contra este ator.
 *
 * Usado para saber quanto vale a penalidade que este ator está sofrendo
 * quando o efeito é (re)aplicado nele.
 */
function contagemContraAtor(destino) {
  const ids = tokensDoAtor(destino);
  if (!ids.size) return 0;

  const rodada = rodadaAtual();
  let maior = 0;
  for (const ator of indiceCombinacoes.listar()) {
    // Acesso direto à flag: getRollData roda em toda rolagem
    const tudo = ator.flags?.[MODULE_ID]?.[FLAG_COMBINACOES];
    if (!tudo) continue;
    for (const id of ids) {
      const valor = contagemNaRodada(tudo[id] ?? [], rodada);
      if (valor > maior) maior = valor;
    }
  }
  return maior;
}

/**
 * Contagem que ESTE ator tem contra quem está mirando.
 * Com vários alvos marcados vale a maior — é o valor exposto em @combinacoes.
 */
function contagemDoAtorMirando(ator) {
  return maiorContagemMirada(ator).valor;
}

/** Grava o histórico de um oponente (removendo a entrada vazia). */
async function gravarHistorico(ator, chaveAlvo, historico) {
  const tudo = foundry.utils.deepClone(ator.getFlag(MODULE_ID, FLAG_COMBINACOES) ?? {});
  // ATENÇÃO: setFlag faz MERGE. Apagar a chave do objeto não a remove no banco
  // — o valor antigo voltaria e a contagem nunca chegaria a zero. Por isso a
  // lista vazia é gravada explicitamente, e a remoção usa a sintaxe "-=".
  if (historico?.length) {
    tudo[chaveAlvo] = historico;
    await ator.setFlag(MODULE_ID, FLAG_COMBINACOES, tudo);
    return;
  }
  delete tudo[chaveAlvo];
  await ator.update({
    [`flags.${MODULE_ID}.${FLAG_COMBINACOES}.-=${chaveAlvo}`]: null
  });
}

/** Registra um acerto de Combinação (soma +1 ou +2 na rodada atual). */
async function somarCombinacao(ator, chaveAlvo) {
  const historico = [
    ...historicoDoCombate(historicoCombinacao(ator, chaveAlvo)),
    criarEntrada(rodadaAtual(), incrementoDaContagem(ator))
  ];
  await gravarHistorico(ator, chaveAlvo, historico);
  await sincronizarCombinacoes(ator);
  await atualizarDebuffsAplicados(ator, chaveAlvo);
  await atualizarMensagensRetroativas(ator, chaveAlvo);
}

/** Diminui a contagem na rodada atual sem apagar o histórico anterior. */
async function subtrairCombinacao(ator, chaveAlvo) {
  const atual = contagemAtual(ator, chaveAlvo);
  if (atual <= 0) return;
  const novo = Math.max(0, atual - incrementoDaContagem(ator));
  // O marcador absoluto preserva o histórico das rodadas anteriores (inclusive
  // ao retroceder), mas não deixa um intervalo de rodadas transformar −1/−2 em
  // um salto inesperado para zero.
  const historico = [
    ...historicoDoCombate(historicoCombinacao(ator, chaveAlvo)),
    criarEntradaValor(rodadaAtual(), novo)
  ];
  await gravarHistorico(ator, chaveAlvo, historico);
  await sincronizarCombinacoes(ator);
  await atualizarDebuffsAplicados(ator, chaveAlvo);
  await atualizarMensagensRetroativas(ator, chaveAlvo);
}

/**
 * Zera a contagem contra aquele oponente e retira o que as Combinações
 * aplicaram nele (mesma semântica do fim automático: acabou, sai tudo).
 */
async function zerarCombinacao(ator, chaveAlvo) {
  await gravarHistorico(ator, chaveAlvo, []);
  await sincronizarCombinacoes(ator);
  await atualizarMensagensRetroativas(ator, chaveAlvo);
  await removerEfeitosDaCombinacao(ator, chaveAlvo);
  await removerEfeitosProprios(ator);
}

/**
 * Põe os efeitos de uso das Combinações em dia com a contagem do oponente
 * mirado. Os efeitos ficam SUSPENSOS (disabled) — aparecem na janela de
 * rolagem com o custo em PM, mas desmarcados, para o jogador escolher.
 */
/**
 * Fila por ator para as sincronizações não se atropelarem.
 *
 * Trocar de alvo dispara dois eventos (desmarcar o antigo, marcar o novo) e as
 * duas sincronizações corriam em paralelo: se a do valor ANTIGO terminasse por
 * último, ela sobrescrevia o efeito e a fórmula ficava presa no valor errado.
 */
const _filaSincronizacao = new Map();

function sincronizarCombinacoes(ator) {
  if (!ator?.id) return Promise.resolve();
  const anterior = _filaSincronizacao.get(ator.id) ?? Promise.resolve();
  const proxima = anterior
    .catch(() => {})
    .then(() => _sincronizarCombinacoes(ator));
  _filaSincronizacao.set(ator.id, proxima);
  return proxima;
}

async function _sincronizarCombinacoes(ator) {
  if (!ator?.isOwner) return;
  const poderes = poderesDeCombinacao(ator);
  if (!poderes.length) return;

  // Com vários alvos marcados o efeito usa a maior contagem, e o nome diz
  // contra quem ela vale — para não ficar dúvida de qual oponente é.
  const { valor, token } = maiorContagemMirada(ator);
  const contra = alvosMirados().length > 1 && token ? ` vs ${token.name}` : '';

  for (const item of poderes) {
    const def = definicaoDe(item);

    // O efeito principal do poder + os extras que ele declarar (a Esquiva
    // Técnica, por exemplo, tem um segundo efeito sem custo com o +5)
    const specs = [
      {
        chave: item.id,
        // Em bônus de dados, o nome mostra os dados que a contagem concede
        // (ex.: "contagem +2: 2d6") — senão o "+2" é lido como dano fixo.
        nome: `${item.name} (${valor > 0 ? `contagem +${valor}` : 'contagem 0'}`
          + `${def.combinacao.retroativo?.dados && valor > 0
            ? `: ${valor}d${def.combinacao.retroativo.dados}` : ''}${contra})`,
        custo: String(def.combinacao.custo),
        alvos: { attack: true, power: true, ...(def.combinacao.alvosExtra ?? {}) },
        itens: def.combinacao.itens,
        changes: def.combinacao.changes(valor)
      },
      ...(def.combinacao.efeitosExtra ?? []).map((extra) => ({
        chave: `${item.id}:${extra.sufixo}`,
        nome: extra.nome,
        custo: String(extra.custo ?? 0),
        alvos: extra.alvos ?? { attack: true, power: true },
        itens: extra.itens,
        changes: extra.changes(valor)
      }))
    ];

    for (const spec of specs) {
      const efeito = efeitoPorChave(ator, spec.chave);
      const dados = {
        name: spec.nome,
        img: item.img,
        disabled: true, // suspenso: só é marcado quando o jogador escolher
        changes: spec.changes,
        flags: {
          tormenta20: {
            onuse: true,
            ...spec.alvos,
            custo: spec.custo,
            ...(spec.itens ? { items: spec.itens } : {})
          },
          [MODULE_ID]: { [FLAG_ORIGEM]: spec.chave }
        }
      };

      if (efeito) {
        if (!efeitoEmDia(efeito, dados)) await efeito.update(dados);
      } else {
        await ator.createEmbeddedDocuments('ActiveEffect', [{ ...dados, origin: item.uuid }]);
      }
    }
  }
}

/** Efeito mantido pelo módulo sob uma chave (item.id, ou item.id:sufixo). */
function efeitoPorChave(ator, chave) {
  return ator?.effects?.find((ef) => ef.getFlag(MODULE_ID, FLAG_ORIGEM) === chave);
}

/** Todos os efeitos que usam exatamente a mesma chave de automação. */
function efeitosPorChave(ator, chave) {
  return (ator?.effects ?? []).filter((ef) => ef.getFlag(MODULE_ID, FLAG_ORIGEM) === chave);
}

/**
 * O efeito já está exatamente como o módulo quer?
 *
 * Mirar um token dispara duas sincronizações (desmarcar o antigo, marcar o
 * novo) e a mesa troca de alvo o tempo todo. Sem esta comparação, cada clique
 * reescrevia todos os efeitos de Combinação do personagem — e cada escrita é
 * banco de dados, socket para todos os clientes e re-preparo da ficha.
 *
 * Compara só o que o módulo define: o sistema pode guardar outras flags no
 * efeito, e elas não são motivo para reescrever.
 */
function efeitoEmDia(efeito, dados) {
  if (!efeito) return false;
  if (efeito.name !== dados.name) return false;
  if (efeito.img !== dados.img) return false;
  if (!!efeito.disabled !== !!dados.disabled) return false;

  const atuais = efeito.changes ?? [];
  const novas = dados.changes ?? [];
  if (atuais.length !== novas.length) return false;
  for (let i = 0; i < novas.length; i += 1) {
    const a = atuais[i];
    const n = novas[i];
    if (a?.key !== n?.key || a?.mode !== n?.mode || String(a?.value) !== String(n?.value)) {
      return false;
    }
  }

  const t20 = efeito.flags?.tormenta20 ?? {};
  for (const [chave, valor] of Object.entries(dados.flags?.tormenta20 ?? {})) {
    if (t20[chave] !== valor) return false;
  }
  return true;
}

/** Atualiza as barras de combinações já renderizadas no chat. */
function atualizarBarrasCombinacao(ator) {
  const seletor = `.t20g-comb-barra[data-actor-id="${CSS.escape(ator.id)}"]`;
  for (const barra of document.querySelectorAll(seletor)) {
    const nova = montarBarraCombinacoes(ator, { completo: barra.dataset.completo === '1' });
    // Trocar de alvo repinta todas as barras do log; quando o resultado é
    // idêntico, trocar o nó só causaria relayout à toa.
    if (nova.outerHTML === barra.outerHTML) continue;
    barra.replaceWith(nova);
  }
}


/* --- Aviso de contagem encerrada ---------------------------------------- */

/** Nome de um token ainda presente na cena ou no encontro atual. */
function nomeDoToken(tokenId) {
  if (!tokenId) return null;
  const naCena = canvas?.scene?.tokens?.get(tokenId);
  if (naCena) return naCena.name;
  for (const combatente of game.combat?.combatants ?? []) {
    if (combatente.tokenId === tokenId) return combatente.token?.name ?? combatente.name;
  }
  return null;
}

/**
 * Anuncia no chat as contagens que acabaram de expirar por passar uma rodada
 * sem acerto de Combinação.
 *
 * Roda só no Mestre ativo: o hook de combate dispara em todos os clientes e
 * uma mensagem por cliente viraria spam.
 */
async function anunciarContagensEncerradas(rodadaVelha, rodadaNova) {
  if (!game.user.isGM || game.user !== game.users.activeGM) return;
  if (!(rodadaNova > rodadaVelha)) return;

  const encerradas = [];
  for (const ator of indiceCombinacoes.listar()) {
    const tudo = ator.getFlag(MODULE_ID, FLAG_COMBINACOES) ?? {};
    for (const [tokenId, historico] of Object.entries(tudo)) {
      if (!Array.isArray(historico) || !historico.length) continue;
      const oponente = nomeDoToken(tokenId);
      if (!oponente) continue; // token removido: não anuncia inimigo fantasma
      const antes = contagemNaRodada(historico, rodadaVelha);
      const agora = contagemNaRodada(historico, rodadaNova);
      if (antes > 0 && agora === 0) {
        encerradas.push({ ator, tokenId, oponente, valor: antes });
      }
    }
  }
  if (!encerradas.length) return;

  // A contagem acabou: tira da criatura o que aquelas Combinações aplicaram
  // (penalidades e condições) e, se o personagem ficou sem contagem nenhuma,
  // também o que ele aplicou em si mesmo.
  let removidos = 0;
  const atoresTocados = new Set();
  for (const { ator, tokenId } of encerradas) {
    try {
      removidos += await removerEfeitosDaCombinacao(ator, tokenId);
      atoresTocados.add(ator);
    } catch (err) {
      console.error(`${MODULE_ID} | Falha ao remover efeitos da combinação encerrada`, err);
    }
  }
  for (const ator of atoresTocados) {
    try { removidos += await removerEfeitosProprios(ator); }
    catch (err) { console.error(`${MODULE_ID} | Falha ao remover efeitos próprios`, err); }
  }

  const linhas = encerradas
    .map(({ ator, oponente, valor }) =>
      `<li>${game.i18n.format('T20HaydGMTools.CombEncerradaItem', {
        ator: ator.name,
        oponente: oponente ?? game.i18n.localize('T20HaydGMTools.CombOponenteDesconhecido'),
        valor
      })}</li>`)
    .join('');

  await ChatMessage.create({
    speaker: { alias: 'T20 Hayd GMTools' },
    content: `<div class="t20g-auto-fimcena">
      <p><b><i class="fa-solid fa-hand-fist"></i>
        ${game.i18n.localize('T20HaydGMTools.CombEncerradaTitulo')}</b></p>
      <p>${game.i18n.localize('T20HaydGMTools.CombEncerradaTexto')}</p>
      <ul>${linhas}</ul>
      ${removidos ? `<p class="notes">${game.i18n.format('T20HaydGMTools.CombEfeitosRemovidos',
        { total: removidos })}</p>` : ''}
    </div>`
  });
}

const FLAG_RETROCESSO_COMBATE = 'retrocessoCombinacoes';

function mensagensDeRetrocesso(combateId) {
  return [...(game.messages ?? [])].filter((mensagem) =>
    mensagem.getFlag?.(MODULE_ID, FLAG_RETROCESSO_COMBATE)?.combate === combateId
  );
}

async function apagarMensagensRetrocesso(combateId, rodadaAtual = Infinity) {
  for (const mensagem of mensagensDeRetrocesso(combateId)) {
    const dados = mensagem.getFlag(MODULE_ID, FLAG_RETROCESSO_COMBATE);
    if (Number(rodadaAtual) >= Number(dados?.origem ?? 0)) await mensagem.delete();
  }
}

/** Publica um resumo quando voltar rodadas altera alguma contagem. */
async function anunciarRetrocessoCombinacoes(combate, rodadaVelha, rodadaNova) {
  if (!game.user.isGM || game.user !== game.users.activeGM) return;
  if (!(rodadaNova < rodadaVelha) || !combate?.id) return;

  // Mantém apenas o aviso correspondente ao estado de retrocesso atual.
  for (const mensagem of mensagensDeRetrocesso(combate.id)) await mensagem.delete();

  const alteradas = [];
  for (const ator of indiceCombinacoes.listar()) {
    const tudo = ator.getFlag(MODULE_ID, FLAG_COMBINACOES) ?? {};
    for (const [tokenId, historico] of Object.entries(tudo)) {
      const antes = contagemNaRodada(historico, rodadaVelha, combate.id);
      const agora = contagemNaRodada(historico, rodadaNova, combate.id);
      if (antes === agora) continue;
      const oponente = nomeDoToken(tokenId);
      if (!oponente) continue;
      alteradas.push({ ator: ator.name, oponente, antes, agora });
    }
  }
  if (!alteradas.length) return;

  const linhas = alteradas.map((d) => `<li>${game.i18n.format(
    'T20HaydGMTools.CombRetroItem', d
  )}</li>`).join('');
  await ChatMessage.create({
    speaker: { alias: 'T20 Hayd GMTools' },
    content: `<div class="t20g-auto-fimcena">
      <p><b><i class="fa-solid fa-clock-rotate-left"></i>
        ${game.i18n.localize('T20HaydGMTools.CombRetroTitulo')}</b></p>
      <p>${game.i18n.format('T20HaydGMTools.CombRetroTexto', {
        origem: rodadaVelha, destino: rodadaNova
      })}</p><ul>${linhas}</ul>
    </div>`,
    flags: {
      [MODULE_ID]: {
        [FLAG_RETROCESSO_COMBATE]: {
          combate: combate.id, origem: rodadaVelha, destino: rodadaNova
        }
      }
    }
  });
}

/* --- Correção retroativa da última mensagem ------------------------------ */

/**
 * Flag no ATOR: a mensagem "viva" de cada combinação retroativa —
 * { [itemId]: { mensagem, alvo, valor, indiceRoll, indiceTermo } }.
 *
 * Só a mensagem mais recente de cada poder é acompanhada: ao rolar de novo, o
 * registro é substituído e a mensagem anterior congela no valor que tinha.
 */
const FLAG_RETRO = 'msgRetroativa';

function registrosRetroativos(ator) {
  return ator?.getFlag?.(MODULE_ID, FLAG_RETRO) ?? {};
}

/** É um termo numérico avaliado com este valor? */
function ehNumerico(termo, valor) {
  return !!termo && termo.class !== 'OperatorTerm' && termo.operator === undefined
    && !Array.isArray(termo.results)
    && Number(termo.number) === Number(valor);
}

/** É um grupo de dados com estas faces e esta quantidade? */
function ehDadoDe(termo, faces, quantidade) {
  return !!termo && Array.isArray(termo.results)
    && Number(termo.faces) === Number(faces)
    && Number(termo.number) === Number(quantidade);
}

/** Soma dos resultados ativos de um termo de dados. */
function somaDoTermo(termo) {
  return (termo.results ?? [])
    .filter((r) => r.active !== false)
    .reduce((s, r) => s + (Number(r.result) || 0), 0);
}

/**
 * Ajusta um bônus em DADOS já rolado para uma nova quantidade.
 *
 * Aumentar rola só os dados que faltam (os que já saíram são preservados);
 * diminuir descarta os últimos. Zero vira um termo numérico "+0", que é o
 * marcador usado para reencontrar o bônus se a contagem voltar a subir.
 *
 * @returns {{antes: number, depois: number}|null}
 */
async function trocarDadosDoTermo(termos, indice, faces, novaQtd) {
  const termo = termos[indice];
  if (!termo) return null;
  const flavor = termo.options?.flavor ?? '';
  const ehDado = Array.isArray(termo.results);
  const antes = ehDado ? somaDoTermo(termo) : (Number(termo.number) || 0);
  const qtdAtual = ehDado ? (termo.results ?? []).length : 0;

  if (novaQtd <= 0) {
    termos[indice] = {
      class: 'NumericTerm', number: 0, evaluated: true, options: { flavor }
    };
    return { antes, depois: 0 };
  }

  let resultados = ehDado ? [...termo.results] : [];
  if (novaQtd > qtdAtual) {
    // Rola apenas os dados adicionais
    const extra = await new Roll(`${novaQtd - qtdAtual}d${faces}`).evaluate();
    const novos = extra.dice[0]?.results ?? [];
    resultados = resultados.concat(novos.map((r) => ({ result: r.result, active: true })));
  } else if (novaQtd < qtdAtual) {
    resultados = resultados.slice(0, novaQtd);
  }

  termos[indice] = {
    class: 'Die',
    number: novaQtd,
    faces,
    modifiers: termo.modifiers ?? [],
    results: resultados,
    evaluated: true,
    options: { flavor }
  };
  return { antes, depois: somaDoTermo(termos[indice]) };
}

/**
 * Reescreve o bônus da combinação numa mensagem já postada.
 * Mexe direto no JSON das rolagens (sem re-rolar nada): troca o valor do termo
 * e ajusta o total pela diferença.
 */
async function reescreverBonusNaMensagem(message, registro, novoValor) {
  const brutos = message.toObject().rolls ?? [];
  if (!brutos.length) return null;

  const dados = brutos.map((r) => (typeof r === 'string' ? JSON.parse(r) : foundry.utils.deepClone(r)));
  let iRoll = registro.indiceRoll ?? dados.findIndex((d) => d.options?.type === 'damage');
  if (iRoll < 0 || !dados[iRoll]) iRoll = dados.length - 1;
  const roll = dados[iRoll];
  const termos = roll?.terms ?? [];

  // Bônus em DADOS (Chute Circular): o termo é Nd6 quando a contagem é > 0,
  // e um "+0" quando é 0 — a busca aceita as duas formas.
  const faces = Number(registro.dados) || 0;
  const combina = (termo) => (faces
    ? (ehDadoDe(termo, faces, registro.valor) || ehNumerico(termo, 0) && registro.valor === 0)
    : ehNumerico(termo, registro.valor));

  // Índice já conhecido; se não bater mais, procura de trás para frente
  // (o bônus da combinação é adicionado por último na fórmula)
  let iTermo = registro.indiceTermo;
  if (!combina(termos[iTermo])) {
    iTermo = -1;
    for (let i = termos.length - 1; i >= 0; i--) {
      if (combina(termos[i])) { iTermo = i; break; }
    }
  }
  if (iTermo < 0) return null; // não dá para identificar com segurança: não mexe

  let antigo;
  if (faces) {
    const troca = await trocarDadosDoTermo(termos, iTermo, faces, novoValor);
    if (!troca) return null;
    antigo = troca.antes;
    roll.total = (Number(roll.total) || 0) - troca.antes + troca.depois;
  } else {
    antigo = Number(termos[iTermo].number) || 0;
    termos[iTermo].number = novoValor;
    roll.total = (Number(roll.total) || 0) - antigo + novoValor;
  }

  const atualizacao = { rolls: dados.map((d) => JSON.stringify(d)) };

  // O cartão guarda o HTML da rolagem já renderizado: mexer só no JSON muda o
  // valor por baixo, mas a tela continua mostrando o número antigo. Por isso a
  // rolagem é re-renderizada e o bloco correspondente é trocado no conteúdo.
  const conteudo = await reescreverHtmlDaRolagem(message.content, roll, iRoll, antigo, novoValor);
  if (conteudo) atualizacao.content = conteudo;

  await message.update(atualizacao);
  return { indiceRoll: iRoll, indiceTermo: iTermo };
}

/**
 * Troca, no HTML do cartão, o bloco da rolagem alterada por uma renderização
 * nova (fórmula, detalhamento e total). Devolve null se não achar o bloco —
 * aí o conteúdo fica como está, sem risco de corromper a mensagem.
 */
async function reescreverHtmlDaRolagem(conteudo, dadosRoll, indice, antigo, novo) {
  if (!conteudo) return null;
  try {
    const doc = new DOMParser().parseFromString(conteudo, 'text/html');
    const blocos = doc.querySelectorAll('div.dice-roll');
    const bloco = blocos[indice] ?? (blocos.length === 1 ? blocos[0] : null);
    if (!bloco) return null;

    const roll = Roll.fromData(foundry.utils.deepClone(dadosRoll));
    const html = await roll.render();
    const novoBloco = new DOMParser().parseFromString(html, 'text/html')
      .querySelector('div.dice-roll');
    if (!novoBloco) return null;
    bloco.replaceWith(doc.importNode(novoBloco, true));

    // Mantém o rótulo do aprimoramento coerente ("contagem +2" → "+3")
    let saida = doc.body.innerHTML;
    const rotuloAntigo = `(contagem +${antigo})`;
    if (saida.includes(rotuloAntigo)) {
      saida = saida.replaceAll(rotuloAntigo, `(contagem +${novo})`);
    }
    return saida;
  } catch (err) {
    console.warn(`${MODULE_ID} | Não foi possível redesenhar a rolagem no cartão`, err);
    return null;
  }
}

/**
 * Põe a última mensagem de cada combinação retroativa em dia com a contagem.
 * Chamado sempre que a contagem daquele oponente muda.
 */
async function atualizarMensagensRetroativas(ator, chaveAlvo) {
  const registros = foundry.utils.deepClone(registrosRetroativos(ator));
  if (foundry.utils.isEmpty(registros)) return;

  const valorAtual = contagemAtual(ator, chaveAlvo);
  let mudou = false;

  for (const [itemId, reg] of Object.entries(registros)) {
    if (reg.alvo !== chaveAlvo) continue;          // outro oponente: não mexe
    if (reg.valor === valorAtual) continue;

    const message = game.messages.get(reg.mensagem);
    if (!message) { delete registros[itemId]; mudou = true; continue; }
    if (!message.isAuthor && !game.user.isGM) continue;

    const posicao = await reescreverBonusNaMensagem(message, reg, valorAtual);
    if (!posicao) continue;

    registros[itemId] = { ...reg, valor: valorAtual, ...posicao };
    mudou = true;
  }

  if (mudou) await ator.setFlag(MODULE_ID, FLAG_RETRO, registros);
}

/**
 * Marca a mensagem recém-criada como a "viva" daquela combinação — a anterior
 * para de ser atualizada a partir daqui.
 */
async function registrarMensagemRetroativa(message) {
  const ator = message.getSpeakerActor?.() ?? (message.speaker?.actor
    ? game.actors.get(message.speaker.actor) : null);
  if (!ator?.isOwner) return;
  if (!message.rolls?.length) return;

  const combinacoes = poderesDeCombinacao(ator).filter((i) => definicaoDe(i).combinacao.retroativo);
  if (!combinacoes.length) return;

  // Só conta se a combinação foi de fato marcada nesta rolagem
  const conteudo = message.content ?? '';
  const usadas = combinacoes.filter((i) => conteudo.includes(i.name));
  if (!usadas.length) return;

  // Registra contra o mesmo oponente que o efeito usou (a maior contagem
  // entre os alvos), senão a correção nunca casaria com vários alvos mirados.
  const { valor, token: alvo } = maiorContagemMirada(ator);
  const registros = foundry.utils.deepClone(registrosRetroativos(ator));
  for (const item of usadas) {
    // `retroativo` pode ser true (bônus numérico) ou { dados: N } (Nd6)
    const modo = definicaoDe(item).combinacao.retroativo;
    registros[item.id] = {
      mensagem: message.id,
      alvo: alvo?.id ?? null,
      valor,
      dados: modo?.dados ?? null
    };
  }
  await ator.setFlag(MODULE_ID, FLAG_RETRO, registros);
}

/* --- Efeitos que a Combinação aplica no oponente (ou em si) ------------- */

/** Flag no EFEITO aplicado: de quem veio, de qual poder e contra qual token. */
const FLAG_DEBUFF = 'combDebuff';

/**
 * Todos os efeitos que uma Combinação mantém num destino, na ordem da ficha.
 *
 * Devolve lista, e não o primeiro achado, porque dois efeitos iguais SOMAM na
 * ficha — a penalidade sairia dobrada. Quem chama fica com o primeiro e apaga
 * o resto.
 *
 * `alvo: null` é o efeito aplicado no próprio personagem (o bônus de Defesa do
 * Um-Dois), que não pertence a um oponente específico.
 */
function efeitosDeCombinacao(destino, { ator, item, alvo }) {
  return (destino?.effects ?? []).filter((ef) => {
    const d = ef.getFlag(MODULE_ID, FLAG_DEBUFF);
    if (!d || d.ator !== ator || d.item !== item) return false;
    return alvo ? d.alvo === alvo : !d.alvo;
  });
}

/**
 * Flag no ATOR que aplicou: condições que o módulo ligou, para poder desligar
 * exatamente as mesmas depois — { [tokenId|'proprio']: { [itemId]: [cond…] } }.
 * Condições não são efeitos do módulo (são status do sistema), então sem esse
 * registro não haveria como saber quais foram postas por uma Combinação.
 */
const FLAG_CONDICOES = 'condicoesDeCombinacao';

/** Ator de um token pelo id (procura na cena atual e depois nas demais). */
function atorDoToken(tokenId) {
  if (!tokenId) return null;
  const naCena = canvas?.scene?.tokens?.get(tokenId);
  if (naCena?.actor) return naCena.actor;
  for (const cena of game.scenes ?? []) {
    const token = cena.tokens.get(tokenId);
    if (token?.actor) return token.actor;
  }
  return null;
}

/** Registra as condições ligadas por um poder, para desfazer depois. */
async function registrarCondicoes(ator, chave, itemId, condicoes) {
  if (!condicoes?.length) return;
  const tudo = foundry.utils.deepClone(ator.getFlag(MODULE_ID, FLAG_CONDICOES) ?? {});
  const alvo = chave ?? 'proprio';
  tudo[alvo] = {
    ...(tudo[alvo] ?? {}),
    [itemId]: {
      condicoes: [...condicoes],
      ...marcaAplicacaoAtual(ator)
    }
  };
  await ator.setFlag(MODULE_ID, FLAG_CONDICOES, tudo);
}

/**
 * Encerra somente as aplicações feitas em rodadas anteriores.
 * A contagem continuar subindo não renova automaticamente Chute no Joelho,
 * Um-Dois ou qualquer outra condição: o poder precisa ser aplicado de novo.
 */
async function expirarAplicacoesCombinacao(combate, anterior = {}) {
  if (!game.user.isGM || game.user !== game.users.activeGM) return 0;
  const combateId = combate?.id;
  const rodada = Number(combate?.round) || 0;
  if (!combateId) return 0;

  let removidos = 0;

  for (const destino of atoresComEfeitos()) {
    for (const efeito of [...(destino.effects ?? [])]) {
      const marca = efeito.getFlag(MODULE_ID, FLAG_DEBUFF);
      const origem = indiceCombinacoes.listar().find((ator) => ator.id === marca?.ator);
      const combatenteEsperado = combatenteDoAtor(combate, origem)?.id ?? null;
      if (!marca || !aplicacaoExpirada(marca, combateId, rodada, {
        ...anterior, combatenteEsperado
      })) continue;
      await efeito.delete();
      removidos++;
    }
  }

  for (const origem of indiceCombinacoes.listar()) {
    const tudo = origem.getFlag(MODULE_ID, FLAG_CONDICOES) ?? {};
    for (const [chave, porItem] of Object.entries(tudo)) {
      for (const [itemId, registro] of Object.entries(porItem ?? {})) {
        const combatenteEsperado = combatenteDoAtor(combate, origem)?.id ?? null;
        if (!aplicacaoExpirada(registro, combateId, rodada, {
          ...anterior, combatenteEsperado
        })) continue;
        const destino = chave === 'proprio' ? origem : atorDoToken(chave);
        if (destino) {
          for (const cond of normalizarRegistroCondicoes(registro).condicoes) {
            try { await destino.toggleStatusEffect(cond, { active: false }); removidos++; }
            catch (err) { console.warn(`${MODULE_ID} | Condição "${cond}" não removida`, err); }
          }
        }
        await origem.update({
          [`flags.${MODULE_ID}.${FLAG_CONDICOES}.${chave}.-=${itemId}`]: null
        });
      }
    }
  }
  return removidos;
}

/**
 * Retira tudo que as Combinações deste ator puseram num oponente: os efeitos
 * numéricos criados pelo módulo e as condições que ele ligou.
 *
 * Usado quando a contagem acaba — por expirar sozinha ou por ser zerada —,
 * para os debuffs não ficarem pendurados na criatura.
 */
async function removerEfeitosDaCombinacao(ator, chaveAlvo) {
  if (!ator) return 0;
  let removidos = 0;

  // 1) Efeitos numéricos criados pelo módulo
  for (const destino of atoresComEfeitos()) {
    if (!destino.isOwner && !game.user.isGM) continue;
    for (const efeito of [...(destino.effects ?? [])]) {
      const d = efeito.getFlag(MODULE_ID, FLAG_DEBUFF);
      if (!d || d.ator !== ator.id) continue;
      if ((d.alvo ?? null) !== (chaveAlvo ?? null)) continue;
      await efeito.delete();
      removidos++;
    }
  }

  // 2) Condições do sistema que o módulo ligou
  const tudo = foundry.utils.deepClone(ator.getFlag(MODULE_ID, FLAG_CONDICOES) ?? {});
  const chave = chaveAlvo ?? 'proprio';
  const porItem = tudo[chave];
  if (porItem) {
    const destino = chaveAlvo ? atorDoToken(chaveAlvo) : ator;
    if (destino && (destino.isOwner || game.user.isGM)) {
      for (const registro of Object.values(porItem)) {
        for (const cond of normalizarRegistroCondicoes(registro).condicoes) {
          try { await destino.toggleStatusEffect(cond, { active: false }); removidos++; }
          catch (err) { console.warn(`${MODULE_ID} | Condição "${cond}" não removida`, err); }
        }
      }
    }
    await ator.update({
      [`flags.${MODULE_ID}.${FLAG_CONDICOES}.-=${chave}`]: null
    });
  }

  return removidos;
}

/**
 * Se o personagem não tem mais nenhuma contagem viva, tira também o que as
 * Combinações aplicaram nele mesmo (o bônus de Defesa do Um-Dois).
 */
async function removerEfeitosProprios(ator) {
  const tudo = ator.getFlag(MODULE_ID, FLAG_COMBINACOES) ?? {};
  const rodada = rodadaAtual();
  const aindaVivo = Object.values(tudo).some((h) => contagemNaRodada(h ?? [], rodada) > 0);
  if (aindaVivo) return 0;
  return removerEfeitosDaCombinacao(ator, null);
}

/**
 * Combinações que aparecem como aprimoramento aplicado neste cartão.
 * O sistema lista os efeitos de uso marcados em `.card-upgrades`, então dá
 * para mostrar só os botões da combinação que o jogador realmente usou.
 */
function combinacoesUsadasNoCard(card, ator, itemDoCard) {
  const combinacoes = poderesDeCombinacao(ator);
  const texto = card.querySelector('.card-upgrades')?.textContent ?? '';
  const usadas = combinacoes.filter((i) => texto.includes(i.name));
  // No cartão do próprio poder, ele conta como usado
  if (itemDoCard && combinacoes.some((i) => i.id === itemDoCard.id)
      && !usadas.some((i) => i.id === itemDoCard.id)) {
    usadas.push(itemDoCard);
  }
  return usadas;
}

/** Destinos do efeito: o próprio personagem, ou cada oponente mirado. */
function destinosDoEfeito(item, spec) {
  if (spec.alvo === 'proprio') {
    return item.actor ? [{ ator: item.actor, token: null, chave: null }] : [];
  }
  return alvosMirados()
    .filter((t) => t.actor)
    .map((t) => ({ ator: t.actor, token: t, chave: t.id }));
}


/**
 * Aplica (ou atualiza) o efeito da combinação em cada destino, com as
 * condições e as penalidades proporcionais à contagem daquele oponente.
 *
 * Com vários inimigos mirados, cada um recebe o efeito com a SUA contagem —
 * a contagem é individual por oponente.
 */
async function aplicarEfeitoCombinacao(item) {
  const def = definicaoDe(item);
  const spec = def?.combinacao?.efeitoAlvo;
  if (!spec) return;

  const destinos = destinosDoEfeito(item, spec);
  if (!destinos.length) {
    return ui.notifications.warn(game.i18n.localize('T20HaydGMTools.CombPrecisaAlvo'));
  }

  const aplicados = [];
  for (const { ator: destino, token, chave } of destinos) {
    if (!destino.isOwner && !game.user.isGM) {
      ui.notifications.warn(game.i18n.localize('T20HaydGMTools.CombSemPermissao'));
      continue;
    }

    // Contagem do oponente deste destino (para "próprio", a maior mirada)
    const valor = chave
      ? contagemAtual(item.actor, chave)
      : maiorContagemMirada(item.actor).valor;
    const changes = spec.changes?.(valor) ?? [];

    // Condições do sistema (enjoado, lento, vulnerável, caído…)
    const ligadas = [];
    for (const cond of spec.condicoes ?? []) {
      try {
        await destino.toggleStatusEffect(cond, { active: true });
        ligadas.push(cond);
      } catch (err) {
        console.warn(`${MODULE_ID} | Condição "${cond}" não aplicada`, err);
      }
    }
    // Guarda o que foi ligado, para desligar quando a contagem acabar
    await registrarCondicoes(item.actor, chave, item.id, ligadas);

    // Efeito numérico próprio, atualizado se já existir
    const marca = {
      ator: item.actor.id,
      item: item.id,
      alvo: chave,
      ...marcaAplicacaoAtual(item.actor)
    };
    // Pode haver mais de um se algo saiu do previsto (dois clientes aplicando
    // ao mesmo tempo, token trocado). Dois efeitos iguais SOMAM na ficha e a
    // penalidade sai dobrada, então sobra só um.
    const iguais = efeitosDeCombinacao(destino, marca);
    const existente = iguais[0];
    for (const extra of iguais.slice(1)) await extra.delete();

    if (!changes.length) {
      if (existente) await existente.delete();
    } else {
      const dados = {
        // Bônus em si mesmo usa "+"; penalidade no oponente usa "−"
        name: `${item.name} (${valor > 0 ? `${chave ? '−' : '+'}${valor}` : '0'})`,
        img: item.img,
        disabled: false,
        changes,
        duration: { rounds: spec.rodadas ?? 1 },
        flags: {
          tormenta20: { onuse: false, custo: '0' },
          [MODULE_ID]: { [FLAG_DEBUFF]: marca }
        }
      };
      if (existente) await existente.update(dados);
      else await destino.createEmbeddedDocuments('ActiveEffect', [{ ...dados, origin: item.uuid }]);
    }

    aplicados.push(token?.name ?? destino.name);
  }

  if (!aplicados.length) return;
  const nomes = (spec.condicoes ?? []).join(', ');
  ui.notifications.info(game.i18n.format('T20HaydGMTools.CombEfeitoAplicado', {
    poder: item.name,
    alvo: aplicados.join(', '),
    extra: nomes ? ` (${nomes})` : ''
  }));
}


/**
 * Põe em dia os efeitos já aplicados que dependem da contagem — chamado
 * sempre que a contagem muda, para o debuff acompanhar o número de acertos.
 */
async function atualizarDebuffsAplicados(ator, chaveAlvo) {
  const valorDoAlvo = contagemAtual(ator, chaveAlvo);
  // Efeitos aplicados no PRÓPRIO personagem (Um-Dois) ficam registrados com
  // alvo nulo — eles seguem a maior contagem entre os oponentes mirados, e não
  // um oponente específico. Sem isso, o bônus de Defesa só mudava ao reaplicar.
  const valorProprio = maiorContagemMirada(ator).valor;

  for (const item of poderesDeCombinacao(ator)) {
    const spec = definicaoDe(item)?.combinacao?.efeitoAlvo;
    if (!spec?.changes) continue;
    const proprio = spec.alvo === 'proprio';
    const valor = proprio ? valorProprio : valorDoAlvo;

    for (const destino of atoresComEfeitos()) {
      if (!destino.isOwner && !game.user.isGM) continue;
      const iguais = efeitosDeCombinacao(destino, {
        ator: ator.id, item: item.id, alvo: proprio ? null : chaveAlvo
      });
      const efeito = iguais[0];
      if (!efeito) continue;
      // Duplicatas somariam na ficha; deixa uma só antes de atualizar o valor
      for (const extra of iguais.slice(1)) await extra.delete();

      const changes = spec.changes(valor);
      if (!changes.length) { await efeito.delete(); continue; }
      const sinal = proprio ? '+' : '−';
      await efeito.update({ name: `${item.name} (${sinal}${valor})`, changes });
    }
  }
}

/**
 * Refaz TODOS os efeitos de Combinação já aplicados por este personagem,
 * cada um com a contagem atual do oponente em que ele está.
 *
 * É a rede de segurança: a atualização automática cobre o caso normal, mas
 * este botão garante o acerto depois de qualquer coisa fora do previsto
 * (combate reiniciado, token trocado, efeito aplicado por outro cliente).
 *
 * @returns {Promise<number>} quantos efeitos foram refeitos
 */
async function reaplicarEfeitosCombinacao(ator) {
  const poderes = poderesDeCombinacao(ator).filter((i) => definicaoDe(i)?.combinacao?.efeitoAlvo);
  if (!poderes.length) return 0;

  let refeitos = 0;
  for (const destino of atoresComEfeitos()) {
    if (!destino.isOwner && !game.user.isGM) continue;
    for (const efeito of [...(destino.effects ?? [])]) {
      const marca = efeito.getFlag(MODULE_ID, FLAG_DEBUFF);
      if (!marca || marca.ator !== ator.id) continue;

      const item = poderes.find((i) => i.id === marca.item);
      if (!item) continue;
      const spec = definicaoDe(item).combinacao.efeitoAlvo;

      // Contagem do oponente onde o efeito está (ou a maior mirada, para
      // efeitos aplicados no próprio personagem)
      const valor = marca.alvo
        ? contagemAtual(ator, marca.alvo)
        : maiorContagemMirada(ator).valor;
      const changes = spec.changes?.(valor) ?? [];

      if (!changes.length) await efeito.delete();
      else {
        const sinal = marca.alvo ? '−' : '+';
        await efeito.update({ name: `${item.name} (${sinal}${valor})`, changes });
      }
      refeitos++;
    }
  }
  return refeitos;
}

/**
 * Atores que podem carregar efeitos aplicados.
 *
 * Inclui os atores do mundo E os atores sintéticos dos tokens não vinculados
 * — que são a maioria dos inimigos e NÃO aparecem em `game.actors`. Sem isso,
 * o debuff aplicado num goblin nunca era reencontrado para ser atualizado.
 */
function atoresComEfeitos() {
  const lista = new Set(game.actors);
  for (const cena of game.scenes ?? []) {
    for (const token of cena.tokens ?? []) {
      if (token.actor) lista.add(token.actor);
    }
  }
  return lista;
}

/** Barra com o botão de aplicar o efeito da combinação usada. */
function montarBarraEfeitoAlvo(item) {
  const def = definicaoDe(item);
  const spec = def.combinacao.efeitoAlvo;

  const barra = document.createElement('footer');
  barra.className = 't20g-auto-barra';

  const linha = document.createElement('div');
  linha.className = 't20g-auto-linha';

  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 't20g-auto-btn t20g-auto-btn-largo';
  botao.dataset.acaoEfeito = item.id;
  botao.dataset.tooltip = spec.dica ?? '';
  const i = document.createElement('i');
  i.className = spec.icone ?? 'fa-solid fa-bolt';
  botao.append(i, ` ${spec.rotulo}`);

  linha.appendChild(botao);
  barra.appendChild(linha);
  return barra;
}

/**
 * Barra de contagem das Combinações: UMA linha por oponente mirado.
 *
 * A contagem é individual por inimigo, então com vários alvos marcados cada um
 * ganha a própria linha e os próprios botões — nada de adivinhar "o alvo".
 */
function montarBarraCombinacoes(ator, { completo }) {
  const controla = podeControlar(ator);
  // Quem controla enxerga pelos próprios alvos (é assim que ele age); quem só
  // assiste enxerga o que está registrado na ficha.
  const alvos = controla
    ? alvosMirados()
    : oponentesComContagem(ator, (id) => contagemAtual(ator, id));

  // Espectador sem nada registrado não precisa de barra nenhuma no cartão.
  if (!controla && !alvos.length) return null;

  const barra = document.createElement('footer');
  barra.className = 't20g-auto-barra t20g-comb-barra';
  barra.dataset.actorId = ator.id;
  barra.dataset.completo = completo ? '1' : '0';

  if (!alvos.length) {
    const linha = document.createElement('div');
    linha.className = 't20g-auto-linha';
    const rotulo = document.createElement('div');
    rotulo.className = 't20g-auto-rotulo';
    const icone = document.createElement('i');
    icone.className = 'fa-solid fa-hand-fist';
    rotulo.append(icone, ` ${game.i18n.localize('T20HaydGMTools.CombContagem')}`);
    const dica = document.createElement('span');
    dica.className = 't20g-comb-alvo';
    dica.textContent = game.i18n.localize('T20HaydGMTools.CombSemAlvo');
    rotulo.appendChild(dica);
    linha.appendChild(rotulo);
    barra.appendChild(linha);
    return barra;
  }

  for (const alvo of alvos) {
    const valor = contagemAtual(ator, alvo.id);

    const linha = document.createElement('div');
    linha.className = 't20g-auto-linha';

    const rotulo = document.createElement('div');
    rotulo.className = 't20g-auto-rotulo';
    const icone = document.createElement('i');
    icone.className = 'fa-solid fa-hand-fist';
    rotulo.append(icone, ` ${game.i18n.localize('T20HaydGMTools.CombContagem')}: `);
    const numero = document.createElement('b');
    numero.textContent = `+${valor}`;
    rotulo.appendChild(numero);
    const nomeAlvo = document.createElement('span');
    nomeAlvo.className = 't20g-comb-alvo';
    nomeAlvo.textContent = game.i18n.format('T20HaydGMTools.CombVs', { alvo: alvo.name });
    rotulo.appendChild(nomeAlvo);
    linha.appendChild(rotulo);

    const botao = (acao, ic, dica) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 't20g-auto-btn';
      b.dataset.acaoComb = acao;
      b.dataset.actorId = ator.id;
      b.dataset.tokenId = alvo.id;   // cada linha age no SEU oponente
      b.dataset.tooltip = dica;
      const i = document.createElement('i');
      i.className = `fa-solid ${ic}`;
      b.appendChild(i);
      return b;
    };

    if (podeControlar(ator)) {
      linha.appendChild(botao('menos', 'fa-minus',
        game.i18n.format('T20HaydGMTools.CombDiminuirAlvo', { alvo: alvo.name })));
      linha.appendChild(botao('mais', 'fa-plus',
        game.i18n.format('T20HaydGMTools.CombAumentarAlvo',
          { valor: incrementoDaContagem(ator), alvo: alvo.name })));
      if (completo) {
        linha.appendChild(botao('zerar', 'fa-rotate-left',
          game.i18n.format('T20HaydGMTools.CombZerarAlvo', { alvo: alvo.name })));
      }
    }
    barra.appendChild(linha);
  }

  // Botão de segurança: refaz os efeitos já aplicados nas criaturas com a
  // contagem atual de cada uma.
  if (completo && podeControlar(ator)) {
    const rodape = document.createElement('div');
    rodape.className = 't20g-auto-linha';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 't20g-auto-btn t20g-auto-btn-largo';
    b.dataset.acaoComb = 'reaplicar';
    b.dataset.actorId = ator.id;
    b.dataset.tooltip = game.i18n.localize('T20HaydGMTools.CombReaplicarDica');
    const i = document.createElement('i');
    i.className = 'fa-solid fa-arrows-rotate';
    b.append(i, ` ${game.i18n.localize('T20HaydGMTools.CombReaplicar')}`);
    rodape.appendChild(b);
    barra.appendChild(rodape);
  }

  return barra;
}


/* ─── Estudar o Adversário ───────────────────────────────────────────────── */

/** Flag no ATOR: `{ [tokenId]: { n, r, c } }` — ver estudar-adversario.mjs. */
const FLAG_ESTUDO = 'estudarAdversario';

/** Poderes do ator com a automação de estudo. */
function poderesDeEstudo(ator) {
  return ator?.items?.filter((i) => definicaoDe(i)?.estudo) ?? [];
}

const indiceEstudo = new IndiceAtoresAutomacoes(
  (ator) => poderesDeEstudo(ator).length > 0
);

/** Registro do ator contra um oponente, já normalizado. */
function registroEstudo(ator, chaveAlvo) {
  const tudo = ator?.getFlag?.(MODULE_ID, FLAG_ESTUDO) ?? {};
  return normalizarEstudo(tudo[chaveAlvo]);
}

/** Pontos acumulados contra um oponente. */
function contagemEstudo(ator, chaveAlvo) {
  return chaveAlvo ? registroEstudo(ator, chaveAlvo).n : 0;
}

/** Maior estudo entre os oponentes mirados, com o token correspondente. */
function maiorEstudoMirado(ator) {
  let melhor = { valor: 0, token: null };
  for (const token of alvosMirados()) {
    const valor = contagemEstudo(ator, token.id);
    if (valor > melhor.valor || !melhor.token) melhor = { valor, token };
  }
  return melhor;
}

/** Grava (ou remove) o registro de um oponente. */
async function gravarEstudo(ator, chaveAlvo, registro) {
  const tudo = foundry.utils.deepClone(ator.getFlag(MODULE_ID, FLAG_ESTUDO) ?? {});
  if (registro) {
    tudo[chaveAlvo] = registro;
    await ator.setFlag(MODULE_ID, FLAG_ESTUDO, tudo);
    return;
  }
  // setFlag faz MERGE: apagar a chave do objeto não a remove no banco.
  delete tudo[chaveAlvo];
  await ator.update({
    [`flags.${MODULE_ID}.${FLAG_ESTUDO}.-=${chaveAlvo}`]: null
  });
}

/** Registra um ataque errado contra o oponente. */
async function somarEstudo(ator, chaveAlvo) {
  await gravarEstudo(ator, chaveAlvo, registrarEstudo(registroEstudo(ator, chaveAlvo)));
  await sincronizarEstudo(ator);
}

/** Desfaz o último ponto contra aquele oponente. */
async function subtrairEstudo(ator, chaveAlvo) {
  const atual = registroEstudo(ator, chaveAlvo);
  if (atual.n <= 0) {
    return ui.notifications.info(game.i18n.localize('T20HaydGMTools.EstudoNoMinimo'));
  }
  await gravarEstudo(ator, chaveAlvo, desfazerEstudo(atual));
  await sincronizarEstudo(ator);
}

/** Zera o estudo contra aquele oponente. */
async function zerarEstudo(ator, chaveAlvo) {
  await gravarEstudo(ator, chaveAlvo, null);
  await sincronizarEstudo(ator);
}

/**
 * Fila por ator, pelo mesmo motivo das Combinações: trocar de alvo dispara
 * duas sincronizações e a do valor antigo não pode terminar por último.
 */
const _filaEstudo = new Map();

function sincronizarEstudo(ator) {
  if (!ator?.id) return Promise.resolve();
  const anterior = _filaEstudo.get(ator.id) ?? Promise.resolve();
  const proxima = anterior.catch(() => {}).then(() => _sincronizarEstudo(ator));
  _filaEstudo.set(ator.id, proxima);
  return proxima;
}

/**
 * Põe o efeito de uso em dia com o oponente mirado.
 *
 * Diferente das Combinações, o efeito vem LIGADO: o bônus é automático contra
 * aquele alvo, não uma escolha do jogador. Sem alvo mirado (ou com contagem
 * zero) o efeito sai da ficha, para não sugerir um bônus que não existe.
 */
async function _sincronizarEstudo(ator) {
  if (!ator?.isOwner) return;
  const poderes = poderesDeEstudo(ator);
  if (!poderes.length) return;

  const { valor, token } = maiorEstudoMirado(ator);
  const contra = token ? ` vs ${token.name}` : '';

  for (const item of poderes) {
    const def = definicaoDe(item);
    const changes = def.estudo.changes(valor);
    const efeito = efeitoPorChave(ator, item.id);

    if (!changes.length) {
      if (efeito) await efeito.delete();
      continue;
    }

    const dados = {
      name: `${item.name} (+${bonusDoEstudo(valor)}${contra})`,
      img: item.img,
      disabled: false,
      changes,
      flags: {
        tormenta20: { onuse: true, ...def.estudo.alvos },
        [MODULE_ID]: { [FLAG_ORIGEM]: item.id }
      }
    };

    if (efeito) {
      if (!efeitoEmDia(efeito, dados)) await efeito.update(dados);
    } else {
      await ator.createEmbeddedDocuments('ActiveEffect', [{ ...dados, origin: item.uuid }]);
    }
  }
}

/** Atualiza as barras de estudo já renderizadas no chat. */
function atualizarBarrasEstudo(ator) {
  const seletor = `.t20g-estudo-barra[data-actor-id="${CSS.escape(ator.id)}"]`;
  for (const barra of document.querySelectorAll(seletor)) {
    const item = ator.items.get(barra.dataset.itemId);
    if (!item) continue;
    const nova = montarBarraEstudo(item, { completo: barra.dataset.completo === '1' });
    if (!nova) { barra.remove(); continue; }
    if (nova.outerHTML === barra.outerHTML) continue;
    barra.replaceWith(nova);
  }
}

/** Estudos ainda acesos, por ator e oponente (para o lembrete de fim de cena). */
function estudosAcesos() {
  const acesos = [];
  for (const ator of indiceEstudo.listar()) {
    const tudo = ator.getFlag(MODULE_ID, FLAG_ESTUDO) ?? {};
    for (const [tokenId, registro] of Object.entries(tudo)) {
      const { n } = normalizarEstudo(registro);
      if (n <= 0) continue;
      // Oponente que saiu da mesa não entra no aviso — só na limpeza.
      const oponente = nomeDoToken(tokenId);
      if (!oponente) continue;
      acesos.push({ ator, tokenId, valor: n, oponente });
    }
  }
  return acesos;
}

/** Todos os registros persistidos, inclusive de tokens que já saíram da cena. */
function estudosRegistrados() {
  const registros = [];
  for (const ator of indiceEstudo.listar()) {
    const tudo = ator.getFlag(MODULE_ID, FLAG_ESTUDO) ?? {};
    for (const tokenId of Object.keys(tudo)) registros.push({ ator, tokenId });
  }
  return registros;
}

/**
 * Barra da contagem de estudo: uma linha por oponente mirado.
 *
 * O rótulo usa o nome e o ícone do próprio poder, como nas automações de
 * contador (Sangue dos Inimigos e afins) — é assim que o jogador reconhece
 * de onde vem o bônus no cartão.
 */
function montarBarraEstudo(item, { completo }) {
  const ator = item.actor;
  const def = definicaoDe(item);
  const controla = podeControlar(ator);
  // Mesma regra da barra de Combinações: quem age vê pelos próprios alvos,
  // quem assiste vê o que está registrado na ficha.
  const alvos = controla ? alvosMirados() : oponentesComEstudo(ator);

  if (!controla && !alvos.length) return null;

  const barra = document.createElement('footer');
  barra.className = 't20g-auto-barra t20g-estudo-barra';
  barra.dataset.actorId = ator.id;
  barra.dataset.itemId = item.id;
  barra.dataset.completo = completo ? '1' : '0';

  const cabecalho = (linha) => {
    const rotulo = document.createElement('div');
    rotulo.className = 't20g-auto-rotulo';
    const icone = document.createElement('i');
    icone.className = def.icone ?? 'fa-solid fa-wand-magic-sparkles';
    rotulo.append(icone, ` ${item.name}`);
    linha.appendChild(rotulo);
    return rotulo;
  };

  if (!alvos.length) {
    const linha = document.createElement('div');
    linha.className = 't20g-auto-linha';
    const rotulo = cabecalho(linha);
    const dica = document.createElement('span');
    dica.className = 't20g-comb-alvo';
    dica.textContent = game.i18n.localize('T20HaydGMTools.CombSemAlvo');
    rotulo.appendChild(dica);
    barra.appendChild(linha);
    return barra;
  }

  for (const alvo of alvos) {
    const valor = contagemEstudo(ator, alvo.id);

    const linha = document.createElement('div');
    linha.className = 't20g-auto-linha';
    const rotulo = cabecalho(linha);
    rotulo.append(': ');
    const numero = document.createElement('b');
    // O que interessa na mesa é o bônus, não a quantidade de pontos.
    numero.textContent = `+${bonusDoEstudo(valor)}`;
    rotulo.appendChild(numero);
    const nomeAlvo = document.createElement('span');
    nomeAlvo.className = 't20g-comb-alvo';
    nomeAlvo.textContent = game.i18n.format('T20HaydGMTools.CombVs', { alvo: alvo.name });
    rotulo.appendChild(nomeAlvo);

    const botao = (acao, ic, dica) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 't20g-auto-btn';
      b.dataset.acaoEstudo = acao;
      b.dataset.actorId = ator.id;
      b.dataset.tokenId = alvo.id;
      b.dataset.tooltip = dica;
      const i = document.createElement('i');
      i.className = `fa-solid ${ic}`;
      b.appendChild(i);
      return b;
    };

    if (podeControlar(ator)) {
      linha.appendChild(botao('menos', 'fa-minus',
        game.i18n.format('T20HaydGMTools.EstudoDiminuirAlvo', { alvo: alvo.name })));
      linha.appendChild(botao('mais', 'fa-plus',
        game.i18n.format('T20HaydGMTools.EstudoAumentarAlvo', { alvo: alvo.name })));
      if (completo) {
        linha.appendChild(botao('zerar', 'fa-rotate-left',
          game.i18n.format('T20HaydGMTools.EstudoZerarAlvo', { alvo: alvo.name })));
      }
    }
    barra.appendChild(linha);
  }

  return barra;
}

/* ─── Distribuição de projéteis entre alvos ──────────────────────────────── */

/**
 * Lê a rolagem de dano da mensagem e extrai a ESTRUTURA dela (quantos dados,
 * de quantas faces, quais bônus) — não os resultados.
 *
 * Os valores são deliberadamente descartados: as setas são roladas de novo
 * depois que o jogador decide a distribuição, para que ele não escolha o alvo
 * de cada seta já sabendo qual delas tirou o melhor dado.
 *
 * O sistema quebra a fórmula nos "+", e a parte da magia é sempre a PRIMEIRA:
 * o primeiro grupo de dados são as setas e o número logo depois é o "+1 de
 * cada seta". Tudo que vier depois é bônus de efeito (dados extras como +1d6,
 * bônus fixos de INT etc.) e NÃO é seta — nem recebe o +1 da magia.
 *
 * @returns {{base: object, fixoBase: number, extras: object[]}|null}
 */
/** Flag no ITEM: o golpe montado pelo jogador. */
const FLAG_GOLPE = 'golpe';
/** Sufixo da chave do efeito extra de Carregado. */

/** Configuração vazia — a forma canônica de um golpe. */
function golpeVazio() {
  return {
    nome: '',
    sel: {},
    elemental: Object.fromEntries(GP_ELEMENTOS.map((t) => [t, 0])),
    distante: { alcance: '' },
    magia: { uuid: '', nome: '' }
  };
}

/** Golpe montado no item, normalizado (ou null quando ainda não há um). */
function golpeDoItem(item) {
  const bruto = item?.getFlag?.(MODULE_ID, FLAG_GOLPE);
  if (!bruto) return null;
  const vazio = golpeVazio();
  return {
    ...vazio,
    ...bruto,
    sel: { ...bruto.sel },
    elemental: { ...vazio.elemental, ...bruto.elemental },
    distante: { ...vazio.distante, ...bruto.distante },
    magia: { ...vazio.magia, ...bruto.magia }
  };
}

/** Quantas vezes um efeito foi escolhido (0 = não escolhido). */
function gpQuantidade(cfg, ef) {
  if (ef.controle === 'elemental') {
    return GP_ELEMENTOS.reduce((soma, t) => soma + (Number(cfg.elemental[t]) || 0), 0);
  }
  if (ef.controle === 'qtd') return Math.min(Number(cfg.sel[ef.id]) || 0, ef.max ?? 1);
  return cfg.sel[ef.id] ? 1 : 0;
}

/**
 * Custo do golpe.
 *
 * Reduções não se acumulam: por mais fontes que o golpe tenha, só a maior
 * vale. O mínimo é 1 PM, como manda o poder.
 */
function custoDoGolpe(cfg) {
  let bruto = 0;
  let reducao = 0;
  for (const ef of GP_EFEITOS) {
    const n = gpQuantidade(cfg, ef);
    if (!n) continue;
    if (ef.reducao) reducao = Math.max(reducao, ef.reducao);
    else bruto += ef.custo * n;
  }
  return { bruto, reducao, total: Math.max(1, bruto - reducao) };
}

/** Efeitos escolhidos, na ordem do catálogo. */
function efeitosEscolhidos(cfg) {
  return GP_EFEITOS.filter((ef) => gpQuantidade(cfg, ef) > 0);
}

/** Nome do efeito de uso. */
function nomeDoGolpe(item, cfg) {
  const base = `Golpe Pessoal: ${cfg.nome?.trim() || item.name}`;
  // Com Sequencial o dado muda a cada acerto; sem isso na janela de rolagem o
  // jogador não teria como saber em que passo a cena está.
  return cfg.sel.sequencial ? `${base} (Sequencial ${passoSequencial(item)})` : base;
}

/** Mudanças do Efeito Ativo, na ordem do catálogo. */
function changesDoGolpe(item, cfg) {
  const changes = [];
  for (const ef of efeitosEscolhidos(cfg)) {
    if (ef.changes) changes.push(...ef.changes(cfg, item));
  }
  return changes;
}

/** Detalhe de um efeito escolhido (elemento, passos, magia, quantidade). */
function detalheDoEfeito(cfg, ef, n) {
  if (ef.controle === 'elemental') {
    return GP_ELEMENTOS.filter((t) => cfg.elemental[t] > 0)
      .map((t) => `+${2 * cfg.elemental[t]}d6 de ${rotuloDano(t).toLowerCase()}`)
      .join(', ');
  }
  if (ef.controle === 'alcance') {
    return cfg.distante.alcance ? rotuloAlcance(cfg.distante.alcance) : 'alcance não escolhido';
  }
  if (ef.controle === 'magia') return cfg.magia.nome || 'magia não escolhida';
  if (ef.controle === 'qtd' && n > 1) return `×${n}`;
  return '';
}

/** Resumo em HTML do golpe — vai na descrição do efeito e no diálogo. */
function resumoDoGolpe(item, cfg) {
  const linhas = efeitosEscolhidos(cfg).map((ef) => {
    const n = gpQuantidade(cfg, ef);
    const detalhe = detalheDoEfeito(cfg, ef, n);
    const custo = ef.reducao ? `−${ef.reducao}` : `+${ef.custo * n}`;
    return `<li><b>${ef.nome}</b>${detalhe ? ` (${detalhe})` : ''} — ${custo} PM</li>`;
  });
  const { total, reducao } = custoDoGolpe(cfg);
  const magia = cfg.sel.conjurador && cfg.magia.nome
    ? `<p>Conjurador: <b>${cfg.magia.nome}</b> — a magia cobra os PM dela na própria janela.</p>`
    : '';
  return `${linhas.length ? `<ul>${linhas.join('')}</ul>` : '<p><i>Nenhum efeito escolhido.</i></p>'}
    <p><b>Custo: ${total} PM</b>${reducao ? ` — redução aplicada: −${reducao} (só a maior vale)` : ''}.</p>
    ${magia}`;
}

/* --- Efeitos de uso do golpe --------------------------------------------- */

/**
 * Cria, atualiza ou remove os efeitos de uso do golpe.
 *
 * São no máximo dois: o golpe em si e, quando o jogador escolhe Carregado, um
 * segundo efeito sem custo que só entra quando ele de fato gastou a ação
 * padrão para energizar o ataque.
 */
async function sincronizarGolpe(item) {
  const ator = item.actor;
  if (!ator) return;

  const cfg = golpeDoItem(item);
  const principais = efeitosPorChave(ator, item.id);
  const extras = efeitosPorChave(ator, `${item.id}:${GP_CARREGADO}`);
  const principal = principais[0];
  const extra = extras[0];

  // Efeitos duplicados podem surgir por uma atualização antiga interrompida
  // ou por dois clientes agindo ao mesmo tempo. Além de poluir a ficha, o
  // sistema pode mostrar a cópia desatualizada na janela de uso.
  for (const duplicado of [...principais.slice(1), ...extras.slice(1)]) {
    await duplicado.delete();
  }

  if (!cfg) {
    if (principal) await principal.delete();
    if (extra) await extra.delete();
    return;
  }

  const { total } = custoDoGolpe(cfg);
  // Sem restrição de arma: qual arma o golpe usa é combinação de mesa, e
  // amarrar isso pelo nome do item só atrapalharia na hora de rolar.
  const base = { onuse: true, attack: true, items: '' };

  const dados = {
    name: nomeDoGolpe(item, cfg),
    img: item.img,
    disabled: true, // suspenso: o jogador marca na janela de rolagem
    description: resumoDoGolpe(item, cfg),
    changes: changesDoGolpe(item, cfg),
    flags: {
      tormenta20: { ...base, custo: String(total) },
      [MODULE_ID]: { [FLAG_ORIGEM]: item.id }
    }
  };
  if (principal) await principal.update(dados);
  else await ator.createEmbeddedDocuments('ActiveEffect', [{ ...dados, origin: item.uuid }]);

  if (!cfg.sel.carregado) {
    if (extra) await extra.delete();
    return;
  }

  // O +1 PM do Carregado já está no custo do golpe, então este efeito é grátis
  const dadosExtra = {
    name: `${nomeDoGolpe(item, cfg)} — Carregado`,
    img: item.img,
    disabled: true,
    description: 'Você gastou uma ação padrão para energizar o golpe: +2d8 de dano.',
    changes: [{ key: 'dano', mode: 2, value: '2d8', priority: 20 }],
    flags: {
      tormenta20: { ...base, custo: '0' },
      [MODULE_ID]: { [FLAG_ORIGEM]: `${item.id}:${GP_CARREGADO}` }
    }
  };
  if (extra) await extra.update(dadosExtra);
  else await ator.createEmbeddedDocuments('ActiveEffect', [{ ...dadosExtra, origin: item.uuid }]);
}

/** Ajusta o contador do Sequencial (delta) ou zera (delta === null). */
async function ajustarSequencial(item, delta) {
  const atual = valorContador(item);
  const teto = GP_SEQUENCIAL.length - 1;
  const novo = delta === null ? 0 : Math.min(Math.max(atual + delta, 0), teto);
  if (novo === atual) {
    return ui.notifications.info(
      delta > 0
        ? game.i18n.format('T20HaydGMTools.GPSeqNoLimite', { dado: GP_SEQUENCIAL[teto] })
        : game.i18n.format('T20HaydGMTools.AutoNoMinimo', { nome: item.name })
    );
  }
  await item.setFlag(MODULE_ID, FLAG_CONTADOR, novo);
  await sincronizarGolpe(item);
}

/* --- Conjurador: a magia sai antes do ataque ----------------------------- */

/** Evita que a janela da própria magia dispare a checagem de novo. */
let _conjurandoGolpe = false;

/** Ids dos efeitos de uso marcados na janela de rolagem. */
function efeitosMarcados(configuracao) {
  const ids = new Set();
  for (const [chave, valor] of Object.entries(configuracao ?? {})) {
    if (!valor) continue;
    const m = /^aprs\.([^.]+)\.aplica$/.exec(chave);
    if (m) ids.add(m[1]);
  }
  // A janela pode devolver o objeto já expandido, dependendo de quem chamou
  for (const [id, dados] of Object.entries(configuracao?.aprs ?? {})) {
    if (dados?.aplica) ids.add(id);
  }
  return ids;
}

/**
 * Acha a magia do Conjurador na ficha de quem vai golpear.
 *
 * Só magias que estão na ficha podem ser lançadas: o sistema precisa do ator
 * para cobrar os PM e montar o cartão. Por isso, se o UUID guardado apontar
 * para fora da ficha (um compêndio, por exemplo), procuramos pelo nome.
 */
async function magiaDoConjurador(ator, cfg) {
  const guardada = await fromUuid(cfg.magia.uuid).catch(() => null);
  if (guardada?.actor?.id === ator.id) return guardada;

  const nome = guardada?.name || cfg.magia.nome;
  return ator.items.find((i) => i.type === 'magia' && i.name === nome) ?? null;
}

/**
 * Lança as magias dos Golpes Pessoais marcados na janela de rolagem.
 *
 * Roda depois que o jogador confirma o uso e antes de o ataque ser rolado, que
 * é o que a regra pede: a magia é conjurada (cobrando os PM dela na própria
 * janela, com aprimoramentos e tudo) e só então o golpe sai.
 */
async function conjurarMagiasDoGolpe(item, configuracao) {
  const ator = item?.actor;
  if (!ator || _conjurandoGolpe) return;

  const marcados = efeitosMarcados(configuracao);
  if (!marcados.size) return;

  for (const id of marcados) {
    const chave = ator.effects.get(id)?.getFlag(MODULE_ID, FLAG_ORIGEM);
    if (typeof chave !== 'string') continue;

    const poder = ator.items.get(chave.split(':')[0]);
    const cfg = poder && definicaoDe(poder)?.golpe ? golpeDoItem(poder) : null;
    if (!cfg?.sel?.conjurador || !cfg.magia?.uuid) continue;

    const magia = await magiaDoConjurador(ator, cfg);
    if (!magia) {
      ui.notifications.warn(
        game.i18n.format('T20HaydGMTools.GPMagiaSumiu', {
          golpe: poder.name, magia: cfg.magia.nome || '—'
        })
      );
      continue;
    }

    _conjurandoGolpe = true;
    try {
      await magia.roll();
    } catch (err) {
      console.error(`${MODULE_ID} | Falha ao conjurar a magia do Golpe Pessoal`, err);
    } finally {
      _conjurandoGolpe = false;
    }
  }
}

/**
 * Enxerta a conjuração no fluxo de uso do sistema.
 *
 * `AbilityUseDialog.create` é o único ponto entre "o jogador confirmou o uso"
 * e "o ataque foi rolado" — depois dele o item já rola e monta o cartão. Por
 * isso o gancho é aqui, e não num hook de mensagem.
 */
function ligarConjurador() {
  const Dialogo = game.tormenta20?.applications?.AbilityUseDialog;
  if (!Dialogo || Dialogo._t20gGolpePessoal) return;

  const original = Dialogo.create;
  Dialogo.create = async function (item, ...resto) {
    const configuracao = await original.call(this, item, ...resto);
    // O wrapper permanece instalado para a configuração poder mudar sem
    // reiniciar o servidor, mas desligado devolve exatamente o fluxo original.
    if (automacoesAtivas() && configuracao) {
      await conjurarMagiasDoGolpe(item, configuracao).catch((err) =>
        console.error(`${MODULE_ID} | Falha ao preparar a magia do Golpe Pessoal`, err)
      );
    }
    return configuracao;
  };
  Dialogo._t20gGolpePessoal = true;
}

/* --- Construtor do golpe -------------------------------------------------- */

/** Linha de um efeito no construtor. */
function linhaConstrutor(ef, cfg) {
  const marcado = gpQuantidade(cfg, ef) > 0;
  const custo = ef.reducao ? `−${ef.reducao} PM` : `+${ef.custo} PM`;

  let controle;
  if (ef.controle === 'qtd') {
    controle = `<input type="number" name="ef-${ef.id}" class="t20g-gp-qtd" min="0"
      max="${ef.max}" step="1" value="${gpQuantidade(cfg, ef)}">`;
  } else if (ef.controle === 'elemental') {
    controle = '<span class="t20g-gp-semcheck"></span>';
  } else {
    controle = `<input type="checkbox" name="ef-${ef.id}" ${marcado ? 'checked' : ''}>`;
  }

  let extras = '';
  if (ef.controle === 'alcance') {
    const opcoes = GP_ALCANCES.map((a) =>
      `<option value="${a}" ${cfg.distante.alcance === a ? 'selected' : ''}>${rotuloAlcance(a)}</option>`
    ).join('');
    extras = `<div class="t20g-gp-extras">
      <label>${game.i18n.localize('T20HaydGMTools.GPAlcanceFinal')}</label>
      <select name="gp-alcance"><option value="">—</option>${opcoes}</select>
    </div>`;
  } else if (ef.controle === 'elemental') {
    extras = `<div class="t20g-gp-extras t20g-gp-elementos">
      ${GP_ELEMENTOS.map((t) => `<label>${rotuloDano(t)}
        <input type="number" name="elem-${t}" class="t20g-gp-qtd" min="0" max="9" step="1"
          value="${Number(cfg.elemental[t]) || 0}"></label>`).join('')}
    </div>`;
  } else if (ef.controle === 'magia') {
    extras = `<div class="t20g-gp-extras">
      <div class="t20g-gp-magia" data-vazio="${cfg.magia.uuid ? '0' : '1'}">
        <input type="hidden" name="gp-magia-uuid" value="${cfg.magia.uuid ?? ''}">
        <input type="hidden" name="gp-magia-nome" value="${foundry.utils.escapeHTML(cfg.magia.nome ?? '')}">
        <span class="t20g-gp-magia-nome">${cfg.magia.uuid
          ? foundry.utils.escapeHTML(cfg.magia.nome)
          : game.i18n.localize('T20HaydGMTools.GPArrasteMagia')}</span>
        <button type="button" class="t20g-gp-magia-limpar"
          data-tooltip="${game.i18n.localize('T20HaydGMTools.GPRemoverMagia')}">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>`;
  }

  return `<div class="t20g-gp-linha" data-efeito="${ef.id}">
    <div class="t20g-gp-controle">${controle}</div>
    <div class="t20g-gp-corpo">
      <div class="t20g-gp-cabeca">
        <b>${ef.nome}</b>
        <span class="t20g-gp-pm ${ef.reducao ? 't20g-gp-desconto' : ''}">${custo}</span>
      </div>
      <p class="t20g-gp-texto">${ef.texto}</p>
      ${ef.nota ? `<p class="notes">${ef.nota}</p>` : ''}
      ${extras}
    </div>
  </div>`;
}

/** Grupo de linhas com título. */
function grupoConstrutor(titulo, efeitos, cfg) {
  if (!efeitos.length) return '';
  return `<fieldset class="t20g-gp-grupo">
    <legend>${titulo}</legend>
    ${efeitos.map((ef) => linhaConstrutor(ef, cfg)).join('')}
  </fieldset>`;
}

/** Lê o formulário do construtor e devolve a configuração do golpe. */
function lerConstrutor(el) {
  const valor = (nome) => el.querySelector(`[name="${nome}"]`);
  const cfg = golpeVazio();

  cfg.nome = valor('gp-nome')?.value?.trim() ?? '';
  cfg.distante.alcance = valor('gp-alcance')?.value ?? '';
  cfg.magia.uuid = valor('gp-magia-uuid')?.value ?? '';
  cfg.magia.nome = valor('gp-magia-nome')?.value ?? '';

  for (const ef of GP_EFEITOS) {
    const campo = valor(`ef-${ef.id}`);
    if (!campo) continue;
    if (campo.type === 'checkbox') cfg.sel[ef.id] = campo.checked;
    else cfg.sel[ef.id] = Math.max(0, Number(campo.value) || 0);
  }
  for (const t of GP_ELEMENTOS) {
    cfg.elemental[t] = Math.max(0, Number(valor(`elem-${t}`)?.value) || 0);
  }
  return cfg;
}

/**
 * Janela "Montar Golpe Pessoal".
 *
 * Devolve true quando o golpe foi salvo. Tudo o que o jogador escolhe aqui
 * vira um único efeito de uso (mais o de Carregado, quando escolhido).
 */
async function abrirConstrutorGolpe(item) {
  if (!item?.isOwner) return false;
  const cfg = golpeDoItem(item) ?? golpeVazio();

  const conteudo = `<div class="t20g-gp" data-actor-id="${item.actor?.id ?? ''}">
    <p class="notes">${game.i18n.localize('T20HaydGMTools.GPAjuda')}</p>

    <div class="form-group">
      <label>${game.i18n.localize('T20HaydGMTools.GPNome')}</label>
      <input type="text" name="gp-nome" value="${foundry.utils.escapeHTML(cfg.nome ?? '')}"
        placeholder="${game.i18n.localize('T20HaydGMTools.GPNomeDica')}">
    </div>

    ${grupoConstrutor(
      game.i18n.localize('T20HaydGMTools.GPGrupoBasico'),
      GP_EFEITOS.filter((e) => e.grupo === 'basico' && !e.reducao), cfg
    )}
    ${grupoConstrutor(
      game.i18n.localize('T20HaydGMTools.GPGrupoNovo'),
      GP_EFEITOS.filter((e) => e.grupo === 'novo' && !e.reducao), cfg
    )}
    ${grupoConstrutor(
      game.i18n.localize('T20HaydGMTools.GPGrupoReducoes'),
      GP_EFEITOS.filter((e) => e.reducao), cfg
    )}

    <div class="t20g-gp-total">
      <span class="t20g-gp-total-rotulo">${game.i18n.localize('T20HaydGMTools.GPCusto')}</span>
      <span class="t20g-gp-total-valor">1 PM</span>
      <span class="t20g-gp-total-detalhe"></span>
    </div>
  </div>`;

  const salvo = await DialogV2.wait({
    window: {
      title: game.i18n.localize('T20HaydGMTools.GPTitulo'),
      icon: 'fa-solid fa-burst'
    },
    position: { width: 620, height: 720 },
    classes: ['t20g-gp-janela'],
    content: conteudo,
    buttons: [
      {
        action: 'salvar',
        label: game.i18n.localize('T20HaydGMTools.GPSalvar'),
        icon: 'fa-solid fa-check',
        default: true,
        callback: (ev, botao) => lerConstrutor(botao.form)
      },
      {
        action: 'limpar',
        label: game.i18n.localize('T20HaydGMTools.GPLimpar'),
        icon: 'fa-solid fa-trash',
        callback: () => 'limpar'
      },
      { action: 'cancelar', label: game.i18n.localize('T20HaydGMTools.AutoCancelar'), icon: 'fa-solid fa-xmark' }
    ],
    render: (ev, dialogo) => ligarConstrutor(dialogo.element),
    rejectClose: false
  });

  // Botão sem callback devolve o próprio nome da ação
  if (!salvo || salvo === 'cancelar') return false;

  if (salvo === 'limpar') {
    await item.unsetFlag(MODULE_ID, FLAG_GOLPE);
    await item.unsetFlag(MODULE_ID, FLAG_CONTADOR);
    await sincronizarGolpe(item);
    ui.notifications.info(game.i18n.localize('T20HaydGMTools.GPLimpo'));
    return true;
  }

  if (salvo.sel.conjurador && !salvo.magia.uuid) {
    ui.notifications.warn(game.i18n.localize('T20HaydGMTools.GPSemMagia'));
  }
  if (salvo.sel.distante && !salvo.distante.alcance) {
    ui.notifications.warn(game.i18n.localize('T20HaydGMTools.GPSemAlcance'));
  }

  // setFlag mescla objetos aninhados. Ao desmarcar uma opção, uma propriedade
  // antiga poderia sobreviver dentro de `sel`, `elemental` ou `distante`.
  // Remover antes de gravar garante que a flag represente exatamente a janela.
  if (item.getFlag(MODULE_ID, FLAG_GOLPE)) {
    await item.unsetFlag(MODULE_ID, FLAG_GOLPE);
  }
  await item.setFlag(MODULE_ID, FLAG_GOLPE, salvo);
  await sincronizarGolpe(item);
  ui.notifications.info(
    game.i18n.format('T20HaydGMTools.GPSalvo', {
      nome: nomeDoGolpe(item, salvo),
      custo: custoDoGolpe(salvo).total
    })
  );
  return true;
}

/** Liga o custo ao vivo, o arrasta-e-solta da magia e os campos dependentes. */
function ligarConstrutor(el) {
  const totalValor = el.querySelector('.t20g-gp-total-valor');
  const totalDetalhe = el.querySelector('.t20g-gp-total-detalhe');

  const atualizar = () => {
    const cfg = lerConstrutor(el);
    const { total, reducao, bruto } = custoDoGolpe(cfg);
    totalValor.textContent = `${total} PM`;

    const partes = [];
    if (reducao) {
      partes.push(game.i18n.format('T20HaydGMTools.GPDetalheReducao', { bruto, reducao }));
    }
    if (cfg.sel.conjurador) partes.push(game.i18n.localize('T20HaydGMTools.GPDetalheMagia'));
    totalDetalhe.textContent = partes.join(' ');

    // O alcance final só faz sentido com o Distante marcado
    const alcance = el.querySelector('[name="gp-alcance"]');
    if (alcance) alcance.disabled = !cfg.sel.distante;
  };

  el.addEventListener('change', atualizar);
  el.addEventListener('input', atualizar);

  // Arrasta-e-solta da magia do Conjurador
  const quadro = el.querySelector('.t20g-gp-magia');
  if (quadro) {
    const uuid = quadro.querySelector('[name="gp-magia-uuid"]');
    const nome = quadro.querySelector('[name="gp-magia-nome"]');
    const rotulo = quadro.querySelector('.t20g-gp-magia-nome');

    const mostrar = () => {
      quadro.dataset.vazio = uuid.value ? '0' : '1';
      rotulo.textContent = uuid.value
        ? nome.value
        : game.i18n.localize('T20HaydGMTools.GPArrasteMagia');
      atualizar();
    };

    quadro.addEventListener('dragover', (evento) => {
      evento.preventDefault();
      quadro.classList.add('t20g-gp-magia-sobre');
    });
    quadro.addEventListener('dragleave', () => quadro.classList.remove('t20g-gp-magia-sobre'));
    quadro.addEventListener('drop', async (evento) => {
      evento.preventDefault();
      quadro.classList.remove('t20g-gp-magia-sobre');
      const dados = foundry.applications.ux.TextEditor.implementation.getDragEventData(evento);
      if (dados?.type !== 'Item') return;
      const magia = await Item.implementation.fromDropData(dados).catch(() => null);
      if (magia?.type !== 'magia') {
        return ui.notifications.warn(game.i18n.localize('T20HaydGMTools.GPSoMagia'));
      }
      // O poder limita a 1º e 2º círculos, e o sistema só conjura o que está
      // na ficha — nos dois casos avisamos, mas deixamos o Mestre decidir.
      const circulo = Number(magia.system?.circulo);
      if (circulo > 2) {
        ui.notifications.warn(
          game.i18n.format('T20HaydGMTools.GPCirculoAlto', { magia: magia.name, circulo })
        );
      }
      if (magia.actor?.id !== quadro.closest('.t20g-gp')?.dataset.actorId) {
        ui.notifications.info(
          game.i18n.format('T20HaydGMTools.GPMagiaForaDaFicha', { magia: magia.name })
        );
      }
      uuid.value = magia.uuid;
      nome.value = magia.name;
      // Escolher a magia já liga o Conjurador — ninguém arrasta por engano
      const marca = el.querySelector('[name="ef-conjurador"]');
      if (marca) marca.checked = true;
      mostrar();
    });

    quadro.querySelector('.t20g-gp-magia-limpar')?.addEventListener('click', (evento) => {
      evento.preventDefault();
      uuid.value = '';
      nome.value = '';
      mostrar();
    });

    mostrar();
  }

  atualizar();
}

/* --- Sacrifício ----------------------------------------------------------- */

/** Desconta os 10 PV do efeito Sacrifício e anuncia no chat. */
async function pagarSacrificio(item) {
  const ator = item.actor;
  if (!ator) return;

  const pv = ator.system?.attributes?.pv ?? {};
  const atual = Number(pv.value) || 0;
  const novo = atual - 10;
  await ator.update({ 'system.attributes.pv.value': novo });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: ator }),
    content: `<div class="t20g-auto-chat">
      <i class="fa-solid fa-droplet"></i>
      ${game.i18n.format('T20HaydGMTools.GPSacrificioFeito', {
        ator: ator.name, golpe: item.name, pv: novo
      })}
    </div>`
  });
}

/* --- Barra do golpe no chat ---------------------------------------------- */

/** O golpe usa o contador do Sequencial? */
function temSequencial(item) {
  return !!golpeDoItem(item)?.sel?.sequencial;
}

/** O golpe cobra PV do próprio personagem? */
function temSacrificio(item) {
  return !!golpeDoItem(item)?.sel?.sacrificio;
}

/**
 * O Golpe Pessoal deste poder foi usado na rolagem deste cartão?
 *
 * O sistema lista os efeitos de uso aplicados em `.card-upgrades`, nomeando
 * cada um pelo item de origem — ou pelo nome do próprio efeito, quando não
 * consegue resolver a origem. Conferimos os dois, senão os controles do golpe
 * apareceriam em todo ataque do personagem, tenha ele desferido o golpe ou não.
 */
function golpeUsadoNoCard(card, item) {
  const texto = card.querySelector('.card-upgrades')?.textContent ?? '';
  if (!texto.trim()) return false;
  const nomes = [item.name, ...efeitosDoItem(item.actor, item.id).map((ef) => ef.name)];
  return nomes.some((nome) => nome && texto.includes(nome));
}

/**
 * Barra do Golpe Pessoal no cartão de chat.
 *
 * No cartão do próprio poder vem o botão de montar; nos cartões de ataque vem
 * só o contador do Sequencial, que é o que muda no meio da luta.
 */
function montarBarraGolpe(item, { completo }) {
  const def = definicaoDe(item);
  const cfg = golpeDoItem(item);

  const barra = document.createElement('footer');
  barra.className = 't20g-auto-barra t20g-gp-barra';
  barra.dataset.itemId = item.id;
  barra.dataset.completo = completo ? '1' : '0';

  if (completo && podeControlar(item.actor)) {
    const linha = document.createElement('div');
    linha.className = 't20g-auto-linha';
    const botao = criarBotao(
      item, 'montar-golpe', def.icone,
      game.i18n.localize('T20HaydGMTools.GPMontarDica'), { largo: true }
    );
    botao.append(` ${game.i18n.localize('T20HaydGMTools.GPMontar')}`);
    linha.appendChild(botao);
    barra.appendChild(linha);

    if (cfg) {
      const resumo = document.createElement('div');
      resumo.className = 't20g-gp-cartao';
      resumo.innerHTML = `<b>${nomeDoGolpe(item, cfg)}</b> — ${custoDoGolpe(cfg).total} PM`
        + `<br><span class="notes">${efeitosEscolhidos(cfg).map((e) => e.nome).join(', ')
          || game.i18n.localize('T20HaydGMTools.GPNadaEscolhido')}</span>`;
      barra.appendChild(resumo);
    }
  }

  if (cfg?.sel?.sequencial) {
    const linha = document.createElement('div');
    linha.className = 't20g-auto-linha';

    const rotulo = document.createElement('div');
    rotulo.className = 't20g-auto-rotulo';
    const icone = document.createElement('i');
    icone.className = 'fa-solid fa-arrow-trend-up';
    rotulo.append(icone, ' Sequencial: ');
    const dado = document.createElement('b');
    dado.textContent = `+${passoSequencial(item)}`;
    rotulo.appendChild(dado);
    linha.appendChild(rotulo);

    if (podeControlar(item.actor)) {
      linha.appendChild(criarBotao(item, 'gp-menos', 'fa-minus',
        game.i18n.localize('T20HaydGMTools.GPSeqDiminuir')));
      linha.appendChild(criarBotao(item, 'gp-mais', 'fa-plus',
        game.i18n.localize('T20HaydGMTools.GPSeqAumentar')));
      if (completo) {
        linha.appendChild(criarBotao(item, 'gp-zerar', 'fa-rotate-left',
          game.i18n.localize('T20HaydGMTools.AutoZerar')));
      }
    }
    barra.appendChild(linha);
  }

  if (cfg?.sel?.sacrificio && podeControlar(item.actor)) {
    const linha = document.createElement('div');
    linha.className = 't20g-auto-linha';
    const botao = criarBotao(item, 'gp-sacrificio', 'fa-solid fa-droplet',
      game.i18n.localize('T20HaydGMTools.GPSacrificioDica'), { largo: true });
    botao.append(` ${game.i18n.localize('T20HaydGMTools.GPSacrificio')}`);
    linha.appendChild(botao);
    barra.appendChild(linha);
  }

  return barra;
}

/** Refaz as barras do golpe já renderizadas no chat. */
function atualizarBarrasGolpe(item) {
  const seletor = `.t20g-gp-barra[data-item-id="${CSS.escape(item.id)}"]`;
  for (const barra of document.querySelectorAll(seletor)) {
    barra.replaceWith(montarBarraGolpe(item, { completo: barra.dataset.completo === '1' }));
  }
}

/* ─── Botões no cartão de chat ───────────────────────────────────────────── */

/** Resolve o ator de um cartão de chat (suporta tokens sintéticos). */
function atorDoCard(card, message) {
  const { actorId } = card.dataset;
  let ator = actorId ? game.actors.get(actorId) : null;
  if (!ator) {
    const { token: tokenId, scene: sceneId } = message.speaker ?? {};
    if (tokenId && sceneId) ator = game.scenes.get(sceneId)?.tokens.get(tokenId)?.actor;
  }
  return ator ?? null;
}

/** Cria um botão de ação da barra. */
function criarBotao(item, acao, icone, dica, { largo = false } = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = largo ? 't20g-auto-btn t20g-auto-btn-largo' : 't20g-auto-btn';
  b.dataset.acao = acao;
  b.dataset.itemId = item.id;
  b.dataset.tooltip = dica;
  const i = document.createElement('i');
  // Aceita tanto "fa-minus" quanto uma classe completa ("fa-solid fa-heart-pulse")
  i.className = /\bfa-(solid|regular|light|thin|duotone|brands)\b/.test(icone)
    ? icone
    : `fa-solid ${icone}`;
  b.appendChild(i);
  return b;
}

/**
 * Monta a barra de controles de um item no cartão.
 *
 * Nota: NÃO usa a classe `card-item-effects` do sistema — ela tem uma regra
 * que joga qualquer <span> filho para `position:absolute` num quadrado de
 * 28px, o que empurrava o rótulo por cima dos botões.
 */
function montarBarra(item, { completo }) {
  const def = definicaoDe(item);

  const barra = document.createElement('footer');
  // O id vai na BARRA, não só nos botões: sem isso o valor exibido para quem
  // não pode mexer (que não recebe botão nenhum) ficaria congelado.
  barra.className = 't20g-auto-barra t20g-contador-barra';
  barra.dataset.itemId = item.id;

  const linha = document.createElement('div');
  linha.className = 't20g-auto-linha';

  const rotulo = document.createElement('div');
  rotulo.className = 't20g-auto-rotulo';
  const icone = document.createElement('i');
  icone.className = def.icone ?? 'fa-solid fa-wand-magic-sparkles';
  rotulo.append(icone, ` ${item.name}`);

  if (def.contador) {
    rotulo.append(': ');
    const numero = document.createElement('b');
    numero.textContent = `+${valorContador(item)}`;
    rotulo.appendChild(numero);
  }
  linha.appendChild(rotulo);

  // Sem permissão, a barra fica só com o valor — todos veem, ninguém de fora
  // mexe.
  if (!podeControlar(item.actor)) {
    barra.appendChild(linha);
    return barra;
  }

  if (def.contador) {
    linha.appendChild(
      criarBotao(item, 'menos', 'fa-minus', game.i18n.format('T20HaydGMTools.AutoDiminuir', { nome: item.name }))
    );
    linha.appendChild(
      criarBotao(item, 'mais', 'fa-plus', game.i18n.format('T20HaydGMTools.AutoAumentar', { nome: item.name }))
    );
    if (completo) {
      linha.appendChild(
        criarBotao(item, 'zerar', 'fa-rotate-left', game.i18n.localize('T20HaydGMTools.AutoZerar'))
      );
    }
  } else if (def.acao) {
    const botao = criarBotao(item, 'executar', def.acao.icone ?? 'fa-solid fa-bolt', def.acao.rotulo, { largo: true });
    botao.append(` ${def.acao.rotulo}`);
    linha.appendChild(botao);
  } else if (def.distribuicao) {
    const botao = criarBotao(item, 'distribuir', def.icone, def.distribuicao.rotulo, { largo: true });
    botao.append(` ${def.distribuicao.rotulo}`);
    linha.appendChild(botao);
  }

  barra.appendChild(linha);
  return barra;
}

/**
 * Injeta os controles no cartão do chat: em cartões com rolagem de ataque e
 * no cartão do próprio poder (que também ganha o botão de zerar).
 */
export function injetarControlesAutomacao(message, html) {
  const container = html?.querySelector ? html : (html?.[0] ?? null);
  const card = container?.querySelector?.('.chat-card.item-card');
  if (!card || card.querySelector('.t20g-auto-barra')) return;

  const ator = atorDoCard(card, message);
  if (!ator) return;

  // A barra é montada para todo mundo: a contagem é informação de mesa. Só os
  // botões dependem de permissão (ver podeControlar).
  //
  // A exceção são criaturas do Mestre: o contador é um efeito ativo delas, e
  // exibi-lo entregaria o que o nível de metagame esconde.
  if (ocultarContagemDe(ator)) return;

  // Itens do ator com automação que tem controles próprios no chat
  const comControles = ator.items.filter((i) => {
    const def = definicaoDe(i);
    return def?.contador || def?.acao || def?.distribuicao || def?.golpe;
  });
  const combinacoes = poderesDeCombinacao(ator);
  const estudos = poderesDeEstudo(ator);
  if (!comControles.length && !combinacoes.length && !estudos.length) return;

  const itemDoCard = ator.items.get(card.dataset.itemId);
  const ehAtaque = itemDoCard?.system?.rolls?.some((r) => r.type === 'ataque') ?? false;

  for (const item of comControles) {
    const ehOProprioItem = item.id === itemDoCard?.id;
    const def = definicaoDe(item);

    // Golpe Pessoal: montar fica no cartão do poder. Nos cartões de ataque
    // entram só os controles que mudam no meio da luta, e apenas quando o
    // golpe foi mesmo desferido naquela rolagem.
    if (def.golpe) {
      const temControles = temSequencial(item) || temSacrificio(item);
      const usado = temControles && golpeUsadoNoCard(card, item);
      if (ehOProprioItem || usado) {
        card.appendChild(montarBarraGolpe(item, { completo: ehOProprioItem }));
      }
      continue;
    }

    // Distribuição só faz sentido no cartão da própria magia (precisa da rolagem)
    if (def.distribuicao && !ehOProprioItem) continue;
    if (!ehAtaque && !ehOProprioItem) continue;
    card.appendChild(montarBarra(item, { completo: ehOProprioItem }));
  }

  // Combinações: UMA barra por personagem (a contagem é compartilhada entre
  // todos os poderes de Combinação), mostrada em ataques e no cartão de
  // qualquer uma das combinações.
  if (combinacoes.length) {
    const noCartaoDeCombinacao = combinacoes.some((i) => i.id === itemDoCard?.id);
    if (ehAtaque || noCartaoDeCombinacao) {
      const barraComb = montarBarraCombinacoes(ator, { completo: noCartaoDeCombinacao });
      if (barraComb) card.appendChild(barraComb);
      // Botões para aplicar os efeitos das combinações realmente usadas.
      // São ação, não informação: só para quem pode mexer na ficha.
      if (podeControlar(ator)) {
        for (const item of combinacoesUsadasNoCard(card, ator, itemDoCard)) {
          if (definicaoDe(item).combinacao?.efeitoAlvo) {
            card.appendChild(montarBarraEfeitoAlvo(item));
          }
        }
      }
    }
  }

  // Estudar o Adversário: UMA barra por personagem, nos cartões de ataque
  // (onde o erro acontece) e no cartão do próprio poder.
  for (const item of estudos) {
    const ehOProprioItem = item.id === itemDoCard?.id;
    if (!ehAtaque && !ehOProprioItem) continue;
    const barraEstudo = montarBarraEstudo(item, { completo: ehOProprioItem });
    if (barraEstudo) card.appendChild(barraEstudo);
  }

  card.addEventListener('click', async (ev) => {
    const botao = ev.target.closest?.('.t20g-auto-btn');
    if (!botao) return;
    ev.preventDefault();
    ev.stopPropagation();

    // Quem só assiste não monta botão nenhum; esta guarda cobre o caso de um
    // botão antigo sobreviver a um re-render depois de perder a permissão.
    if (!podeControlar(ator)) return;

    // Botão de aplicar o efeito de uma combinação (condições / penalidades)
    if (botao.dataset.acaoEfeito) {
      const poder = ator.items.get(botao.dataset.acaoEfeito);
      if (!poder) return;
      botao.disabled = true;
      try { await aplicarEfeitoCombinacao(poder); }
      catch (err) { console.error(`${MODULE_ID} | Falha ao aplicar efeito da combinação`, err); }
      finally { botao.disabled = false; }
      return;
    }

    // Botões da barra de Combinações (cada linha age no seu oponente)
    if (botao.dataset.acaoComb) {
      // Reaplicar não depende de alvo mirado: refaz o que já está nas criaturas
      if (botao.dataset.acaoComb === 'reaplicar') {
        botao.disabled = true;
        try {
          const total = await reaplicarEfeitosCombinacao(ator);
          ui.notifications.info(total
            ? game.i18n.format('T20HaydGMTools.CombReaplicado', { total })
            : game.i18n.localize('T20HaydGMTools.CombNadaParaReaplicar'));
        } catch (err) {
          console.error(`${MODULE_ID} | Falha ao reaplicar efeitos`, err);
        } finally {
          botao.disabled = false;
        }
        return;
      }

      const tokenId = botao.dataset.tokenId;
      if (!tokenId) return ui.notifications.warn(game.i18n.localize('T20HaydGMTools.CombPrecisaAlvo'));
      botao.disabled = true;
      try {
        const acao = botao.dataset.acaoComb;
        if (acao === 'mais') await somarCombinacao(ator, tokenId);
        else if (acao === 'menos') await subtrairCombinacao(ator, tokenId);
        else if (acao === 'zerar') await zerarCombinacao(ator, tokenId);
        atualizarBarrasCombinacao(ator);
      } catch (err) {
        console.error(`${MODULE_ID} | Falha na contagem de combinações`, err);
      } finally {
        botao.disabled = false;
      }
      return;
    }

    // Botões da barra de Estudar o Adversário (cada linha age no seu oponente)
    if (botao.dataset.acaoEstudo) {
      const tokenId = botao.dataset.tokenId;
      if (!tokenId) return ui.notifications.warn(game.i18n.localize('T20HaydGMTools.EstudoPrecisaAlvo'));
      botao.disabled = true;
      try {
        const acao = botao.dataset.acaoEstudo;
        if (acao === 'mais') await somarEstudo(ator, tokenId);
        else if (acao === 'menos') await subtrairEstudo(ator, tokenId);
        else if (acao === 'zerar') await zerarEstudo(ator, tokenId);
        atualizarBarrasEstudo(ator);
      } catch (err) {
        console.error(`${MODULE_ID} | Falha na contagem de estudo`, err);
      } finally {
        botao.disabled = false;
      }
      return;
    }

    const item = ator.items.get(botao.dataset.itemId);
    if (!item) return;

    botao.disabled = true;
    try {
      if (botao.dataset.acao === 'executar') {
        await executarAcao(item);
        return;
      }
      if (botao.dataset.acao === 'distribuir') {
        await abrirDistribuicao(item, message);
        return;
      }
      if (botao.dataset.acao === 'montar-golpe') {
        if (await abrirConstrutorGolpe(item)) atualizarBarrasGolpe(item);
        return;
      }
      if (botao.dataset.acao === 'gp-sacrificio') {
        await pagarSacrificio(item);
        return;
      }
      const deltaGolpe = { 'gp-mais': 1, 'gp-menos': -1, 'gp-zerar': null }[botao.dataset.acao];
      if (deltaGolpe !== undefined) {
        await ajustarSequencial(item, deltaGolpe);
        atualizarBarrasGolpe(item);
        return;
      }
      const delta = { mais: 1, menos: -1, zerar: null }[botao.dataset.acao];
      if (delta === undefined) return;
      await ajustarContador(item, delta);
      atualizarRotulos(item);
    } catch (err) {
      console.error(`${MODULE_ID} | Falha ao executar automação`, err);
    } finally {
      botao.disabled = false;
    }
  });
}

/**
 * Atualiza o valor exibido nas barras já renderizadas no chat.
 * Mais barato (e sem piscar) do que re-renderizar o log inteiro.
 */
function atualizarRotulos(item) {
  const def = definicaoDe(item);
  // A barra do Golpe Pessoal mostra o dado do Sequencial, não um "+N"
  if (def?.golpe) return atualizarBarrasGolpe(item);
  // Só contadores têm "+N" para repintar. Sem esta guarda, um item de outra
  // automação (Estudo, por exemplo) sobrescreveria o próprio valor com "+0".
  if (!def?.contador) return;

  const valor = valorContador(item);
  const seletor = `.t20g-contador-barra[data-item-id="${CSS.escape(item.id)}"]`;
  for (const barra of document.querySelectorAll(seletor)) {
    const alvo = barra.querySelector('.t20g-auto-rotulo b');
    if (alvo) alvo.textContent = `+${valor}`;
  }
}

/* ─── Fim de turno: contadores que valem só no próprio turno ─────────────── */

/** Contadores do ator que expiram no fim do turno dele (ex.: Sequência de Golpes). */
function contadoresDeTurno(ator) {
  return (ator?.items ?? []).filter((item) => {
    const def = definicaoDe(item);
    return def?.contador?.duracao === 'turno' && valorContador(item) > 0;
  });
}

/**
 * Turno virou → zera os contadores de quem acabou de jogar.
 *
 * `combate.previous` guarda o combatente que estava ativo antes da mudança,
 * que é justamente aquele cujo turno terminou.
 */
async function encerrarContadoresDeTurno(combate) {
  const anterior = combate?.previous?.combatantId;
  if (!anterior) return;

  const ator = combate.combatants?.get?.(anterior)?.actor;
  if (!ator || !souResponsavelPeloAtor(ator)) return;

  for (const item of contadoresDeTurno(ator)) {
    const valor = valorContador(item);
    await item.setFlag(MODULE_ID, FLAG_CONTADOR, 0);
    await sincronizarEfeito(item);
    atualizarRotulos(item);
    ui.notifications.info(
      game.i18n.format('T20HaydGMTools.AutoFimTurno', {
        nome: item.name, ator: ator.name, valor
      })
    );
  }
}

/* ─── Fim de cena: lembrete para zerar contadores ────────────────────────── */

/** Todos os itens do mundo com contador aceso (valor > 0). */
function contadoresAcesos() {
  const acesos = [];
  for (const ator of game.actors) {
    for (const item of ator.items) {
      const def = definicaoDe(item);
      if (!def || valorContador(item) <= 0) continue;
      // O Sequencial do Golpe Pessoal também dura até o fim da cena
      if (def.contador || (def.golpe && temSequencial(item))) acesos.push({ ator, item });
    }
  }
  return acesos;
}

/** Contagens de Combinação ainda vivas, por ator e oponente. */
function combinacoesAcesas({ combateId = idCombateAtual(), rodada = rodadaAtual() } = {}) {
  const acesas = [];
  for (const ator of indiceCombinacoes.listar()) {
    const tudo = ator.getFlag(MODULE_ID, FLAG_COMBINACOES) ?? {};
    for (const [tokenId, historico] of Object.entries(tudo)) {
      if (!Array.isArray(historico) || !historico.length) continue;
      const oponente = nomeDoToken(tokenId);
      if (!oponente) continue;
      const valor = contagemNaRodada(historico, rodada, combateId);
      if (valor > 0) acesas.push({ ator, tokenId, valor, oponente });
    }
  }
  return acesas;
}

/** Todos os históricos persistidos, inclusive de encontros já encerrados. */
function combinacoesRegistradas() {
  const registros = [];
  for (const ator of indiceCombinacoes.listar()) {
    const tudo = ator.getFlag(MODULE_ID, FLAG_COMBINACOES) ?? {};
    for (const tokenId of Object.keys(tudo)) registros.push({ ator, tokenId });
  }
  return registros;
}

/**
 * Sugere zerar os contadores que duram "até o fim da cena".
 * Enviado como sussurro ao Mestre quando um encontro é encerrado ou a cena
 * ativa muda — os dois momentos em que a cena efetivamente acabou.
 */
async function sugerirZerarContadores(motivo, contexto = {}) {
  if (!game.user.isGM || game.user !== game.users.activeGM) return;

  const acesos = contadoresAcesos();
  const combinacoes = combinacoesAcesas(contexto);
  const estudos = estudosAcesos();
  if (!acesos.length && !combinacoes.length && !estudos.length) return;

  const lista = [
    ...acesos.map(({ ator, item }) => {
      const valor = definicaoDe(item)?.golpe
        ? `Sequencial +${passoSequencial(item)}`
        : `+${valorContador(item)}`;
      return `<li><b>${ator.name}</b> — ${item.name}: <b>${valor}</b></li>`;
    }),
    ...combinacoes.map(({ ator, oponente, valor }) =>
      `<li>${game.i18n.format('T20HaydGMTools.FimCenaCombItem', {
        ator: ator.name,
        oponente: oponente ?? game.i18n.localize('T20HaydGMTools.CombOponenteDesconhecido'),
        valor
      })}</li>`),
    ...estudos.map(({ ator, oponente, valor }) =>
      `<li>${game.i18n.format('T20HaydGMTools.FimCenaEstudoItem', {
        ator: ator.name,
        oponente: oponente ?? game.i18n.localize('T20HaydGMTools.CombOponenteDesconhecido'),
        valor: bonusDoEstudo(valor)
      })}</li>`)
  ].join('');

  await ChatMessage.create({
    whisper: game.users.filter((u) => u.isGM).map((u) => u.id),
    speaker: { alias: 'T20 Hayd GMTools' },
    content: `<div class="t20g-auto-fimcena">
      <p><b><i class="fa-solid fa-hourglass-end"></i>
        ${game.i18n.localize('T20HaydGMTools.FimCenaTitulo')}</b></p>
      <p>${game.i18n.format('T20HaydGMTools.FimCenaTexto', { motivo })}</p>
      <ul>${lista}</ul>
      <button type="button" class="t20g-auto-zerar-tudo">
        <i class="fa-solid fa-rotate-left"></i>
        ${game.i18n.localize('T20HaydGMTools.FimCenaBotao')}
      </button>
    </div>`
  });
}

/** Zera todos os contadores acesos (ação do botão do lembrete). */
async function zerarTodosContadores() {
  const acesos = contadoresAcesos();
  // Limpa também históricos antigos/invisíveis. Eles não influenciam mais
  // a contagem, mas não devem permanecer crescendo nas flags do ator.
  const combinacoes = combinacoesRegistradas();
  const estudos = estudosRegistrados();
  if (!acesos.length && !combinacoes.length && !estudos.length) {
    return ui.notifications.info(game.i18n.localize('T20HaydGMTools.FimCenaNada'));
  }

  for (const { item } of acesos) {
    await item.setFlag(MODULE_ID, FLAG_CONTADOR, 0);
    await sincronizarEfeito(item);
    atualizarRotulos(item);
  }

  // Combinações: limpa o histórico de cada oponente e põe os efeitos em dia
  const atoresTocados = new Set();
  for (const { ator, tokenId } of combinacoes) {
    await zerarCombinacao(ator, tokenId);
    atoresTocados.add(ator);
  }
  for (const ator of atoresTocados) atualizarBarrasCombinacao(ator);

  // Estudar o Adversário: o fim da cena é o único momento em que ele zera
  const atoresEstudo = new Set();
  for (const { ator, tokenId } of estudos) {
    await zerarEstudo(ator, tokenId);
    atoresEstudo.add(ator);
  }
  for (const ator of atoresEstudo) atualizarBarrasEstudo(ator);

  ui.notifications.info(
    game.i18n.format('T20HaydGMTools.FimCenaZerado', {
      total: acesos.length + combinacoes.length + estudos.length
    })
  );
}

/* ─── Diário de instruções ───────────────────────────────────────────────── */

const FLAG_DIARIO = 'diarioAutomacoes';

/** Página de abertura, com as instruções gerais. */
function paginaIntroducao() {
  return `
    <p>Este diário lista as automações do módulo <i>T20 Hayd GMTools</i>: poderes e magias
    com regras específicas que o sistema não resolve sozinho.</p>

    <h2>Como ligar</h2>
    <ol>
      <li>Abra a ficha do item.</li>
      <li>Clique em <b>Automação</b>, no topo da janela.</li>
      <li>Escolha a automação e salve.</li>
    </ol>
    <p>O seletor só mostra as automações que servem para aquele tipo de item. Escolher
    <b>Nenhuma</b> desliga e limpa o que ela tiver criado.</p>

    <p class="notes">Diário gerado pelo módulo — anotações feitas aqui podem ser
    substituídas.</p>`;
}

/** Página única com as regras de Combinação, para não repetir em cada poder. */
function paginaCombinacoes() {
  return `
    <p>Poderes de Combinação são golpes que se aproveitam dos ataques anteriores contra o
    mesmo oponente. Todos funcionam da mesma forma no módulo.</p>

    <h3>A contagem</h3>
    <ul>
      <li>A contagem é <b>uma por inimigo</b> e vale para todas as suas Combinações.</li>
      <li><b>Mire o token</b> do oponente: os botões aparecem nos cartões de ataque do chat.
          Com mais de um alvo mirado, cada um tem sua linha.</li>
      <li><b>+</b> marca que você acertou uma Combinação, <b>−</b> desfaz e <i class="fa-solid fa-rotate-left"></i> zera.
          Com o poder <i>Mestre das Combinações</i>, o <b>+</b> soma 2.</li>
      <li>Se passar uma rodada sem acertar nenhuma Combinação, a contagem some sozinha e
          os efeitos aplicados saem junto.</li>
    </ul>

    <h3>Usando um poder</h3>
    <ul>
      <li>Cada Combinação vira um efeito de uso com o custo em PM já preenchido. Ele aparece
          <b>desmarcado</b> na janela de rolagem — marque o da Combinação que você está usando.</li>
      <li>Depois do ataque, o cartão traz um botão para aplicar as condições daquele poder
          (enjoado, lento, vulnerável…) no alvo mirado.</li>
      <li>Se algum efeito ficar com valor desatualizado, use <b>Reaplicar nas criaturas
          afetadas</b>, no cartão de qualquer Combinação.</li>
    </ul>

    <p class="notes">Lembretes das regras: Combinações só valem com ataques desarmados, cada
    uma pode ser usada uma vez por rodada e só uma por ataque.</p>`;
}

/** Página de uma automação — curta e direta. */
function paginaDaAutomacao(def) {
  const tipos = def.tipos
    .map((t) => game.i18n.localize(CONFIG.Item?.typeLabels?.[t] ?? t))
    .join(', ');

  // Combinações: só o que o módulo faz. A regra do poder já está na ficha, e
  // a mecânica da contagem tem página própria.
  if (def.combinacao) {
    const c = def.combinacao;
    const faz = [...(c.automatiza ?? []), ...(c.manual ?? [])];
    return `
      ${faz.length ? `<ul>${faz.map((t) => `<li>${t}</li>`).join('')}</ul>` : ''}
      <p class="notes">Como a contagem funciona está em <b>Combinações Desarmadas</b>.</p>`;
  }

  // Golpe Pessoal: a lista de efeitos é grande demais para caber no padrão
  if (def.golpe) return paginaGolpePessoal(def, tipos);

  let comoFunciona = '';
  if (def.contador) {
    comoFunciona = `
      <ul>
        <li>Contador nos cartões de ataque: <b>+</b> aumenta, <b>−</b> diminui e, no cartão do
            próprio poder, <i class="fa-solid fa-rotate-left"></i> zera.</li>
        <li>Limite: ${def.contador.limiteTexto ?? 'sem limite'}.</li>
        <li>O bônus entra sozinho na janela de rolagem enquanto o contador estiver aceso.</li>
        <li>${def.contador.duracao === 'turno'
          ? 'Zera sozinho quando o turno do personagem acaba.'
          : 'No fim do encontro sai um aviso no chat com um botão para zerar.'}</li>
        ${def.contador.nota ? `<li>${def.contador.nota}</li>` : ''}
      </ul>`;
  } else if (def.acao) {
    const ganhos = [];
    if (def.acao.pv) ganhos.push(`<b>${def.acao.pv} PV</b>`);
    if (def.acao.pm) ganhos.push(`<b>${def.acao.pm} PM</b>`);
    comoFunciona = `
      <ul>
        <li>Botão <b>${def.acao.rotulo}</b> nos cartões de ataque e no cartão do poder.</li>
        ${ganhos.length ? `<li>Recupera ${ganhos.join(' e ')}, sem passar do máximo da ficha.</li>` : ''}
        <li>A recuperação é anunciada no chat.</li>
      </ul>`;
  } else if (def.distribuicao) {
    const d = def.distribuicao;
    comoFunciona = `
      <ul>
        <li>Botão <b>${d.rotulo}</b> no cartão da magia.</li>
        <li>Escolha em quantos alvos as ${d.nomeProjetilPlural} vão e para onde vai cada uma.
            Bônus de dano entram como linhas separadas — pela regra, cada um vale para uma
            ${d.nomeProjetil.toLowerCase()} só.</li>
        <li>O dano de cada alvo é rolado depois que você confirma, e sai um cartão por alvo.</li>
      </ul>`;
  } else if (def.estudo) {
    comoFunciona = `
      <ul>
        <li>A contagem é separada por inimigo: mire o token do oponente para ver e mexer na
            dele.</li>
        <li>Errou o ataque? Use o <b>+</b> nos cartões de ataque; o <b>−</b> desfaz.</li>
        <li>O bônus entra sozinho na janela de rolagem sempre que aquele oponente estiver
            mirado.</li>
        <li>Não expira com o tempo: no fim do encontro sai um aviso no chat com um botão
            para zerar.</li>
      </ul>`;
  } else if (def.marcador === 'incremento2') {
    comoFunciona = `
      <ul><li>Com este poder na ficha, o botão <b>+</b> da contagem passa a somar 2.</li></ul>`;
  }

  return `
    ${def.fonte ? `<p class="notes"><b>Fonte:</b> ${def.fonte}</p>` : ''}
    <p class="notes">Serve para: ${tipos}.</p>
    ${comoFunciona}`;
}

/** Página do Golpe Pessoal — traz a tabela inteira de efeitos. */
function paginaGolpePessoal(def, tipos) {
  const tabela = (efeitos) => `<table><thead><tr>
      <th>Efeito</th><th>Custo</th><th>No módulo</th>
    </tr></thead><tbody>
    ${efeitos.map((ef) => `<tr>
      <td><b>${ef.nome}</b></td>
      <td>${ef.reducao ? `−${ef.reducao} PM` : `+${ef.custo} PM`}</td>
      <td>${ef.changes
        ? 'Entra sozinho na rolagem.'
        : 'Só lembrete no efeito.'}${ef.nota ? ` ${ef.nota}` : ''}</td>
    </tr>`).join('')}
  </tbody></table>`;

  return `
    <p class="notes"><b>Fonte:</b> ${def.fonte}</p>
    <p class="notes">Serve para: ${tipos}.</p>

    <h3>Como montar</h3>
    <ol>
      <li>Ligue a automação <b>Golpe Pessoal</b> no poder.</li>
      <li>Role o poder para o chat e clique em <b>Montar Golpe Pessoal</b>.</li>
      <li>Dê um nome ao golpe e marque os efeitos.</li>
      <li>Salvar cria <b>um único efeito de uso</b>, "Golpe Pessoal: nome do golpe", com o custo
          em PM já somado. Ele aparece desmarcado na janela de rolagem de qualquer arma —
          marque-o quando for desferir o golpe.</li>
    </ol>
    <p>O módulo <b>não</b> amarra o golpe a uma arma: a regra diz que ele só vale com a arma que
    você escolheu (ou qualquer uma, com <i>Qualquer Arma</i>), mas quem cuida disso é a mesa —
    travar pelo nome do item na ficha só atrapalharia na hora de rolar.</p>
    <p>Subiu de nível? Abra o construtor de novo e refaça o golpe. Para ter dois golpes
    diferentes, coloque o poder duas vezes na ficha e monte um em cada.</p>

    <h3>Custo</h3>
    <ul>
      <li>O custo é a soma dos efeitos, com mínimo de 1 PM.</li>
      <li><b>Reduções não se acumulam</b>: com mais de uma, só a maior é aplicada.</li>
      <li>Você não pode gastar, em golpes pessoais numa mesma rodada, mais PM do que seu limite
          de PM — isso o módulo não controla.</li>
    </ul>

    <h3>Efeitos com tratamento próprio</h3>
    <ul>
      <li><b>Conjurador</b>: arraste a magia para o construtor. Ao confirmar o uso do ataque, a
          janela da magia abre <b>antes</b> da rolagem — ela cobra os PM dela ali, com os
          aprimoramentos que você escolher, e só então o golpe sai cobrando o +1 PM.</li>
      <li><b>Carregado</b>: vira um segundo efeito de uso, sem custo. Marque-o na janela de
          rolagem só se tiver gastado a ação padrão para energizar o golpe (+2d8).</li>
      <li><b>Sequencial</b>: contador nos cartões (<b>+</b>, <b>−</b>, <i class="fa-solid fa-rotate-left"></i>), subindo
          1d6 → 1d8 → 1d10 → 1d12 → 3d6 → 4d6 → 4d8 → 4d10 → 4d12. O dado atual aparece no nome
          do efeito e no cartão.</li>
      <li><b>Sacrifício</b>: botão no cartão para descontar os 10 PV.</li>
    </ul>

    <h3>Efeitos do Golpe Pessoal</h3>
    ${tabela(GP_EFEITOS.filter((e) => e.grupo === 'basico' && !e.reducao))}
    <h3>Novos Efeitos de Golpe Pessoal</h3>
    ${tabela(GP_EFEITOS.filter((e) => e.grupo === 'novo' && !e.reducao))}
    <h3>Reduções de custo</h3>
    ${tabela(GP_EFEITOS.filter((e) => e.reducao))}`;
}

/** Conteúdo completo do diário (uma página por automação). */
/**
 * Ordem das categorias no diário. A página compartilhada das Combinações
 * abre o grupo do Lutador, porque é onde a mecânica delas é explicada.
 */
const CATEGORIAS = [
  { id: 'barbaro', rotulo: 'T20HaydGMTools.DiarioCatBarbaro' },
  { id: 'guerreiro', rotulo: 'T20HaydGMTools.DiarioCatGuerreiro' },
  { id: 'lutador', rotulo: 'T20HaydGMTools.DiarioCatLutador', abre: paginaCombinacoes },
  { id: 'combate', rotulo: 'T20HaydGMTools.DiarioCatCombate' },
  { id: 'magia', rotulo: 'T20HaydGMTools.DiarioCatMagia' }
];

/**
 * Conteúdo de uma categoria: todos os poderes dela numa página só, cada um
 * como uma seção. A barra lateral do Foundry lista páginas, não pastas —
 * uma página por poder deixava a navegação enorme.
 */
function paginaDaCategoria(categoria) {
  const poderes = Object.values(AUTOMACOES)
    .filter((def) => def.categoria === categoria.id)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  // O Lutador abre com a mecânica compartilhada das Combinações
  const abertura = categoria.abre
    ? `<h2>${game.i18n.localize('T20HaydGMTools.DiarioCombinacoes')}</h2>${categoria.abre()}`
    : '';

  const secoes = poderes
    .map((def) => `<h2>${def.nome}</h2>${paginaDaAutomacao(def)}`)
    .join('\n');

  return `${abertura}\n${secoes}`;
}

function paginasDoDiario() {
  const paginas = [{
    name: game.i18n.localize('T20HaydGMTools.DiarioIntro'),
    type: 'text',
    title: { show: true, level: 1 },
    text: { format: 1, content: paginaIntroducao() },
    flags: { [MODULE_ID]: { pagina: 'intro' } }
  }];

  for (const categoria of CATEGORIAS) {
    paginas.push({
      name: game.i18n.localize(categoria.rotulo),
      type: 'text',
      title: { show: true, level: 1 },
      text: { format: 1, content: paginaDaCategoria(categoria) },
      flags: { [MODULE_ID]: { pagina: `cat-${categoria.id}` } }
    });
  }

  // `sort` explícito para a ordem valer também ao ATUALIZAR um diário que já
  // existe no mundo, não só na criação.
  return paginas.map((pagina, i) => ({ ...pagina, sort: (i + 1) * 100 }));
}


/**
 * Cria (ou atualiza) o diário de instruções no mundo.
 * O conteúdo vem do catálogo, então novas automações aparecem sozinhas.
 */
async function garantirDiario({ avisar = false } = {}) {
  if (!game.user.isGM) return null;

  const nome = game.i18n.localize('T20HaydGMTools.DiarioNome');
  const id = game.settings.get(MODULE_ID, FLAG_DIARIO);
  let diario = id ? game.journal.get(id) : null;
  // Se o Mestre apagou o diário, recria; se renomeou, mantém o nome dele
  if (!diario) diario = game.journal.find((j) => j.getFlag(MODULE_ID, 'diario'));

  const paginas = paginasDoDiario();

  if (!diario) {
    diario = await JournalEntry.create({
      name: nome,
      pages: paginas,
      flags: { [MODULE_ID]: { diario: true } }
    });
    if (diario) await game.settings.set(MODULE_ID, FLAG_DIARIO, diario.id);
    if (avisar) ui.notifications.info(game.i18n.localize('T20HaydGMTools.DiarioCriado'));
    return diario;
  }

  // Atualiza as páginas do módulo, preservando páginas criadas pelo Mestre
  const paraCriar = [];
  const paraAtualizar = [];
  for (const pagina of paginas) {
    const chave = pagina.flags[MODULE_ID].pagina;
    const existente = diario.pages.find((p) => p.getFlag(MODULE_ID, 'pagina') === chave);
    if (existente) paraAtualizar.push({ _id: existente.id, ...pagina });
    else paraCriar.push(pagina);
  }
  // Páginas do módulo que não existem mais na estrutura atual (uma por poder,
  // do formato antigo) viram lixo na barra lateral. Só removemos as NOSSAS:
  // páginas criadas pelo Mestre não têm a flag e ficam intactas.
  const chavesAtuais = new Set(paginas.map((p) => p.flags[MODULE_ID].pagina));
  const paraApagar = diario.pages
    .filter((p) => {
      const chave = p.getFlag(MODULE_ID, 'pagina');
      return chave && !chavesAtuais.has(chave);
    })
    .map((p) => p.id);

  if (paraAtualizar.length) await diario.updateEmbeddedDocuments('JournalEntryPage', paraAtualizar);
  if (paraCriar.length) await diario.createEmbeddedDocuments('JournalEntryPage', paraCriar);
  if (paraApagar.length) await diario.deleteEmbeddedDocuments('JournalEntryPage', paraApagar);
  if (diario.id !== id) await game.settings.set(MODULE_ID, FLAG_DIARIO, diario.id);
  if (avisar) ui.notifications.info(game.i18n.localize('T20HaydGMTools.DiarioAtualizado'));
  return diario;
}

/** Abre o diário, criando-o se necessário. */
async function abrirDiario() {
  const diario = await garantirDiario();
  if (diario) diario.sheet.render(true);
  else ui.notifications.warn(game.i18n.localize('T20HaydGMTools.DiarioSoMestre'));
}

/* ─── Hooks ──────────────────────────────────────────────────────────────── */

/**
 * Botão "Automação" no cabeçalho da ficha de item.
 *
 * A ficha do sistema é ApplicationV1, e o v13 corta a cadeia de hooks de
 * cabeçalho em `baseApplication` — que para fichas de item é "ItemSheet".
 * Ou seja: `getApplicationHeaderButtons` NÃO dispara aqui; o hook correto é
 * `getItemSheetHeaderButtons`, que cobre ItemSheetT20 e RaceSheetT20.
 */
registrarHooksAutomacoes({
  abrirDialogoAutomacao,
  injetarControlesAutomacao,
  zerarTodosContadores,
  indiceCombinacoes,
  sincronizarCombinacoes,
  atualizarBarrasCombinacao,
  indiceEstudo,
  sincronizarEstudo,
  atualizarBarrasEstudo,
  atualizarRotulos,
  encerrarContadoresDeTurno,
  anunciarContagensEncerradas,
  expirarAplicacoesCombinacao,
  reaplicarEfeitosCombinacao,
  anunciarRetrocessoCombinacoes,
  apagarMensagensRetrocesso,
  registrarMensagemRetroativa,
  sugerirZerarContadores,
  definicaoDe,
  valorContador,
  golpeDoItem,
  sincronizarEfeito,
  efeitosDoItem
});

/** Registro do diário: id do documento criado no mundo + botão nas configurações. */
Hooks.once('init', () => {
  game.settings.register(MODULE_ID, 'automacoesEnabled', {
    name: 'T20HaydGMTools.SettingAutomacoesEnabledName',
    hint: 'T20HaydGMTools.SettingAutomacoesEnabledHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, FLAG_DIARIO, {
    scope: 'world',
    config: false,
    type: String,
    default: ''
  });

  // O menu não abre formulário nenhum: o Foundry faz `new type()` e chama
  // render(), então basta interceptar o render para abrir o diário.
  class MenuDiarioAutomacoes extends foundry.appv1.api.FormApplication {
    async render() {
      await abrirDiario();
      return this;
    }
    async _updateObject() {}
  }

  game.settings.registerMenu(MODULE_ID, 'abrirDiarioAutomacoes', {
    name: 'T20HaydGMTools.DiarioMenuNome',
    label: 'T20HaydGMTools.DiarioMenuBotao',
    hint: 'T20HaydGMTools.DiarioMenuDica',
    icon: 'fa-solid fa-book-open',
    restricted: true,
    type: MenuDiarioAutomacoes
  });
});

/** Cria/atualiza o diário de instruções no mundo (uma vez por sessão, pelo GM ativo). */
Hooks.once('ready', () => {
  // Conjurador: a magia do Golpe Pessoal precisa sair antes do ataque
  ligarConjurador();

  const mod = game.modules.get(MODULE_ID);
  if (mod) {
    mod.api = {
      ...(mod.api ?? {}),
      automacoes: {
        catalogo: AUTOMACOES,
        ajustar: ajustarContador,
        sincronizar: sincronizarEfeito,
        valor: valorContador,
        abrirDialogo: abrirDialogoAutomacao,
        diario: garantirDiario,
        abrirDiario,
        golpePessoal: {
          efeitos: GP_EFEITOS,
          abrirConstrutor: abrirConstrutorGolpe,
          ler: golpeDoItem,
          custo: custoDoGolpe,
          sincronizar: sincronizarGolpe
        }
      }
    };
  }

  if (automacoesAtivas() && game.user.isGM && game.user === game.users.activeGM) {
    garantirDiario().catch((err) =>
      console.error(`${MODULE_ID} | Falha ao preparar o diário de automações`, err)
    );
  }
});
