/**
 * T20 Hayd GMTools | Flanqueamento
 *
 * Efeito de uso "Flanqueando" (+2 no ataque corpo a corpo), marcado sozinho
 * quando o alvo está flanqueado, e a linha no mapa ao passar o mouse no seu
 * token ou no alvo (ou segurar Alt). A regra está em scripts/flanco.mjs.
 *
 * Até a primeira janela de uso de uma arma corpo a corpo o efeito só existe em
 * memória, e fichas que nunca atacam assim não gravam nada. Daí em diante ele
 * fica na ficha, com id fixo: bônus somados a ele valem em toda rolagem.
 * Apagado, volta ao padrão na janela seguinte.
 */

import {
  ID_EFEITO_FLANCO, alcanceDoTamanho, dadosDoEfeitoDeFlanco, distanciaEmMetros, linhasDeFlanco, saoInimigos
} from './scripts/flanco.mjs';
import {
  garantirLista, montarLinhaVirtual, registrarEfeitoVirtual, registrarFiltroDeEfeito
} from './t20-hayd-manobra.mjs';
import { paraOSistema } from './scripts/versao.mjs';

const MODULE_ID = 't20-hayd-gmtools';
const SETTING = 'flanqueamento';
const INCAPAZES = ['morto', 'inconsciente', 'atordoado', 'paralisado', 'petrificado'];

const t = (chave) => game.i18n.localize(`T20HaydGMTools.${chave}`);

function ativo() {
  try { return !!game.settings.get(MODULE_ID, SETTING); }
  catch { return false; }
}

function retangulo(token) {
  const grade = canvas.grid.size;
  const { x, y, width, height, elevation } = token.document;
  return { x, y, w: Math.max(width, 1) * grade, h: Math.max(height, 1) * grade, elevacao: elevation };
}

function podeFlanquear(token, alvo) {
  const ator = token.actor;
  if (!ator || token === alvo || !alvo.actor || token.document.hidden || alvo.document.hidden) return false;
  if (!['character', 'npc'].includes(ator.type) || !['character', 'npc'].includes(alvo.actor.type)) return false;
  if (!saoInimigos(token.document.disposition, alvo.document.disposition)) return false;
  if (INCAPAZES.some((s) => ator.statuses?.has(s))) return false;
  const { size, distance } = canvas.grid;
  return distanciaEmMetros(retangulo(token), retangulo(alvo), size, distance)
    <= alcanceDoTamanho(ator.system?.tracos?.tamanho);
}

/** Aliados que flanqueiam o alvo com este token, cada um com suas linhas. */
function flancos(token, alvo) {
  if (!canvas.grid.isSquare || !podeFlanquear(token, alvo)) return [];
  return canvas.tokens.placeables
    .filter((o) => o !== token && o.document.disposition === token.document.disposition
      && podeFlanquear(o, alvo))
    .map((aliado) => linhasDeFlanco(retangulo(token), retangulo(aliado), retangulo(alvo), canvas.grid.size, {
      metros: canvas.grid.distance,
      alcanceA: alcanceDoTamanho(token.actor.system?.tracos?.tamanho),
      alcanceB: alcanceDoTamanho(aliado.actor.system?.tracos?.tamanho)
    }))
    .filter((linhas) => linhas.length);
}

/* ─── Efeito de uso ───────────────────────────────────────────────────────── */

function tokenDe(ator) {
  return ator.token?.object
    ?? canvas.tokens?.controlled.find((o) => o.actor === ator)
    ?? ator.getActiveTokens()[0];
}

function usaFlanco(item) {
  return ativo() && item?.type === 'arma' && !!item.actor
    && !['disparo', 'arremesso'].includes(item.system?.proposito);
}

function estaFlanqueando(item) {
  const token = canvas.ready ? tokenDe(item.actor) : null;
  const alvos = [...game.user.targets];
  return !!token && alvos.length > 0 && alvos.every((alvo) => flancos(token, alvo).length);
}

function dadosDoEfeito(ator) {
  return paraOSistema(dadosDoEfeitoDeFlanco({ nome: t('Flanqueando'), origem: ator.uuid }));
}

// Ator ainda sem o efeito na ficha: é o que vale nesta primeira janela.
registrarEfeitoVirtual((item) => (usaFlanco(item) && !item.actor.effects.has(ID_EFEITO_FLANCO)
  ? new CONFIG.ActiveEffect.documentClass(dadosDoEfeito(item.actor), { parent: item.actor })
  : null));
registrarFiltroDeEfeito((efeito, item) => efeito.id !== ID_EFEITO_FLANCO || usaFlanco(item));

const criando = new Set();

/** Grava o efeito na ficha. Quem não pode gravar segue com o efeito em memória. */
async function garantirEfeito(ator) {
  if (!['character', 'npc'].includes(ator.type) || ator.effects.has(ID_EFEITO_FLANCO)) return;
  // Token não vinculado herda do ator do mundo: uma escrita só para o bando
  // inteiro, e é lá que o Mestre edita o efeito.
  const dono = ator.isToken ? game.actors.get(ator.id) : ator;
  if (!dono?.isOwner || dono.pack || dono.effects.has(ID_EFEITO_FLANCO) || criando.has(dono.uuid)) return;
  criando.add(dono.uuid);
  try {
    await dono.createEmbeddedDocuments('ActiveEffect', [dadosDoEfeito(dono)], { keepId: true });
  } finally {
    criando.delete(dono.uuid);
  }
}

Hooks.on('renderAbilityUseDialog', (app, html) => {
  const raiz = html?.[0] ?? html;
  const form = raiz?.querySelector?.('#ability-use-form') ?? raiz;
  const item = app?.item;
  // A prévia não renderiza janela: aqui só chega uso de verdade.
  if (usaFlanco(item)) {
    garantirEfeito(item.actor).catch((err) =>
      console.error(`${MODULE_ID} | Falha ao gravar o efeito de flanco`, err));
  }
  const efeitos = item?.applicableOnUseEffects ?? item?.validOnUseEffects ?? [];
  const efeito = efeitos.find((ef) => ef.id === ID_EFEITO_FLANCO);
  if (!efeito || !form?.querySelector) return;

  const lista = garantirLista(form, true);
  // v13: o sistema só desenha efeitos reais.
  const linha = form.querySelector(`input[name="aprs.${ID_EFEITO_FLANCO}.aplica"]`)?.closest('li')
    ?? montarLinhaVirtual(efeito);
  const caixa = linha.querySelector('input[type=checkbox]');
  if (caixa) caixa.checked = caixa.defaultChecked = estaFlanqueando(item);
  const ancora = [...lista.querySelectorAll('.t20g-manobra-filha')].at(-1)
    ?? lista.querySelector('.t20g-manobra') ?? lista.querySelector('.items-header');
  ancora?.after(linha);
});

/* ─── Linha no mapa ───────────────────────────────────────────────────────── */

let camada = null;
let sobMouse = null;

function limpar() {
  camada?.destroy({ children: true });
  camada = null;
}

function desenharLinha(de, para, cor) {
  const fina = CONFIG.Canvas.objectBorderThickness;
  camada.lineStyle(Math.round(fina * 1.5), 0, 0.5).moveTo(de.x, de.y).lineTo(para.x, para.y);
  camada.lineStyle(fina, cor, 0.5).moveTo(de.x, de.y).lineTo(para.x, para.y);
  for (const ponto of [de, para]) {
    camada.beginFill(cor).lineStyle(1, 0).drawCircle(ponto.x, ponto.y, Math.round(fina * 2)).endFill();
  }
}

function linhaCentral(linhas, centro) {
  const distancia = ([de, para]) => {
    const dx = para.x - de.x, dy = para.y - de.y;
    return Math.abs(dy * (centro.x - de.x) - dx * (centro.y - de.y)) / (Math.hypot(dx, dy) || 1);
  };
  return linhas.reduce((melhor, l) => (distancia(l) < distancia(melhor) ? l : melhor));
}

/** O rótulo fica sobre a linha do meio, acompanhando a inclinação dela. */
function desenharRotulo([de, para], cor) {
  const estilo = CONFIG.canvasTextStyle.clone();
  const { size } = canvas.dimensions;
  estilo.fontSize = size >= 200 ? 28 : size < 50 ? 20 : 24;
  estilo.fill = cor;
  estilo.stroke = 0;
  const texto = new foundry.canvas.containers.PreciseText(t('Flanqueado'), estilo);
  texto.anchor.set(0.5, 0.5);
  let angulo = Math.atan2(para.y - de.y, para.x - de.x);
  if (angulo > Math.PI / 2) angulo -= Math.PI;
  else if (angulo < -Math.PI / 2) angulo += Math.PI;
  texto.rotation = angulo;
  texto.position.set((de.x + para.x) / 2, (de.y + para.y) / 2);
  camada.addChild(texto);
}

function desenhar() {
  limpar();
  if (!ativo() || !canvas.ready || !game.user.targets.size) return;
  const alvos = [...game.user.targets];
  const destaque = canvas.tokens.highlightObjects;
  const meus = canvas.tokens.controlled.filter((o) => o.isOwner);
  const personagem = game.user.character?.getActiveTokens() ?? [];
  const atacantes = [...new Set([...meus, ...personagem])].filter((o) => !o.animation);
  if (!destaque && !atacantes.includes(sobMouse) && !alvos.includes(sobMouse)) return;

  const cor = CONFIG.Canvas.dispositionColors.CONTROLLED;
  for (const token of atacantes) {
    for (const alvo of alvos) {
      for (const linhas of flancos(token, alvo)) {
        if (!camada) {
          camada = canvas.tokens.addChild(new PIXI.Graphics());
          // Sem isto o desenho "rouba" o mouse do token, o hover cai e a linha
          // é apagada e refeita a cada movimento.
          camada.eventMode = 'none';
          camada.interactiveChildren = false;
        }
        // Criatura grande gera um leque de linhas: basta a que passa mais
        // perto do centro do alvo.
        const linha = linhaCentral(linhas, alvo.center);
        desenharLinha(...linha, cor);
        desenharRotulo(linha, cor);
      }
    }
  }
}

Hooks.on('hoverToken', (token, sobre) => {
  sobMouse = sobre ? token : null;
  desenhar();
});
Hooks.on('highlightObjects', desenhar);
Hooks.on('targetToken', desenhar);
Hooks.on('controlToken', desenhar);
Hooks.on('updateToken', async (documento) => {
  limpar();
  await documento.object?.movementAnimationPromise;
  desenhar();
});
Hooks.on('canvasTearDown', () => { camada = null; sobMouse = null; });

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, SETTING, {
    name: 'T20HaydGMTools.SettingFlancoName',
    hint: 'T20HaydGMTools.SettingFlancoHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });
});
