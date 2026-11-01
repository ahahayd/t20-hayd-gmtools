/**
 * Venenos de dano contínuo — integração com o Foundry.
 *
 * O item guarda a configuração, o cartão do chat guarda uma cópia dela e cada
 * aplicação vira uma entrada própria na ficha da criatura. Fica uma condição
 * "Envenenado" só, ligada enquanto houver entrada.
 */

import { MODULE_ID, podeControlar, souResponsavelPeloAtor } from '../runtime.mjs';
import { definicaoDe } from '../estado.mjs';
import { ehV14 } from '../../versao.mjs';
import { criarBotao } from '../ui.mjs';
import {
  CONDICAO,
  RESULTADOS,
  normalizarConfig,
  configValida,
  danoValido,
  normalizarDano,
  normalizarRodadas,
  resultadoVazio,
  formulaAcumulada,
  listarVenenos,
  avancarRodada,
  jaRolou,
  registrarTurno,
  desfazerTurnos,
  imuneAVeneno
} from './regras.mjs';

const { DialogV2 } = foundry.applications.api;

/** Flag no ITEM: { sucesso: { dano, rodadas }, falha: { dano, rodadas }, ignoraImunidade }. */
const FLAG_CONFIG = 'venenoConfig';
/** Flag na MENSAGEM: cópia da configuração, com nome e imagem do item. */
const FLAG_CARTAO = 'veneno';
/** Flag no ATOR: { [id]: { id, nome, img, resultado, dano, rodadas, ignora, criado } }. */
const FLAG_ATIVOS = 'venenos';
/** Flag no ATOR: rolagens de início de turno, para desfazer quando o Mestre volta. */
const FLAG_HISTORICO = 'venenoHistorico';
/** Alvos que `marcarAlvosDaRolagem` guarda na mensagem. */
const FLAG_ALVOS = 'alvosDaRolagem';
/** Pedido ao Mestre para gravar numa ficha que quem clicou não pode editar. */
const PEDIDO_APLICAR = `${MODULE_ID}.aplicarVeneno`;

/** Ícone de cada resultado, igual na janela do item e nos botões do cartão. */
const ICONES = { sucesso: 'fa-shield-halved', falha: 'fa-skull-crossbones' };

const t = (chave, dados) => (dados
  ? game.i18n.format(`T20HaydGMTools.${chave}`, dados)
  : game.i18n.localize(`T20HaydGMTools.${chave}`));

function textoRodadas(n) {
  return n === 1 ? t('VenenoUmaRodada') : t('VenenoRodadas', { n });
}

function configDe(item) {
  return normalizarConfig(item?.getFlag?.(MODULE_ID, FLAG_CONFIG));
}

function venenosDe(ator) {
  return listarVenenos(ator?.getFlag?.(MODULE_ID, FLAG_ATIVOS));
}

/**
 * Mudanças que encerram venenos: a entrada vira null em vez de sair da flag.
 * No v14, a primeira chave gravada no delta de um token não vinculado resiste
 * a qualquer exclusão (até a `unsetFlag`) e o veneno seguiria rolando.
 */
function encerrar(venenos) {
  return Object.fromEntries(venenos.map((v) =>
    [`flags.${MODULE_ID}.${FLAG_ATIVOS}.${v.id}`, null]));
}

/* ─── Janela de configuração no item ─────────────────────────────────────── */

function camposDoResultado(resultado, dados) {
  const esc = foundry.utils.escapeHTML;
  const titulo = t(resultado === 'sucesso' ? 'VenenoCfgSucesso' : 'VenenoCfgFalha');
  return `<fieldset class="t20g-veneno-resultado t20g-veneno-resultado--${resultado}">
      <legend><i class="fa-solid ${ICONES[resultado]}"></i> ${titulo}</legend>
      <label>
        <span>${t('VenenoCfgDano')}</span>
        <input type="text" name="${resultado}.dano" value="${esc(dados.dano)}"
          placeholder="1d12" autocomplete="off">
      </label>
      <label>
        <span>${t('VenenoCfgRodadas')}</span>
        <input type="number" name="${resultado}.rodadas" min="0" step="1"
          value="${dados.rodadas || ''}">
      </label>
    </fieldset>`;
}

/** Lê a janela: os nomes dos campos já têm o formato da configuração. */
function lerConfig(form) {
  const ler = (campo) => form.elements[campo]?.value;
  return normalizarConfig({
    sucesso: { dano: ler('sucesso.dano'), rodadas: ler('sucesso.rodadas') },
    falha: { dano: ler('falha.dano'), rodadas: ler('falha.rodadas') },
    ignoraImunidade: form.elements.ignoraImunidade?.checked
  });
}

/**
 * Pergunta dano e duração de cada resultado e grava no item.
 * Devolve false se a janela foi cancelada: nesse caso a automação nem liga.
 */
async function configurar(item) {
  const atual = configDe(item);
  const config = await DialogV2.wait({
    window: { title: t('VenenoCfgTitulo', { nome: item.name }), icon: 'fa-solid fa-skull-crossbones' },
    position: { width: 400 },
    content: `<div class="t20g-auto-dialogo t20g-veneno-dialogo">
        <p class="notes">${t('VenenoCfgAjuda')}</p>
        ${RESULTADOS.map((r) => camposDoResultado(r, atual[r])).join('')}
        <label class="t20g-auto-item">
          <input type="checkbox" name="ignoraImunidade" ${atual.ignoraImunidade ? 'checked' : ''}>
          <i class="fa-solid fa-shield-virus"></i>
          <span class="t20g-auto-nome">${t('VenenoCfgIgnora')}</span>
        </label>
        <p class="t20g-veneno-erro" hidden>${t('VenenoCfgInvalida')}</p>
      </div>`,
    buttons: [
      {
        action: 'salvar',
        label: t('AutoSalvar'),
        icon: 'fa-solid fa-check',
        default: true,
        callback: (_ev, botao) => lerConfig(botao.form)
      },
      { action: 'cancelar', label: t('AutoCancelar'), icon: 'fa-solid fa-xmark' }
    ],
    render: (_ev, dialogo) => {
      const el = dialogo.element;
      const form = el.querySelector('form') ?? el;
      const salvar = el.querySelector('[data-action="salvar"]');
      const erro = el.querySelector('.t20g-veneno-erro');
      const conferir = () => {
        const valida = configValida(lerConfig(form));
        salvar.disabled = !valida;
        erro.hidden = valida;
      };
      el.addEventListener('input', conferir);
      conferir();
    },
    rejectClose: false
  });
  if (!config || typeof config !== 'object') return false;
  await item.setFlag(MODULE_ID, FLAG_CONFIG, config);
  return true;
}

/** Tira a configuração do item quando a automação é desligada. */
async function limparConfig(item) {
  await item.unsetFlag(MODULE_ID, FLAG_CONFIG);
}

/* ─── Cartão do chat ─────────────────────────────────────────────────────── */

/**
 * Copia a configuração para a mensagem quando o cartão nasce. O cartão fica
 * no chat depois de o item ser editado, vendido ou apagado, e continua
 * aplicando o veneno que foi de fato usado.
 */
function marcarCartao(message) {
  const conteudo = String(message?._source?.content ?? '');
  if (!conteudo.includes('chat-card')) return;
  const itemId = conteudo.match(/data-item-id="([^"]+)"/)?.[1];
  if (!itemId) return;
  const ator = ChatMessage.getSpeakerActor(message.speaker)
    ?? game.actors.get(conteudo.match(/data-actor-id="([^"]+)"/)?.[1]);
  const item = ator?.items?.get(itemId);
  if (!definicaoDe(item)?.veneno) return;
  const config = configDe(item);
  if (!configValida(config)) return;
  message.updateSource({
    [`flags.${MODULE_ID}.${FLAG_CARTAO}`]: { ...config, nome: item.name, img: item.img }
  });
}

/** Rótulo do botão: "Sucesso: 1d6 por 2 rodadas". */
function textoDoBotao(resultado, dados) {
  return t(resultado === 'sucesso' ? 'VenenoBotaoSucesso' : 'VenenoBotaoFalha', {
    dano: dados.dano, duracao: textoRodadas(dados.rodadas)
  });
}

/** Um botão por resultado que aplica veneno: quem rolou e o Mestre aplicam. */
function injetarBotoes(message, container) {
  const veneno = message?.getFlag?.(MODULE_ID, FLAG_CARTAO);
  const card = container?.querySelector?.('.chat-card.item-card');
  if (!veneno || !card || card.querySelector('.t20g-veneno-barra')) return;
  if (!game.user.isGM && !message.isAuthor) return;

  const barra = document.createElement('footer');
  barra.className = 't20g-auto-barra t20g-veneno-barra';
  for (const resultado of RESULTADOS) {
    const dados = veneno[resultado];
    if (resultadoVazio(dados)) continue;
    const linha = document.createElement('div');
    linha.className = 't20g-auto-linha';
    const botao = criarBotao(null, 'veneno', ICONES[resultado], t('VenenoBotaoDica'), { largo: true });
    botao.append(` ${textoDoBotao(resultado, dados)}`);
    botao.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      botao.disabled = true;
      try { await aplicarDoCartao(message, veneno, resultado); }
      catch (err) { console.error(`${MODULE_ID} | Falha ao aplicar o veneno`, err); }
      finally { botao.disabled = false; }
    });
    linha.appendChild(botao);
    barra.appendChild(linha);
  }
  card.appendChild(barra);
}

/** Atores dos tokens guardados na mensagem por quem rolou. */
function atoresDoCartao(message) {
  const marca = message?.getFlag?.(MODULE_ID, FLAG_ALVOS);
  const cena = marca?.cena ? game.scenes.get(marca.cena) : canvas?.scene;
  return (marca?.tokens ?? []).map((id) => cena?.tokens?.get(id)?.actor);
}

/**
 * Quem recebe o veneno: a mira de quem clicou; sem ela, quem estava na mira
 * de quem rolou; sem nenhuma das duas, os tokens selecionados. A seleção vem
 * por último porque o jogador costuma ter o próprio personagem selecionado.
 */
function atoresAlvo(message) {
  const mirados = [...(game.user?.targets ?? [])].map((token) => token.actor);
  const doCartao = atoresDoCartao(message);
  const selecionados = (canvas?.tokens?.controlled ?? []).map((token) => token.actor);
  const atores = [mirados, doCartao, selecionados]
    .map((lista) => lista.filter(Boolean))
    .find((lista) => lista.length) ?? [];
  // Tokens do mesmo ator vinculado são uma criatura só
  return [...new Map(atores.map((ator) => [ator.uuid, ator])).values()];
}

/* ─── Aplicar na criatura ────────────────────────────────────────────────── */

/** Efeito da condição na ficha, mesmo quando a imunidade o suprime. */
function efeitoDaCondicao(ator) {
  return [...(ator?.effects ?? [])].find((ef) => ef.statuses?.has(CONDICAO));
}

function efeitoIgnoraImunidade(efeito) {
  // v14: mora em system.status; v13: flag do sistema.
  return ehV14() ? !!efeito.system?.status?.ignoreImunity : !!efeito.getFlag('tormenta20', 'ignoreImunity');
}

/** A condição acompanha a lista: liga com o primeiro veneno e sai com o último. */
async function sincronizarCondicao(ator) {
  const ativos = venenosDe(ator);
  if (!ativos.length) {
    if (efeitoDaCondicao(ator)) await ator.toggleStatusEffect(CONDICAO, { active: false });
    return;
  }
  if (!efeitoDaCondicao(ator)) await ator.toggleStatusEffect(CONDICAO, { active: true });

  const efeito = efeitoDaCondicao(ator);
  const ignora = ativos.some((v) => v.ignora);
  if (!efeito || efeitoIgnoraImunidade(efeito) === ignora) return;
  await efeito.update(ehV14()
    ? { 'system.status.ignoreImunity': ignora }
    : { 'flags.tormenta20.ignoreImunity': ignora });
}

/** Grava o veneno na ficha. Só roda em quem pode editar o ator. */
async function gravarVeneno(ator, entrada) {
  if (!entrada.ignora && imuneAVeneno(ator.system?.tracos?.ic?.value)) return 'imune';
  await ator.update({ [`flags.${MODULE_ID}.${FLAG_ATIVOS}.${entrada.id}`]: entrada });
  await sincronizarCondicao(ator);
  return 'aplicado';
}

/** O inimigo quase nunca é de quem clicou: sem permissão, o Mestre grava. */
async function pedirGravacao(ator, entrada) {
  if (ator.isOwner) return gravarVeneno(ator, entrada);
  const mestre = game.users.activeGM;
  if (!mestre) return 'sem-mestre';
  return mestre.query(PEDIDO_APLICAR, { uuid: ator.uuid, entrada });
}

async function aplicarDoCartao(message, veneno, resultado) {
  const atores = atoresAlvo(message);
  if (!atores.length) return ui.notifications.warn(t('VenenoSemAlvo'));

  const dados = veneno[resultado];
  for (const ator of atores) {
    const situacao = await pedirGravacao(ator, {
      id: foundry.utils.randomID(),
      nome: veneno.nome,
      img: veneno.img,
      resultado,
      dano: dados.dano,
      rodadas: dados.rodadas,
      ignora: !!veneno.ignoraImunidade,
      criado: Date.now()
    });
    if (situacao === 'aplicado') {
      ui.notifications.info(t('VenenoAplicado', {
        veneno: veneno.nome, alvo: ator.name, dano: dados.dano, duracao: textoRodadas(dados.rodadas)
      }));
    } else if (situacao === 'imune') {
      ui.notifications.warn(t('VenenoImune', { alvo: ator.name }));
    } else {
      ui.notifications.warn(t('VenenoSemMestre', { alvo: ator.name }));
    }
  }
}

/* ─── Início do turno ────────────────────────────────────────────────────── */

/** Onde o combate está, no formato das rolagens guardadas. */
function posicaoDe(combate) {
  return { combate: combate.id, rodada: Number(combate.round) || 0, turno: Number(combate.turn) || 0 };
}

/** Lista do cartão da rolagem: o que entrou no dano e quanto falta de cada um. */
function resumoDoTurno(nome, ativos) {
  const esc = foundry.utils.escapeHTML;
  const linhas = ativos.map((v) => {
    const faltam = normalizarRodadas(v.rodadas) - 1;
    const estado = faltam > 0 ? t('VenenoFaltam', { duracao: textoRodadas(faltam) }) : t('VenenoUltima');
    return `<li><b>${esc(v.nome)}</b>: ${esc(v.dano)} (${estado})</li>`;
  }).join('');
  return `<div class="t20g-veneno-turno">
      <i class="fa-solid fa-skull-crossbones"></i> ${t('VenenoTurno', { nome: esc(nome) })}
      <ul>${linhas}</ul>
    </div>`;
}

/**
 * Início do turno de uma criatura envenenada: rola o dano acumulado no chat
 * (quem aplica é a mesa, pelos botões do próprio cartão) e desconta uma rodada
 * de cada veneno. Hook de combate roda em todos os clientes; um só responde.
 */
async function aoIniciarTurno(combate) {
  const combatente = combate?.combatant;
  const ator = combatente?.actor;
  if (!ator || !combate.round || combatente.isDefeated) return;

  const ativos = venenosDe(ator);
  if (!ativos.length || !souResponsavelPeloAtor(ator)) return;

  const agora = posicaoDe(combate);
  const historico = ator.getFlag(MODULE_ID, FLAG_HISTORICO);
  if (jaRolou(historico, agora)) return;

  const rolagem = await new Roll(formulaAcumulada(ativos), {}, { type: 'damage' }).evaluate();
  await rolagem.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: ator, token: combatente.token }),
    flavor: resumoDoTurno(combatente.name, ativos)
  }, { rollMode: combatente.hidden ? CONST.DICE_ROLL_MODES.PRIVATE : game.settings.get('core', 'rollMode') });

  const { restantes, encerrados } = avancarRodada(ativos);
  const raiz = `flags.${MODULE_ID}`;
  const mudancas = {
    [`${raiz}.${FLAG_HISTORICO}`]: registrarTurno(historico, agora, { restantes, encerrados })
  };
  for (const v of restantes) mudancas[`${raiz}.${FLAG_ATIVOS}.${v.id}.rodadas`] = v.rodadas;
  await ator.update({ ...mudancas, ...encerrar(encerrados) });
  await sincronizarCondicao(ator);
}

/**
 * O Mestre voltou no combate: as rolagens que ficaram adiante deixam de valer
 * e a duração dos venenos volta. A perda de PV fica com a mesa, que desfaz
 * pelo próprio cartão da rolagem. Ao avançar de novo, o veneno rola de novo.
 */
async function desfazerRecuo(combate) {
  const agora = posicaoDe(combate);
  const atores = new Set([...combate.combatants].map((c) => c.actor).filter(Boolean));
  for (const ator of atores) {
    const antes = ator.getFlag(MODULE_ID, FLAG_HISTORICO);
    if (!antes?.length) continue;
    const { historico, mudados } = desfazerTurnos(antes, agora, venenosDe(ator));
    if (historico.length === antes.length || !souResponsavelPeloAtor(ator)) continue;
    const raiz = `flags.${MODULE_ID}`;
    const mudancas = { [`${raiz}.${FLAG_HISTORICO}`]: historico };
    for (const v of mudados) mudancas[`${raiz}.${FLAG_ATIVOS}.${v.id}`] = v;
    await ator.update(mudancas);
    await sincronizarCondicao(ator);
  }
}

/** Avanço do combate: acerta o que voltou e rola para quem começa o turno. */
async function aoMudarTurno(combate, { recuou = false } = {}) {
  await desfazerRecuo(combate);
  // Voltar para um turno não é começá-lo de novo.
  if (!recuou) await aoIniciarTurno(combate);
}

/**
 * A condição saiu por fora (à mão, curada, fim de cena): os venenos saem
 * junto, senão a criatura seguiria rolando dano sem estar envenenada.
 */
async function aoRemoverCondicao(efeito) {
  const ator = efeito?.parent;
  if (ator?.documentName !== 'Actor' || !efeito.statuses?.has(CONDICAO)) return;
  if (efeitoDaCondicao(ator) || !venenosDe(ator).length) return;
  if (!souResponsavelPeloAtor(ator)) return;
  // O histórico sai junto: voltar o turno depois não pode ressuscitar a cura.
  await ator.update({
    ...encerrar(venenosDe(ator)),
    [`flags.${MODULE_ID}.${FLAG_HISTORICO}`]: []
  });
}

/* ─── Gerenciar automações ───────────────────────────────────────────────── */

function temVenenos(ator) {
  return podeControlar(ator) && venenosDe(ator).length > 0;
}

function htmlLinhaPainel(veneno) {
  const esc = foundry.utils.escapeHTML;
  const origem = t(veneno.resultado === 'sucesso' ? 'VenenoPainelSucesso' : 'VenenoPainelFalha');
  return `<div class="t20g-contadores-linha t20g-veneno-linha" data-veneno-id="${esc(veneno.id)}">
      <span class="t20g-contadores-icone"><i class="fa-solid fa-skull-crossbones"></i></span>
      <span class="t20g-contadores-texto"><b>${esc(veneno.nome)}</b><small>${esc(origem)}</small></span>
      <label class="t20g-contadores-cancelar">
        <input type="checkbox" data-veneno-campo="remover">
        <span>${t('VenenoPainelEncerrar')}</span>
      </label>
      <div class="t20g-veneno-campos">
        <label>
          <span>${t('VenenoPainelDano')}</span>
          <input class="t20g-campo" type="text" value="${esc(veneno.dano)}"
            data-veneno-campo="dano" autocomplete="off">
        </label>
        <label>
          <span>${t('VenenoPainelRodadas')}</span>
          <input class="t20g-campo t20g-contadores-numero" type="number" min="0" step="1"
            value="${normalizarRodadas(veneno.rodadas)}" data-veneno-campo="rodadas">
        </label>
        <label class="t20g-veneno-ignora">
          <input type="checkbox" data-veneno-campo="ignora" ${veneno.ignora ? 'checked' : ''}>
          <span>${t('VenenoPainelIgnora')}</span>
        </label>
      </div>
    </div>`;
}

function htmlPainel(ator) {
  return venenosDe(ator).map(htmlLinhaPainel).join('');
}

/**
 * Lê só o que foi editado, comparando com o que a janela abriu. Um turno pode
 * passar com ela aberta: campo intocado não pode devolver a rodada descontada.
 */
function lerPainel(form) {
  return [...form.querySelectorAll('[data-veneno-id]')].map((linha) => {
    const campo = (nome) => linha.querySelector(`[data-veneno-campo="${nome}"]`);
    const { value: dano, defaultValue: danoAberto } = campo('dano');
    const { value: rodadas, defaultValue: rodadasAberto } = campo('rodadas');
    const { checked: ignora, defaultChecked: ignoraAberto } = campo('ignora');
    const campos = {};
    if (normalizarDano(dano) !== normalizarDano(danoAberto)) campos.dano = normalizarDano(dano);
    if (normalizarRodadas(rodadas) !== normalizarRodadas(rodadasAberto)) campos.rodadas = normalizarRodadas(rodadas);
    if (ignora !== ignoraAberto) campos.ignora = ignora;
    return { id: linha.dataset.venenoId, remover: campo('remover').checked, campos };
  });
}

/**
 * Aplica só o que mudou em cada veneno. Zerar as rodadas encerra o veneno,
 * como acontece quando elas acabam em combate; um veneno que terminou com a
 * janela aberta é ignorado. Devolve quantos venenos mudaram.
 */
async function aplicarPainel(ator, edicoes) {
  const atuais = new Map(venenosDe(ator).map((v) => [v.id, v]));
  const raiz = `flags.${MODULE_ID}.${FLAG_ATIVOS}`;
  const mudancas = {};
  let total = 0;

  for (const edicao of edicoes) {
    const atual = atuais.get(edicao.id);
    if (!atual) continue;
    if (edicao.remover || edicao.campos.rodadas === 0) {
      Object.assign(mudancas, encerrar([atual]));
      total++;
      continue;
    }
    const { campos } = edicao;
    if ('dano' in campos && !danoValido(campos.dano)) {
      ui.notifications.warn(t('VenenoPainelDanoInvalido', { nome: atual.nome }));
      delete campos.dano;
    }
    const chaves = Object.keys(campos);
    if (!chaves.length) continue;
    for (const chave of chaves) mudancas[`${raiz}.${edicao.id}.${chave}`] = campos[chave];
    total++;
  }

  if (!total) return 0;
  await ator.update(mudancas);
  await sincronizarCondicao(ator);
  return total;
}

/** Registra o pedido que os jogadores fazem ao Mestre. */
function ligar() {
  CONFIG.queries[PEDIDO_APLICAR] = async ({ uuid, entrada }) => {
    const ator = await fromUuid(uuid);
    return ator ? gravarVeneno(ator, entrada) : 'sem-mestre';
  };
}

export const venenos = {
  ligar,
  configurar,
  limparConfig,
  marcarCartao,
  injetarBotoes,
  aoMudarTurno,
  aoRemoverCondicao,
  temVenenos,
  htmlPainel,
  lerPainel,
  aplicarPainel
};
