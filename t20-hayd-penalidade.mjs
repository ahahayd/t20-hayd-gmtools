/**
 * T20 Hayd GMTools | Penalidade de armadura na janela de uso de perícias
 *
 * Primeira linha da janela de toda perícia, quando o ator tem penalidade de
 * armadura. Vem marcada nas perícias que o sistema já penaliza (Acrobacia,
 * Furtividade, Ladinagem…) e desmarcada nas outras, para os casos em que a
 * regra pede só numa situação (Atletismo para nadar, por exemplo).
 *
 * O sistema já soma `@pda` no valor dessas perícias; a linha só corrige a
 * rolagem quando a escolha difere do padrão. Uso sem janela segue o sistema.
 */

import { garantirLista } from './t20-hayd-manobra.mjs';

const MODULE_ID = 't20-hayd-gmtools';
const SETTING = 'penalidadeArmaduraUso';
const CAMPO = 't20gPda';

const t = (chave) => game.i18n.localize(`T20HaydGMTools.${chave}`);
const esc = (valor) => foundry.utils.escapeHTML(String(valor ?? ''));

function ativo() {
  try { return !!game.settings.get(MODULE_ID, SETTING); }
  catch { return false; }
}

/** Penalidade do ator (número negativo) e se a perícia já a aplica. */
function penalidadeDa(item) {
  if (item?.type !== 'pericia' || !item.actor) return null;
  const pda = Number(item.actor.system?.attributes?.defesa?.pda) || 0;
  if (!pda) return null;
  return { pda, padrao: !!item.actor.system?.pericias?.[item.id]?.pda };
}

Hooks.once('setup', () => {
  const Dialogo = game.tormenta20?.applications?.AbilityUseDialog;
  if (!Dialogo || Dialogo._t20gPenalidade) return;
  const original = Dialogo.create;
  Dialogo.create = async function (item, ...resto) {
    const configuracao = await original.call(this, item, ...resto);
    const info = ativo() ? penalidadeDa(item) : null;
    const escolha = configuracao?.[CAMPO];
    if (info && escolha !== undefined && Array.isArray(item.parts)) {
      const marcada = escolha === '1';
      // As fontes da rolagem detalham a perícia com esta escolha.
      item._t20gPda = marcada;
      // O valor da perícia já traz a penalidade quando ela é padrão. Ajusta o
      // próprio valor (parts[1]) para a fórmula não ganhar um "+5" solto.
      const ajuste = info.padrao && !marcada ? -info.pda : !info.padrao && marcada ? info.pda : 0;
      const valor = Number(item.parts[1]);
      if (ajuste && Number.isFinite(valor)) item.parts[1] = String(valor + ajuste);
      else if (ajuste) item.parts.push(String(ajuste));
    }
    return configuracao;
  };
  Dialogo._t20gPenalidade = true;
});

Hooks.on('renderAbilityUseDialog', (app, html) => {
  if (!ativo()) return;
  const info = penalidadeDa(app?.item);
  const raiz = html?.[0] ?? html;
  const form = raiz?.querySelector?.('#ability-use-form') ?? raiz;
  if (!info || !form?.querySelector || form.querySelector('.t20g-penalidade')) return;

  const lista = garantirLista(form, false);
  if (!lista) return;
  const linha = document.createElement('li');
  linha.className = 'item flexrow t20g-penalidade';
  linha.innerHTML = `<div class="item-cost flexrow"><input type="checkbox" ${info.padrao ? 'checked' : ''}> -</div>
    <h4 class="item-name" style="flex: 2">${esc(t('PenalidadeArmadura'))} (${info.pda})</h4>
    <input type="hidden" name="${CAMPO}" value="${info.padrao ? '1' : '0'}">`;
  const caixa = linha.querySelector('input[type=checkbox]');
  caixa.addEventListener('change', () => {
    linha.querySelector(`input[name=${CAMPO}]`).value = caixa.checked ? '1' : '0';
  });
  lista.querySelector('.items-header')?.after(linha);
});

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, SETTING, {
    name: 'T20HaydGMTools.SettingPenalidadeName',
    hint: 'T20HaydGMTools.SettingPenalidadeHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });
});
