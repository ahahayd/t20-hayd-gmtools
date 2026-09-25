/**
 * T20 Hayd GMTools | Presets de primeira abertura
 *
 * Na primeira vez que o módulo roda num mundo, o Mestre escolhe de uma vez o
 * quanto quer ligar, pelo peso que cada função tem na mesa (ver
 * scripts/impacto.mjs). Quem preferir escolher a dedo fecha a janela: nada é
 * alterado, e as opções continuam todas nas configurações do módulo.
 */

import { FUNCOES, IMPACTO_CHAVES, ligadasNoPreset } from './scripts/impacto.mjs';

const MODULE_ID = 't20-hayd-gmtools';
const SETTING = 'presetsEscolhidos';

const esc = (valor) => foundry.utils.escapeHTML(String(valor ?? ''));
const t = (chave) => game.i18n.localize(`T20HaydGMTools.${chave}`);

/** Nome que o Mestre vê para cada função: o mesmo das configurações. */
function rotuloDaFuncao(funcao) {
  if (funcao.rotulo) return t(funcao.rotulo);
  const registro = game.settings.settings.get(`${MODULE_ID}.${funcao.chave}`);
  return game.i18n.localize(registro?.name ?? funcao.chave);
}

export async function aplicarPreset(teto) {
  for (const funcao of ligadasNoPreset(teto)) {
    try {
      if (funcao.campo) {
        const atual = game.settings.get(MODULE_ID, funcao.chave) ?? {};
        await game.settings.set(MODULE_ID, funcao.chave, { ...atual, [funcao.campo]: funcao.ligada });
      } else {
        await game.settings.set(MODULE_ID, funcao.chave, funcao.ligada);
      }
    } catch (err) {
      console.error(`${MODULE_ID} | Falha ao aplicar o preset em "${funcao.chave}"`, err);
    }
  }
}

function listaDeFuncoes() {
  const porNivel = { alto: [], medio: [], baixo: [] };
  for (const funcao of FUNCOES) porNivel[funcao.nivel]?.push(rotuloDaFuncao(funcao));
  return ['baixo', 'medio', 'alto'].map((nivel) => `<li>
      <span class="t20g-impacto t20g-impacto-${nivel}">${esc(t(IMPACTO_CHAVES[nivel]))}</span>
      ${esc(porNivel[nivel].join(', '))}
      <small>${esc(t(`${IMPACTO_CHAVES[nivel]}Dica`))}</small>
    </li>`).join('');
}

async function perguntar() {
  const escolha = await foundry.applications.api.DialogV2.wait({
    window: { title: t('PresetTitulo'), icon: 'fa-solid fa-sliders' },
    position: { width: 620 },
    content: `<div class="t20g-preset">
      <p>${esc(t('PresetIntro'))}</p>
      <ul class="t20g-preset-lista">${listaDeFuncoes()}</ul>
    </div>`,
    rejectClose: false,
    buttons: [
      { action: 'alto', label: t('PresetTudo'), icon: 'fa-solid fa-gauge-high', default: true },
      { action: 'medio', label: t('PresetMedio'), icon: 'fa-solid fa-gauge' },
      { action: 'baixo', label: t('PresetBaixo'), icon: 'fa-solid fa-gauge-simple-low' },
      { action: 'nada', label: t('PresetDepois'), icon: 'fa-solid fa-xmark' }
    ]
  });
  return typeof escolha === 'string' ? escolha : 'nada';
}

Hooks.once('init', () => {
  // Controle interno: o Mestre já respondeu à janela de presets?
  game.settings.register(MODULE_ID, SETTING, {
    scope: 'world', config: false, type: Boolean, default: false
  });
});

Hooks.once('ready', async () => {
  if (!game.user.isGM || game.user !== game.users.activeGM) return;
  if (game.settings.get(MODULE_ID, SETTING)) return;

  const escolha = await perguntar();
  // Marca antes de aplicar: se algum `set` falhar, a janela não volta a
  // aparecer toda sessão pedindo a mesma resposta.
  await game.settings.set(MODULE_ID, SETTING, true);
  if (escolha === 'nada') return;

  await aplicarPreset(escolha);
  ui.notifications.info(game.i18n.format('T20HaydGMTools.PresetAplicado', {
    nivel: t(IMPACTO_CHAVES[escolha])
  }));
});
