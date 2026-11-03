/**
 * Modelo de Aura — dano em área.
 *
 * Só o Mestre executa: rola o dano uma vez (todos na área levam o mesmo
 * resultado, como num efeito de área), rola a resistência de cada alvo e
 * publica no chat quem estava no alcance e quanto sofre. O dano não é
 * descontado sozinho: a mesa aplica pelo cartão, como em qualquer rolagem.
 */
import { MODULE_ID } from '../runtime.mjs';
import { TESTES, efeitoAfeta, danoFinal } from './modelo.mjs';
import { tokensNaAura, nomeDaDisposicao } from './alcance.mjs';
import { raioDaAura } from './estado.mjs';
import { rolarTeste } from './resistencia.mjs';

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));
const t = (chave, dados) => (dados
  ? game.i18n.format(`T20HaydGMTools.${chave}`, dados)
  : game.i18n.localize(`T20HaydGMTools.${chave}`));

function paraQuem(fonte) {
  // Aura de criatura do Mestre não precisa aparecer para a mesa toda.
  const ehDoMestre = ['npc', 'hazard', 'simple'].includes(fonte?.type);
  return ehDoMestre ? game.users.filter((u) => u.isGM).map((u) => u.id) : [];
}

/** Token da fonte na cena viva (mesma regra de efeitos.mjs). */
function tokenDaFonte(fonte, estado) {
  const porId = estado?.token ? canvas?.tokens?.get(estado.token) : null;
  if (porId?.actor) return porId;
  return canvas?.tokens?.placeables?.find((tk) => tk.actor?.uuid === fonte?.uuid) ?? null;
}

/**
 * Causa os danos da aura que valem neste momento.
 *
 * @param {'ativar'|'turnoFonte'|'turnoAlvo'} momento
 * @param {string|null} tokenId  só este alvo (o dono do turno, em `turnoAlvo`)
 */
export async function causarDanos(fonte, { item, def, estado }, { momento, tokenId = null }) {
  if (!def.aura.danos) return;
  const tokenFonte = tokenDaFonte(fonte, estado);
  if (!tokenFonte) return;
  const vivo = tokenFonte.actor ?? fonte;

  const danos = def.aura.danos(vivo).filter((d) => d.quando === momento);
  if (!danos.length) return;
  const naArea = tokensNaAura(tokenFonte, def.aura, raioDaAura(vivo, def));

  for (const dano of danos) {
    const alvos = naArea.filter((token) => {
      if (!token.actor) return false;
      if (tokenId && token.id !== tokenId) return false;
      const ehFonte = token.id === tokenFonte.id;
      return efeitoAfeta(dano.alvos, { disposicao: nomeDaDisposicao(token), ehFonte });
    });
    if (!alvos.length) continue;
    await rolarDano(fonte, vivo, item, dano, alvos, tokenFonte.id);
  }
}

/**
 * Fórmula com o tipo do dano nos dados, do jeito que o T20 lê ("2d6[fogo]").
 * Fórmula que já traz tipo entre colchetes é respeitada.
 */
function formulaComTipo(formula, tipo) {
  if (!tipo || /\[/.test(formula)) return formula;
  return `(${formula})[${tipo}]`;
}

/**
 * Rola como dano do sistema: o cartão é o de dano do T20, com os botões de
 * aplicar nos tokens. O texto acima lista quem estava no alcance e quanto
 * cada um sofre depois da resistência.
 */
async function rolarDano(fonte, vivo, item, dano, alvos, tokenFonteId) {
  let roll;
  try {
    roll = await new Roll(
      formulaComTipo(dano.formula, dano.tipo), vivo.getRollData?.() ?? {}, { type: 'damage' }
    ).evaluate();
  } catch (err) {
    console.error(`${MODULE_ID} | Fórmula de dano inválida em ${item.name}: ${dano.formula}`, err);
    ui.notifications.error(t('AuraDanoFormulaInvalida', { nome: item.name, formula: dano.formula }));
    return;
  }

  const res = dano.resistencia;
  const teste = TESTES.find((x) => x.id === res.teste)?.rotulo ?? res.teste;
  const linhas = [];
  for (const token of alvos) {
    // A fonte nunca testa contra a própria aura
    const testa = res.ativa && token.id !== tokenFonteId;
    const passou = testa ? await rolarTeste(token, res, item) : null;
    const final = danoFinal(roll.total, testa ? res : null, passou);
    const veredito = testa
      ? (passou === null ? t('AuraDanoSemTeste') : t(passou ? 'ResistSucesso' : 'ResistFracasso'))
      : '';
    linhas.push(`<li><b>${esc(token.name)}</b>: ${final}${veredito ? ` <span class="notes">(${veredito})</span>` : ''}</li>`);
  }

  const flavor = `<div class="t20g-aura-card">
      <p><b><i class="fa-solid fa-burst"></i> ${esc(dano.nome || item.name)}</b></p>
      ${res.ativa ? `<p class="notes">${t('AuraDanoResistencia', {
        teste, cd: res.cd,
        sucesso: t(res.sucesso === 'anula' ? 'AuraDanoAnula' : 'AuraDanoMetade')
      })}</p>` : ''}
      <ul class="t20g-aura-dano-lista">${linhas.join('')}</ul>
    </div>`;

  // Aura de criatura do Mestre: rolagem privada, como as demais mensagens dela.
  const privada = paraQuem(fonte).length > 0;
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: fonte }),
    flavor
  }, { rollMode: privada ? CONST.DICE_ROLL_MODES.PRIVATE : game.settings.get('core', 'rollMode') });
}
