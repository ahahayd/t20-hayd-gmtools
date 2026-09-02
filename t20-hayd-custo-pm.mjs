/**
 * T20 Hayd GMTools | Correção do "Custo de Mana Total"
 *
 * Bug do sistema Tormenta20 (visto na 1.5.015): na janela de uso, o "Custo de
 * Mana Total" soma só os aprimoramentos e ignora o custo do próprio item. Uma
 * magia de 2º círculo (3 PM) com um aprimoramento de 4 PM mostra 4, não 7.
 *
 * A raiz é um caminho errado em `AbilityUseDialog.create`: ele lê
 * `item.system.custo`, mas o custo mora em `item.system.ativacao.custo`. Como
 * `system.custo` não existe, o custo base entra como 0 — tanto no valor
 * inicial quanto no `data-initial-cost` que o recálculo ao vivo consulta.
 * Some ainda um segundo efeito: sem nenhum aprimoramento com custo, o sistema
 * escreve 0 no campo, apagando o custo base.
 *
 * Vale para TODO item com custo em PM — magia, poder, arma, equipamento e
 * consumível —, não só magias.
 *
 * Escopo: isto corrige o que é EXIBIDO, e só. O desconto automático de PM do
 * sistema JÁ ESTÁ CORRETO e não passa por aqui: ele lê `ativacao.custo` do
 * item, mas `applyOnUseEffects` soma os aprimoramentos aplicados nesse mesmo
 * campo antes (`id.ativacao.custo += ouEff.cost`). Ler só o trecho do consumo
 * dá a impressão de que ele ignora os aprimoramentos — não ignora, e mexer
 * nisso descontaria PM duas vezes.
 */

import { custoTotalDePM } from './scripts/custo-pm.mjs';

const MODULE_ID = 't20-hayd-gmtools';
const SETTING = 'custoPmTotal';

/** Lê as parcelas de aprimoramento da janela, no formato de `custoTotalDePM`. */
function parcelasDaJanela(form) {
  const parcelas = [];
  for (const entrada of form.querySelectorAll('.aprimoramentos-list li input:not([type=hidden])')) {
    const oculto = entrada.closest('div')?.querySelector('input[type=hidden]');
    if (!oculto) continue;

    parcelas.push(entrada.type === 'checkbox'
      ? { custo: oculto.value, quantidade: entrada.checked ? 1 : 0 }
      : { custo: oculto.value, quantidade: entrada.value });
  }
  return parcelas;
}

/** Custo do item na janela, pelo caminho que o sistema deveria ter usado. */
function custoBase(item) {
  return Number(item?.system?.ativacao?.custo) || 0;
}

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, SETTING, {
    name: 'T20HaydGMTools.SettingCustoPmName',
    hint: 'T20HaydGMTools.SettingCustoPmHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
  });
});

Hooks.on('renderAbilityUseDialog', (app, html) => {
  if (!game.settings.get(MODULE_ID, SETTING)) return;

  const raiz = html?.[0] ?? html;
  const form = raiz?.querySelector?.('#ability-use-form') ?? raiz;
  const campo = form?.querySelector?.('.total-cost .cost');
  if (!campo) return;

  const base = custoBase(app?.item);

  // O recálculo do sistema lê daqui; corrigindo o dado, o caminho dele também
  // passa a somar o custo base.
  campo.dataset.initialCost = String(base);

  const atualizar = () => {
    campo.value = custoTotalDePM(
      base,
      parcelasDaJanela(form),
      form.querySelector('input[name=ajustecusto]')?.value
    );
  };

  // setTimeout para rodar DEPOIS do recálculo do sistema: os botões +/- dele
  // escrevem no mesmo campo, e sem isso o valor certo seria sobrescrito.
  const depois = () => setTimeout(atualizar, 0);
  for (const evento of ['change', 'input', 'click']) form.addEventListener(evento, depois);

  atualizar();
});
