/**
 * T20 Hayd GMTools | Prévia de acerto, dano e crítico na janela de uso
 *
 * Mostra, logo abaixo do Custo de Mana Total, o que a arma/magia/poder vai
 * rolar — já com aprimoramentos marcados, passos de dado, dados extras e os
 * bônus gerais do ator (Bênção, Oração, só corpo a corpo, só magia…).
 *
 * A prévia NÃO recalcula nada por conta própria. Ela monta um clone do item,
 * manda o PRÓPRIO sistema aplicar os efeitos de uso nesse clone e depois roda
 * o `rollAttack()`/`rollDamage()` dele: é o mesmo caminho da rolagem de
 * verdade, então a fórmula que aparece aqui é a que vai para o chat.
 *
 * O pulo do gato é que `applyOnUseEffects` é interna ao bundle do sistema — a
 * única porta pública para ela é o callback do botão "Usar" que o
 * `AbilityUseDialog` monta. Então um diálogo é construído para o clone (com o
 * `render` neutralizado, nada aparece na tela) e esse callback é chamado à mão
 * com o formulário da janela de verdade.
 *
 * Três consequências disso, tratadas aqui:
 * - o clone leva a marca `_t20gPreview`, que as automações do módulo
 *   reconhecem para não ativar nada (elas também embrulham o `create`);
 * - os dados são rolados com `allowInteractive: false`, senão a rolagem
 *   manual do Foundry abriria uma janela a cada recálculo;
 * - quem decide se o dano é crítico é o `system.rolled` do item, não um
 *   parâmetro — tanto no sistema quanto no t20-hayd-itens (Pena de Kraken,
 *   Assassina). A volta do crítico forja esse estado antes de rolar.
 */

import {
  alternarModo, aplicarBonusAcerto, aplicarBonusDano, textoDaMargem
} from './scripts/preview-dano.mjs';
import { engenhocas } from './scripts/automacoes/engenhocas/index.mjs';
import { automacoesAtivas } from './scripts/automacoes/runtime.mjs';

const MODULE_ID = 't20-hayd-gmtools';
const SETTING = 'previewDano';
const FLAG = 'danoMinMax';
const ESPERA_MS = 150;
const VALIDADE_MS = 5000;

/** Silencia o carimbo de maximizado/minimizado enquanto a prévia roda. */
let emPreview = false;
/** Último `rollDamage` de verdade com minmax, esperando virar carimbo. */
let pendente = null;

const esc = (valor) => foundry.utils.escapeHTML(String(valor ?? ''));
const t = (chave, dados) => (dados
  ? game.i18n.format(`T20HaydGMTools.${chave}`, dados)
  : game.i18n.localize(`T20HaydGMTools.${chave}`));

function ativo() {
  try { return !!game.settings.get(MODULE_ID, SETTING); }
  catch { return false; }
}

const temRolagem = (item, tipo) =>
  !!item?.system?.rolls?.some((r) => r.type === tipo && r.parts?.[0]?.[0]);

/**
 * Teste de perícia não passa por um Item: o sistema monta um objeto solto
 * (nome, parts, actor…) e entrega esse objeto ao mesmo diálogo de uso.
 */
const ehPericia = (item) => item?.type === 'pericia' && Array.isArray(item?.parts);

/* ─── Configuração pelo próprio sistema ───────────────────────────────────── */

/**
 * Devolve a configuração que o sistema produziria se o usuário clicasse em
 * "Usar" agora — com os efeitos de uso já aplicados ao `clone`.
 */
async function configurarComOSistema(clone, form) {
  const Dialogo = game.tormenta20?.applications?.AbilityUseDialog;
  if (!Dialogo) return null;

  const originalRender = Dialogo.prototype.render;
  let capturado = null;
  // Só o diálogo DESTE clone deixa de renderizar; qualquer outro que apareça
  // nesse meio-tempo (o usuário abrindo outra ficha) segue normal.
  Dialogo.prototype.render = function (...args) {
    if (this.item !== clone) return originalRender.apply(this, args);
    capturado = this;
    return this;
  };

  try {
    const configuracao = Dialogo.create(clone);
    let encerrada = false;
    configuracao.then(() => { encerrada = true; }, () => { encerrada = true; });
    // create() é assíncrona (monta a lista de aprimoramentos e renderiza o
    // template antes de construir o diálogo).
    for (let i = 0; !capturado && !encerrada && i < 100; i += 1) {
      await new Promise((pronto) => setTimeout(pronto, 5));
    }
    const callback = capturado?.data?.buttons?.use?.callback;
    if (!callback) return null;
    // O callback faz `html[0].querySelector("form")`; este envelope garante
    // que ele receba exatamente o formulário da janela aberta.
    callback([{
      querySelector: (seletor) => (seletor === 'form' ? form : form.querySelector(seletor))
    }]);
    return await configuracao;
  } finally {
    Dialogo.prototype.render = originalRender;
  }
}

/**
 * Roda as rolagens sem abrir nada na tela.
 *
 * A prévia recalcula a cada tecla e nenhum dado dela vai para a mesa; com a
 * rolagem manual do Foundry ligada, sem isto cada recálculo pediria os valores
 * dos dados numa janela.
 */
async function rolarEmSilencio(tarefa) {
  const originalEvaluate = Roll.prototype.evaluate;
  Roll.prototype.evaluate = function (opcoes = {}) {
    return originalEvaluate.call(this, { ...opcoes, allowInteractive: false });
  };
  emPreview = true;
  try { return await tarefa(); }
  finally {
    Roll.prototype.evaluate = originalEvaluate;
    emPreview = false;
  }
}

function colherDano(clone) {
  const linhas = [];
  for (const rolagem of clone.system.rolls.filter((r) => r.type === 'dano')) {
    const roll = clone.system.rolled?.[rolagem.name];
    if (!roll) continue;
    linhas.push({ nome: rolagem.name, formula: roll.formula, total: roll.total });
  }
  return linhas;
}

/**
 * Cópia do objeto de perícia para o diálogo mexer à vontade.
 *
 * `actor` continua sendo o ator de verdade (é dele que saem os bônus), mas
 * `parts` e `system` são cópias: é neles que o applyOnUseEffects escreve os
 * aprimoramentos marcados e o campo "Bônus" da janela.
 */
function copiarPericia(item) {
  return {
    ...item,
    parts: [...(item.parts ?? [])],
    system: foundry.utils.deepClone(item.system ?? {}),
    effects: [],
    _t20gPreview: true
  };
}

async function calcularPreviewPericia(item, form) {
  const ator = item.actor;
  if (!ator) return null;
  const copia = copiarPericia(item);

  return rolarEmSilencio(async () => {
    const config = await configurarComOSistema(copia, form);
    if (!config) return null;

    // Mesma montagem do `rollPericia` do sistema: a configuração da janela
    // vira o rConfig, o itemData entra nela e o resto é preenchido por cima.
    const rConfig = foundry.utils.mergeObject({}, config);
    rConfig.itemData = copia;
    const rollConfig = foundry.utils.mergeObject({
      parts: copia.parts,
      actor: ator,
      event: {},
      data: ator.getRollData(),
      title: copia.label,
      flavor: copia.label
    }, rConfig);

    const roll = await game.tormenta20.dice.d20Roll(rollConfig);
    return roll ? { teste: { formula: roll.formula } } : null;
  });
}

async function calcularPreview(item, form) {
  if (ehPericia(item)) return calcularPreviewPericia(item, form);
  const clone = item.clone({}, { keepId: true });
  // As automações (Engenhoqueiro, Golpe Pessoal) também embrulham o
  // AbilityUseDialog: sem esta marca, cada recálculo ativaria o poder de novo.
  clone._t20gPreview = true;

  return rolarEmSilencio(async () => {
    const config = await configurarComOSistema(clone, form);
    if (!config) return null;

    // `use()` aplica os campos "Bônus:" e "Dano:" da janela depois do diálogo,
    // fora do applyOnUseEffects — é o único trecho do sistema repetido aqui.
    aplicarBonusDano(clone.system.rolls, config.bonusdano);
    aplicarBonusAcerto(clone.system.rolls, config.bonus);

    // Aparatos de engenhoca mexem no dano (Estimulador de Sobrecarga) e só
    // entram no fluxo de ativação, que a prévia não executa.
    if (automacoesAtivas() && engenhocas.ehEngenhoca(clone)) {
      engenhocas.aplicarAparatos(clone, config, engenhocas.estado(clone));
    }

    const comAtaque = temRolagem(clone, 'ataque');
    const comDano = temRolagem(clone, 'dano');
    const rolagemAtaque = clone.system.rolls.find((r) => r.type === 'ataque');

    clone.system.rolled = {};
    let ataque = null;
    if (comAtaque) {
      await clone.rollAttack({ options: { ...config } });
      const roll = clone.system.rolled?.[rolagemAtaque?.name];
      if (roll) {
        ataque = {
          formula: roll.formula,
          margem: textoDaMargem(clone.system.criticoM),
          multiplicador: Number(clone.system.criticoX) || 2
        };
      }
    }

    let dano = [];
    let critico = [];
    if (comDano) {
      // Sem nenhum `_critical` registrado: o d20 que acabou de ser rolado aqui
      // é aleatório, e sem limpar isto o dano "normal" sairia crítico de vez
      // em quando.
      clone.system.rolled = {};
      await clone.rollDamage({ options: { ...config, critical: false } });
      dano = colherDano(clone);

      if (comAtaque) {
        // Crítico forjado: é assim que o sistema (armas) e o t20-hayd-itens
        // (Pena de Kraken, Assassina) descobrem que houve crítico. Só o
        // parâmetro `critical` não bastaria — eles nem olham para ele.
        clone.system.rolled = {
          Ataque: { _critical: true },
          [rolagemAtaque?.name ?? 'Ataque']: { _critical: true }
        };
        await clone.rollDamage({ options: { ...config, critical: true } });
        critico = colherDano(clone);
        // Nada multiplicável nem dano só-de-crítico: a linha vira ruído.
        const igual = critico.length === dano.length
          && critico.every((linha, i) => linha.formula === dano[i].formula);
        if (igual) critico = [];
      }
    }

    const modo = ['max', 'min'].includes(config.minmax) ? config.minmax : '';
    return { ataque, dano, critico, modo };
  });
}

/* ─── Janela de uso ───────────────────────────────────────────────────────── */

function montarLinha(chave, rotulo) {
  const linha = document.createElement('div');
  linha.className = 't20g-preview-linha';
  linha.dataset.linha = chave;
  linha.innerHTML = `<span class="t20g-preview-rotulo">${esc(rotulo)}</span>
    <span class="t20g-preview-formula">…</span>`;
  return linha;
}

function montarModos() {
  const bloco = document.createElement('div');
  bloco.className = 't20g-preview-modos';
  bloco.innerHTML = `<label title="${esc(t('PreviewMaximizarDica'))}">
      <input type="checkbox" data-t20g-modo="max"> ${esc(t('PreviewMaximizar'))}</label>
    <label title="${esc(t('PreviewMinimizarDica'))}">
      <input type="checkbox" data-t20g-modo="min"> ${esc(t('PreviewMinimizar'))}</label>`;
  return bloco;
}

function montarPainel() {
  const painel = document.createElement('details');
  painel.className = 't20g-preview';
  painel.innerHTML = `<summary>
      <span class="t20g-preview-titulo">${esc(t('PreviewTitulo'))}</span>
      <span class="t20g-preview-resumo"></span>
    </summary>
    <input type="hidden" name="minmax" value="">`;
  return painel;
}

function textoDasLinhas(linhas, modo) {
  if (!linhas?.length) return t('PreviewDanoVazio');
  const varias = linhas.length > 1;
  return linhas.map((linha) => {
    const nome = varias ? `${linha.nome}: ` : '';
    const total = modo ? ` = ${linha.total}` : '';
    return `${nome}${linha.formula}${total}`;
  }).join('  ·  ');
}

function escrever(linha, texto, mostrar) {
  if (!linha) return;
  linha.classList.toggle('t20g-oculto', !mostrar);
  const campo = linha.querySelector('.t20g-preview-formula');
  if (campo) campo.textContent = texto;
}

function pintar(painel, linhas, dados) {
  if (linhas.teste) {
    escrever(linhas.teste, dados?.teste?.formula ?? t('PreviewDanoVazio'), !!dados?.teste);
  }
  if (linhas.acerto) {
    escrever(linhas.acerto, dados?.ataque?.formula ?? t('PreviewDanoVazio'), !!dados?.ataque);
    const extra = linhas.acerto.querySelector('.t20g-preview-extra');
    if (extra) {
      extra.textContent = dados?.ataque
        ? t('PreviewCriticoInfo', {
          margem: dados.ataque.margem,
          mult: dados.ataque.multiplicador
        })
        : '';
    }
  }
  if (linhas.dano) {
    escrever(linhas.dano, textoDasLinhas(dados?.dano, dados?.modo), !!dados?.dano?.length);
  }
  if (linhas.critico) {
    escrever(linhas.critico, textoDasLinhas(dados?.critico, dados?.modo), !!dados?.critico?.length);
  }

  // Recolhido, o resumo já entrega o essencial: o dano (ou o acerto, quando a
  // habilidade só tem ataque; ou o próprio teste, numa perícia).
  const resumo = painel.querySelector('.t20g-preview-resumo');
  if (resumo) {
    resumo.textContent = dados?.teste?.formula
      ?? (dados?.dano?.length ? textoDasLinhas(dados.dano, dados.modo) : dados?.ataque?.formula ?? '');
  }
}

Hooks.on('renderAbilityUseDialog', (app, html) => {
  if (!ativo()) return;
  const item = app?.item;
  const pericia = ehPericia(item);
  if (!pericia && !temRolagem(item, 'dano') && !temRolagem(item, 'ataque')) return;
  const raiz = html?.[0] ?? html;
  const form = raiz?.querySelector?.('#ability-use-form') ?? raiz;
  const ancora = form?.querySelector?.('.total-cost');
  if (!form || !ancora || form.querySelector('.t20g-preview')) return;

  const painel = montarPainel();
  // Perícia tem uma rolagem só; maximizar/minimizar é coisa de dano.
  const linhas = pericia
    ? { teste: montarLinha('teste', t('PreviewTesteRotulo')) }
    : {
      acerto: montarLinha('acerto', t('PreviewAcertoRotulo')),
      dano: montarLinha('dano', t('PreviewDanoRotulo')),
      critico: montarLinha('critico', t('PreviewCriticoRotulo'))
    };
  if (linhas.acerto) {
    const extra = document.createElement('span');
    extra.className = 't20g-preview-extra';
    linhas.acerto.appendChild(extra);
  }
  linhas.dano?.appendChild(montarModos());
  for (const linha of Object.values(linhas)) painel.appendChild(linha);
  ancora.after(painel);
  const escondido = painel.querySelector('input[name=minmax]');

  let atrasado = null;
  let ultimo = 0;
  const atualizar = () => {
    const vez = ++ultimo;
    calcularPreview(item, form).then((dados) => {
      // Uma volta mais nova já chegou: esta virou resposta velha.
      if (vez !== ultimo || !painel.isConnected) return;
      pintar(painel, linhas, dados);
    }).catch((err) => {
      console.error(`${MODULE_ID} | Falha ao calcular a prévia`, err);
      if (vez === ultimo && painel.isConnected) pintar(painel, linhas, null);
    });
  };
  // O atraso também serve para rodar DEPOIS do sistema: os botões +/- dos
  // aprimoramentos escrevem no campo sem disparar evento de mudança.
  const agendar = () => {
    clearTimeout(atrasado);
    atrasado = setTimeout(atualizar, ESPERA_MS);
  };

  for (const evento of ['change', 'input', 'click']) form.addEventListener(evento, agendar);

  for (const caixinha of painel.querySelectorAll('[data-t20g-modo]')) {
    caixinha.addEventListener('change', () => {
      const modo = alternarModo(escondido.value, caixinha.dataset.t20gModo);
      escondido.value = modo;
      for (const outra of painel.querySelectorAll('[data-t20g-modo]')) {
        outra.checked = outra.dataset.t20gModo === modo;
      }
      agendar();
    });
  }

  atualizar();
});

/* ─── Marca no chat ───────────────────────────────────────────────────────── */

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, SETTING, {
    name: 'T20HaydGMTools.SettingPreviewDanoName',
    hint: 'T20HaydGMTools.SettingPreviewDanoHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });
});

Hooks.once('setup', () => {
  const proto = CONFIG.Item?.documentClass?.prototype;
  if (!proto || proto._t20gPreviewDano || typeof proto.rollDamage !== 'function') return;
  const original = proto.rollDamage;
  proto.rollDamage = async function (args = {}) {
    // Vale para o minmax vindo da caixa de seleção E para o de efeitos do
    // sistema que maximizam dano — os dois chegam pelo mesmo caminho.
    if (!emPreview) {
      const modo = args?.options?.minmax;
      pendente = ['max', 'min'].includes(modo) ? { modo, quando: Date.now() } : null;
    }
    return original.call(this, args);
  };
  proto._t20gPreviewDano = true;
});

Hooks.on('preCreateChatMessage', (message) => {
  if (!pendente) return;
  const { modo, quando } = pendente;
  pendente = null;
  if (Date.now() - quando >= VALIDADE_MS) return;
  if (!String(message.content ?? '').includes('chat-card item-card')) return;
  message.updateSource({ [`flags.${MODULE_ID}.${FLAG}`]: modo });
});

Hooks.on('renderChatMessageHTML', (message, html) => {
  const modo = message.getFlag?.(MODULE_ID, FLAG);
  if (!['max', 'min'].includes(modo)) return;
  const raiz = html?.querySelector ? html : html?.[0];
  const card = raiz?.querySelector?.('.chat-card.item-card');
  if (!card || card.querySelector('.t20g-minmax-aviso')) return;

  card.classList.add('t20g-minmax', `t20g-minmax-${modo}`);
  const aviso = document.createElement('div');
  aviso.className = 't20g-minmax-aviso';
  aviso.innerHTML = `<i class="fa-solid ${modo === 'max' ? 'fa-angles-up' : 'fa-angles-down'}"></i>
    ${esc(t(modo === 'max' ? 'DanoMaximizado' : 'DanoMinimizado'))}`;
  const primeiraRolagem = card.querySelector('.roll');
  if (primeiraRolagem) primeiraRolagem.before(aviso);
  else card.appendChild(aviso);
});
