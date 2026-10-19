/**
 * T20 Hayd GMTools | Fontes da rolagem
 *
 * Diz de onde veio cada número de uma rolagem: "1d20 + 8 + 6 + 2" vira
 * "d20 · Perícia Luta (Metade do nível 2 + Força 3 + Treino 3) · Ataque
 * Poderoso · campo Bônus da janela".
 *
 * Nada é recalculado na hora de mostrar. No momento da rolagem, as parcelas
 * que o sistema junta (as mesmas, na mesma ordem) recebem um nome, e cada
 * nome fica preso aos termos que a parcela gerou. Essa lista vai dentro das
 * opções da própria Roll (`options.t20gFontes`), que o Foundry salva junto
 * com a mensagem — a tabela sobrevive a recarregar a página.
 *
 * Quem lê as fontes:
 * - o menu de clique direito do chat ("Fontes da rolagem"), registrado no
 *   t20-hayd-gmtools.mjs junto das outras opções do módulo;
 * - a prévia da rolagem na janela de uso, que põe um tooltip em cada número.
 *
 * Se a conta de termos não fechar (outro módulo mexeu na fórmula, versão
 * nova do sistema…), a rolagem fica sem fontes e a tabela mostra os termos
 * como "sem origem registrada", em vez de apontar a fonte errada.
 */

import {
  distribuir, fontePorTermo, linhasDaTabela, reindexar, rotularExtras, termosComSinal, textoDaFonte,
  zerosRemoviveis
} from './scripts/fontes.mjs';
import { ehV14, modoDaMudanca } from './scripts/versao.mjs';

const MODULE_ID = 't20-hayd-gmtools';
const SETTING = 'fontesRolagem';
const SETTING_ZEROS = 'limparZeros';
const OPCAO = 't20gFontes';
const ATRIBUTOS = ['for', 'des', 'con', 'int', 'sab', 'car'];

const esc = (valor) => foundry.utils.escapeHTML(String(valor ?? ''));
const t = (chave, dados) => (dados
  ? game.i18n.format(`T20HaydGMTools.${chave}`, dados)
  : game.i18n.localize(`T20HaydGMTools.${chave}`));

export function fontesAtivas() {
  try { return !!game.settings.get(MODULE_ID, SETTING); }
  catch { return false; }
}

/* ─── Termos e valores ────────────────────────────────────────────────────── */

function termoSimples(termo) {
  const T = foundry.dice.terms;
  if (termo instanceof T.OperatorTerm) return { operador: termo.operator };
  const dado = termo instanceof T.DiceTerm;
  return {
    expressao: termo.expression ?? termo.formula,
    total: termo.total,
    resultados: dado
      ? termo.results.filter((r) => r.active !== false && !r.discarded).map((r) => r.result)
      : null,
    dado: dado || !!termo.dice?.length,
    numerico: termo instanceof T.NumericTerm
  };
}

const termosDa = (roll) => termosComSinal((roll?.terms ?? []).map(termoSimples));

const limpar = (formula) => String(formula ?? '').replace(/^\+|\s/g, '');

/** Quantos termos (sem contar operadores) uma parcela vira dentro da Roll. */
function contarTermos(formula, dados) {
  const limpa = limpar(formula);
  if (!limpa) return 0;
  try {
    const resolvida = Roll.replaceFormulaData(limpa, dados ?? {}, { missing: '0' });
    return Roll.parse(resolvida, {}).filter((tm) => !(tm instanceof foundry.dice.terms.OperatorTerm)).length;
  } catch {
    return Number.NaN;
  }
}

/** Valor de uma parcela sem dados ("@for" → 3); null se tiver dado. */
function valorConstante(formula, dados) {
  try {
    const resolvida = Roll.replaceFormulaData(limpar(formula), dados ?? {}, { missing: '0' });
    const valor = Roll.safeEval(resolvida || '0');
    return Number.isFinite(valor) ? valor : null;
  } catch {
    return null;
  }
}

const rotuloAtributo = (chave) => game.i18n.localize(CONFIG.T20?.atributos?.[chave] ?? chave);

/**
 * Valores de uma lista de modificadores (ex.: `modificadores.ataque.geral`)
 * com o nome do efeito que pôs cada um, casados pelo valor — a ordem da
 * lista e a de `modifiedFields` nem sempre coincidem.
 */
function casar(ator, caminho, valores) {
  const livres = [...(ator?.modifiedFields?.[caminho] ?? [])];
  return (valores ?? []).map((valor) => {
    const i = livres.findIndex((m) => limpar(m.value) === limpar(valor));
    const [achado] = i >= 0 ? livres.splice(i, 1) : [];
    return { fonte: achado?.label ?? t('FonteEfeito'), formula: valor, semOrigem: !achado };
  });
}

/* ─── Perícia: as contas da ficha ─────────────────────────────────────────── */

/**
 * Mesma soma do `prepareSkill` do sistema, com nome em cada pedaço. O
 * resultado vira um número só na rolagem; estes são os detalhes dele.
 */
function detalharPericia(ator, chave, atributo) {
  const sistema = ator?.system;
  const pericia = sistema?.pericias?.[chave];
  if (!pericia) return [];
  const dados = ator.getRollData();
  const atr = atributo || pericia.atributo;
  const lista = [];
  const somar = (fonte, formula) => {
    const valor = valorConstante(formula, dados);
    if (valor) lista.push({ fonte, valor });
  };
  const somarTodos = (caminho, valores) => {
    for (const d of casar(ator, caminho, (valores ?? []).filter(Boolean))) somar(d.fonte, d.formula);
  };

  somar(t('FonteMeioNivel'), '@meionivel');
  somar(rotuloAtributo(atr), `@${atr}`);
  if (pericia.treinado) somar(t('FonteTreino'), '@treino');
  somarTodos(`system.pericias.${chave}.bonus`, pericia.bonus);
  if (pericia.pda && dados.pda) somar(t('FontePenalidade'), '@pda');
  if (pericia.size && dados.tamanho) somar(t('FonteTamanho'), '@tamanho');
  if (pericia.outros) somar(t('FonteOutros'), pericia.outros);
  if (pericia.condi) somar(t('FonteCondicoes'), pericia.condi);

  const bonus = foundry.utils.getProperty(sistema, 'modificadores.pericias') || {};
  const tem = (lista) => lista?.filter(Boolean).length;
  const base = 'system.modificadores.pericias';
  if (tem(bonus.geral)) somarTodos(`${base}.geral`, bonus.geral);
  if (Object.keys(CONFIG.T20?.resistencias ?? {}).includes(chave) && tem(bonus.resistencia)) {
    somarTodos(`${base}.resistencia`, bonus.resistencia);
  } else if (!['luta', 'pont'].includes(chave) && tem(bonus.semataque)) {
    somarTodos(`${base}.semataque`, bonus.semataque);
  } else if (['luta', 'pont'].includes(chave) && tem(bonus.ataque)) {
    somarTodos(`${base}.ataque`, bonus.ataque);
  }
  if (tem(bonus.atr?.[pericia.atributo])) {
    somarTodos(`${base}.atr.${pericia.atributo}`, bonus.atr[pericia.atributo]);
  }
  return lista;
}

const rotuloPericia = (ator, chave) => {
  const pericia = ator?.system?.pericias?.[chave];
  const nome = pericia?.label || CONFIG.T20?.pericias?.[chave]?.label || chave;
  return t('FontePericia', { nome: game.i18n.localize(nome) });
};

/* ─── Efeitos de uso aplicados na janela ──────────────────────────────────── */

function multiplicar(valor, vezes) {
  if (vezes === 1) return valor;
  const numero = Number(valor);
  if (Number.isFinite(numero) && String(valor).trim() !== '') return numero * vezes;
  const dado = String(valor).match(/^(\d+)d(.+)$/i);
  return dado ? `${dado[1] * vezes}d${dado[2]}` : valor;
}

/**
 * Os valores que cada aprimoramento marcado na janela pode ter empurrado
 * para a rolagem. Só serve para dar nome às parcelas extras (rotularExtras).
 */
function candidatosDeUso(item, ator, opcoes) {
  let aprs = foundry.utils.expandObject(opcoes ?? {}).aprs ?? {};
  const vistos = new Map();
  const juntar = (lista) => { for (const ef of lista ?? []) if (ef?.id && !vistos.has(ef.id)) vistos.set(ef.id, ef); };
  juntar(item?.validOnUseEffects);
  juntar(item?.applicableOnUseEffects);
  juntar(item?.effects);
  try { juntar([...(ator?.allApplicableEffects?.() ?? [])]); } catch { /* sem efeitos */ }
  juntar(ator?.effects);

  // Sem janela (Shift ou configuração do sistema), entram os aprimoramentos
  // que o sistema aplica sozinho.
  if (foundry.utils.isEmpty(aprs)) {
    aprs = {};
    for (const ef of vistos.values()) {
      const automatico = ehV14()
        ? ef.system?.onuse && ef.system?.abilityUse?.automatic
        : ef.getFlag?.('tormenta20', 'onuse') && !ef.disabled;
      if (automatico) aprs[ef.id] = { aplica: 1 };
    }
  }
  const candidatos = [];
  const aumentos = [];
  for (const [id, escolha] of Object.entries(aprs)) {
    const vezes = Number(escolha?.aplica) || 0;
    const efeito = vistos.get(id);
    if (!vezes || !efeito) continue;
    const nome = vezes > 1 ? `${efeito.name} ×${vezes}` : efeito.name;
    const mudancas = efeito.system?.changes ?? efeito.changes ?? [];
    for (const mudanca of mudancas) {
      const modo = modoDaMudanca(mudanca);
      // "Personalizado" com dados (aprimoramento "+1d8 por PM"): o sistema
      // não cria parcela nova, soma os dados na parcela do mesmo poder.
      if (modo === 0 && /^\d+d\d+$/i.test(String(mudanca.value).trim())) {
        aumentos.push({ nome, origem: efeito.sourceName, dados: parseInt(mudanca.value, 10) * vezes });
        continue;
      }
      // Só "somar" vira parcela nova; as outras mudanças não têm o que casar.
      if (modo !== 2) continue;
      candidatos.push({
        fonte: nome,
        origem: efeito.sourceName,
        valor: multiplicar(valorDaMudanca(mudanca.value, efeito, ator), vezes)
      });
    }
  }
  for (const aumento of aumentos) {
    const alvo = candidatos.find((c) => c.origem === aumento.origem && /^\d+d/i.test(String(c.valor)));
    if (!alvo) continue;
    alvo.valor = String(alvo.valor).replace(/^\d+/, (n) => Number(n) + aumento.dados);
    alvo.fonte = `${alvo.fonte} + ${aumento.nome}`;
  }
  return candidatos;
}

/**
 * Valor que a mudança realmente empurra. "roll" (Ataque Furtivo e afins) é
 * a primeira parcela do dano do próprio poder que originou o efeito.
 */
function valorDaMudanca(valor, efeito, ator) {
  if (valor !== 'roll') return valor;
  const id = String(efeito.origin ?? '').match(/Item\.([^.]+)/)?.[1];
  const poder = (id && ator?.items?.get(id)) || (efeito.parent?.documentName === 'Item' ? efeito.parent : null);
  return poder?.system?.rolls?.find((r) => r.type === 'dano')?.parts?.[0]?.[0] ?? valor;
}

const opcoesDeRotulo = (bonusJanela) => ({
  bonusJanela: ['', '0', undefined, null].includes(bonusJanela) ? undefined : bonusJanela,
  rotuloJanela: t('FonteJanela'),
  rotuloEfeito: t('FonteEfeitoDeUso')
});

/* ─── Registro na Roll ────────────────────────────────────────────────────── */

/**
 * Prende as parcelas aos termos da rolagem feita. `parcelas`: [{ fonte,
 * formula, detalhes? }] na ordem em que o sistema as juntou.
 */
function registrar(roll, parcelas, dados) {
  prender(roll, parcelas, dados);
  limparZeros(roll);
  return roll?.options?.[OPCAO] ?? null;
}

function prender(roll, parcelas, dados) {
  if (!roll?.terms) return null;
  const contadas = parcelas.map((p) => ({ ...p, termos: contarTermos(p.formula, dados) }));
  if (contadas.some((p) => !Number.isFinite(p.termos))) return null;
  const faixas = distribuir(contadas, termosDa(roll).length);
  if (!faixas) return null;
  roll.options[OPCAO] = faixas.map(({ fonte, ini, fim, detalhes, semOrigem }) => ({
    fonte, ini, fim, ...(detalhes?.length ? { detalhes } : {}), ...(semOrigem ? { semOrigem } : {})
  }));
  return roll.options[OPCAO];
}

/**
 * Tira da Roll os "+ 0" que o sistema deixa (ver `zerosRemoviveis`). Muda
 * só a fórmula mostrada: o total já foi calculado e não muda.
 */
export function limparZeros(roll) {
  if (!roll?.terms || !roll._evaluated) return;
  try { if (!game.settings.get(MODULE_ID, SETTING_ZEROS)) return; } catch { return; }
  const simples = roll.terms.map(termoSimples);
  const apagar = new Set(zerosRemoviveis(simples));
  if (!apagar.size) return;
  // Posições dos termos apagados na contagem sem operadores.
  const apagados = [];
  let n = 0;
  simples.forEach((termo, i) => {
    if (termo.operador) return;
    if (apagar.has(i)) apagados.push(n);
    n += 1;
  });
  roll.terms = roll.terms.filter((_, i) => !apagar.has(i));
  roll.resetFormula();
  if (roll.options[OPCAO]) roll.options[OPCAO] = reindexar(roll.options[OPCAO], apagados);
}

const parcelaDoDado = (formula) => ({
  fonte: /d20/i.test(String(formula)) ? t('FonteDado') : t('FonteEscolhido', { valor: formula }),
  formula
});

/** Teste de perícia: ["1d20", valor da perícia, …extras da janela] + @bonus. */
export function registrarPericia(roll, itemData, ator, opcoes) {
  if (!fontesAtivas()) { limparZeros(roll); return null; }
  const parts = itemData?.parts ?? [];
  const chave = itemData?.id;
  const parcelas = [
    parcelaDoDado(parts[0]),
    { fonte: rotuloPericia(ator, chave), formula: parts[1], detalhes: detalharPericia(ator, chave) },
    ...rotularExtras(parts.slice(2), candidatosDeUso(itemData, ator, opcoes), opcoesDeRotulo(opcoes?.bonus)),
    { fonte: t('FonteBonus'), formula: '@bonus' }
  ];
  return registrar(roll, parcelas, ator.getRollData());
}

/** Teste de atributo: ["1d20", "@for", "@atributo"?, "@fisicos"?, …]. */
function registrarAtributo(roll, itemData, ator, opcoes) {
  if (!fontesAtivas()) { limparZeros(roll); return null; }
  const parts = itemData?.parts ?? [];
  const caminho = (grupo) => `system.modificadores.atributos.${grupo}`;
  const bonus = foundry.utils.getProperty(ator.system, 'modificadores.atributos') || {};
  const dados = ator.getRollData();
  const valorDe = (grupo, chave) => casar(ator, caminho(grupo), (bonus[grupo] ?? []).filter(Boolean))
    .map((d) => ({ fonte: d.fonte, valor: valorConstante(d.formula, dados) }));
  const parcelas = parts.map((formula, i) => {
    if (i === 0) return parcelaDoDado(formula);
    const ref = String(formula).match(/^@(\w+)$/)?.[1];
    if (ATRIBUTOS.includes(ref)) return { fonte: rotuloAtributo(ref), formula };
    if (['atributo', 'fisicos', 'mentais'].includes(ref)) {
      const grupo = ref === 'atributo' ? 'geral' : ref;
      return { fonte: t('FonteBonusAtributos'), formula, detalhes: valorDe(grupo) };
    }
    return null;
  });
  const extras = parts.filter((_, i) => !parcelas[i]);
  const rotulos = rotularExtras(extras, candidatosDeUso(itemData, ator, opcoes), opcoesDeRotulo(opcoes?.bonus));
  const lista = parcelas.map((p) => p ?? rotulos.shift());
  lista.push({ fonte: t('FonteBonus'), formula: '@bonus' });
  return registrar(roll, lista, dados);
}

/** Atributo que a arma usou no ataque, deduzido do valor que o sistema pôs. */
function atributoDoAtaque(ator, chave, valorUsado) {
  const pericia = ator?.system?.pericias?.[chave];
  const atrs = ator?.system?.atributos ?? {};
  if (!pericia || pericia.value === valorUsado) return pericia?.atributo;
  const base = pericia.value - (atrs[pericia.atributo]?.value ?? 0);
  return ['des', 'for', ...ATRIBUTOS].find((a) => base + (atrs[a]?.value ?? 0) === valorUsado) ?? pericia.atributo;
}

/**
 * A rolagem como está no item, antes dos aprimoramentos. O `roll()` do
 * sistema usa um clone sem id (`clone({ keepId: true })` passa keepId como
 * dado), mas o `_source` do clone guarda as parcelas originais.
 */
const rollOriginal = (item, chave) =>
  (item._source?.system?.rolls ?? item.actor?.items?.get(item.id)?._source?.system?.rolls)
    ?.find((r) => r.key === chave);

/** Ataque: [d20, @skill, …partes do item, …ataque.geral, …cac|ad, @ammo] + @bonus. */
function parcelasDoAtaque(item, rolagem, opcoes) {
  const ator = item.actor;
  const alvo = item.getAttackToHit?.();
  if (!alvo) return null;
  const { parts, rollData } = alvo;
  const chave = rolagem.parts[1]?.[0];
  const lista = [parcelaDoDado(rolagem.parts[0]?.[0])];

  lista.push(chave
    ? {
      fonte: rotuloPericia(ator, chave),
      formula: parts[0],
      detalhes: detalharPericia(ator, chave, atributoDoAtaque(ator, chave, rollData.skill))
    }
    : { fonte: t('FonteItem', { nome: item.name }), formula: parts[0] });

  const extras = rolagem.parts.slice(2).map((p) => p?.[0] ?? p);
  const doItem = Math.max(0, (rollOriginal(item, rolagem.key)?.parts?.length ?? 2) - 2);
  for (const formula of extras.slice(0, doItem)) lista.push({ fonte: t('FonteItem', { nome: item.name }), formula });
  lista.push(...rotularExtras(extras.slice(doItem), candidatosDeUso(item, ator, opcoes), opcoesDeRotulo(opcoes?.bonus)));

  const bonus = ator.system.modificadores?.ataque || {};
  const caminho = 'system.modificadores.ataque';
  if (bonus.geral) lista.push(...casar(ator, `${caminho}.geral`, bonus.geral));
  if (bonus.cac && chave !== 'pont') lista.push(...casar(ator, `${caminho}.cac`, bonus.cac));
  if (bonus.ad && chave === 'pont') lista.push(...casar(ator, `${caminho}.ad`, bonus.ad));
  if (parts.at(-1) === '@ammo') {
    const municao = ator.items.get(item.system.consume?.target);
    lista.push({ fonte: t('FonteMunicao', { nome: municao?.name ?? '' }), formula: '@ammo' });
  }
  lista.push({ fonte: t('FonteBonus'), formula: '@bonus' });
  return { lista, dados: rollData };
}

/** Atributo que o dano "padrao" vira — mesma regra do rollDamage. */
function atributoPadrao(item) {
  const flags = item.actor.flags.tormenta20 || {};
  const { for: forca, des } = item.actor.system.atributos;
  const acuidade = (game.settings.get('tormenta20', 'lightFinesseWeapons') || flags?.acuidade) && des.value > forca.value;
  const { empunhadura, proposito } = item.system;
  if (proposito === 'disparo') return flags?.estiloDisparo ? '@des' : '';
  if (proposito === 'arremesso') return acuidade ? '@des' : '@for';
  return acuidade && empunhadura === 'leve' ? '@des' : '@for';
}

/** Dano: partes do item (com "padrao" resolvido) + bônus de dano/cura do ator + @bonus. */
function parcelasDoDano(item, rolagem, opcoes, critico, dados) {
  const ator = item.actor;
  const sistema = ator.system;
  const pericia = item.type === 'arma' ? item.system.rolls.find((i) => i.type === 'ataque')?.parts[1][0] : undefined;
  const recuperacao = ['curatpv', 'curapm', 'curatpm'];
  const doItem = rollOriginal(item, rolagem.key)?.parts?.length ?? 1;
  const lista = [];
  const extras = [];

  rolagem.parts.forEach(([dano, tipo], i) => {
    let formula = dano;
    if (dano === 'padrao' && ![...recuperacao, 'perda'].includes(tipo)) formula = atributoPadrao(item);
    // Sem crítico, o sistema tira da rolagem os termos "só no crítico".
    if (tipo === 'danoCritico' && !critico) formula = '';
    const ref = String(formula).match(/^@(\w+)$/)?.[1];
    if (i >= doItem) {
      extras.push({ i, formula });
      lista.push(null);
    } else if (i === 0) {
      lista.push({ fonte: t('FonteDanoBase', { nome: item.name }), formula });
    } else if (ATRIBUTOS.includes(ref)) {
      lista.push({ fonte: rotuloAtributo(ref), formula });
    } else {
      lista.push({ fonte: t('FonteItem', { nome: item.name }), formula });
    }
  });
  // Partes que a Marca da Presa / Primeiro Sangue reescreveram antes de rolar
  // casam pela fórmula original (a do efeito) e ganham o motivo no rótulo.
  const ajustadas = item._t20gPartesAjustadas;
  const ajuste = (i) => ajustadas?.get(rolagem.parts[i]);
  const rotulos = rotularExtras(extras.map((e) => ajuste(e.i)?.original ?? e.formula),
    candidatosDeUso(item, ator, opcoes), opcoesDeRotulo(opcoes?.bonusdano));
  extras.forEach((e, n) => { lista[e.i] = { ...rotulos[n], formula: e.formula }; });
  lista.forEach((parcela, i) => {
    const { nota, fonte } = ajuste(i) ?? {};
    if (parcela && nota) lista[i] = { ...parcela, fonte: `${fonte ?? parcela.fonte} (${nota})`, semOrigem: false };
  });

  const parts = rolagem.parts;
  const cura = parts.some((p) => p[1] === 'curapv');
  const perda = parts.some((p) => p[1] === 'perda');
  const somente = parts.some((p) => recuperacao.includes(p[1]));
  const magia = item.type === 'magia';
  const alquimico = item.type === 'consumivel' && item.system.tipo === 'alchemy';
  const tem = (l) => l?.filter(Boolean).length;
  const grupo = (fonte, formula, caminho, valores) => lista.push({
    fonte, formula,
    detalhes: casar(ator, caminho, (valores ?? []).filter(Boolean))
      .map((d) => ({ fonte: d.fonte, valor: valorConstante(d.formula, dados) }))
  });
  const c = foundry.utils.getProperty(sistema, 'modificadores.cura') || {};
  const d = foundry.utils.getProperty(sistema, 'modificadores.dano') || {};
  const base = 'system.modificadores';
  // A ordem e as condições repetem as do rollDamage (v13 e v14).
  if (somente && ehV14()) {
    // v14: recuperação de PV/PM temporário não recebe bônus.
  } else if (cura) {
    if (tem(c.geral)) grupo(t('FonteBonusCura'), '@curaGeral', `${base}.cura.geral`, c.geral);
    if (magia && tem(c.mag)) grupo(t('FonteBonusCura'), '@curaMagica', `${base}.cura.mag`, c.mag);
    else if (alquimico && tem(c.alq)) grupo(t('FonteBonusCura'), ehV14() ? '@curaALQ' : '@danoALQ', `${base}.cura.alq`, c.alq);
  } else if (!perda) {
    if (tem(d.geral)) grupo(t('FonteBonusDano'), '@dano', `${base}.dano.geral`, d.geral);
    if (pericia === 'luta' && tem(d.cac)) grupo(t('FonteBonusDano'), '@danoCAC', `${base}.dano.cac`, d.cac);
    else if (pericia === 'pont' && tem(d.ad)) grupo(t('FonteBonusDano'), '@danoAD', `${base}.dano.ad`, d.ad);
    if (magia && tem(d.mag)) grupo(t('FonteBonusDano'), '@danoMagico', `${base}.dano.mag`, d.mag);
    else if (alquimico && tem(d.mag)) grupo(t('FonteBonusDano'), '@danoALQ', `${base}.dano.mag`, d.mag);
  }
  if (dados.bonus) lista.push({ fonte: t('FonteBonus'), formula: '@bonus' });
  return lista;
}

/* ─── Ganchos nos métodos do sistema ──────────────────────────────────────── */

/** Nunca deixar uma falha aqui derrubar a rolagem de verdade. */
function semFalhar(tarefa) {
  try { tarefa(); }
  catch (err) { console.warn(`${MODULE_ID} | Fontes da rolagem: não deu para registrar`, err); }
}

Hooks.once('setup', () => {
  const item = CONFIG.Item?.documentClass?.prototype;
  if (item && !item._t20gFontes && typeof item.rollAttack === 'function') {
    const ataque = item.rollAttack;
    item.rollAttack = async function (args = {}) {
      const antes = [];
      semFalhar(() => {
        for (const r of this.system.rolls.filter((i) => i.type === 'ataque')) {
          // Desligadas, as fontes não custam nada: só a limpeza dos "+ 0".
          antes.push({ r, ...(fontesAtivas() ? parcelasDoAtaque(this, r, args?.options) : {}) });
        }
      });
      const saida = await ataque.call(this, args);
      semFalhar(() => {
        for (const { r, lista, dados } of antes) {
          if (lista) registrar(this.system.rolled?.[r.name], lista, dados);
          else limparZeros(this.system.rolled?.[r.name]);
        }
      });
      return saida;
    };

    const dano = item.rollDamage;
    item.rollDamage = async function (args = {}) {
      const saida = await dano.call(this, args);
      semFalhar(() => {
        // O damageRoll recebe `...options` por último: um `critical` nas
        // opções (a prévia manda) vence o que o rollDamage decidiu.
        const critico = !!(args?.options?.critical
          ?? (this.type === 'arma' ? this.system.rolled?.Ataque?._critical : args?.critical));
        const dados = this.getRollData();
        for (const r of this.system.rolls.filter((i) => i.type === 'dano')) {
          const roll = this.system.rolled?.[r.name];
          if (!roll) continue;
          if (fontesAtivas()) registrar(roll, parcelasDoDano(this, r, args?.options ?? {}, critico, dados), dados);
          else limparZeros(roll);
        }
      });
      return saida;
    };
    item._t20gFontes = true;
  }

  // Perícia e atributo não passam por um Item: o rollPericia/rollAtributo
  // monta um objeto solto e entrega ao displayCard do ator já rolado.
  const ator = CONFIG.Actor?.documentClass?.prototype;
  if (ator && !ator._t20gFontes && typeof ator.displayCard === 'function') {
    const cartao = ator.displayCard;
    ator.displayCard = function (args = {}) {
      semFalhar(() => {
        const opcoes = args?.options;
        const itemData = opcoes?.itemData;
        if (!itemData?.rolled?.terms || itemData.rolled.options?.[OPCAO]) return;
        if (itemData.type === 'pericia') registrarPericia(itemData.rolled, itemData, this, opcoes);
        else if (itemData.type === 'atributo') registrarAtributo(itemData.rolled, itemData, this, opcoes);
        else limparZeros(itemData.rolled);
      });
      return cartao.call(this, args);
    };
    ator._t20gFontes = true;
  }
});

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, SETTING, {
    name: 'T20HaydGMTools.SettingFontesName',
    hint: 'T20HaydGMTools.SettingFontesHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register(MODULE_ID, SETTING_ZEROS, {
    name: 'T20HaydGMTools.SettingLimparZerosName',
    hint: 'T20HaydGMTools.SettingLimparZerosHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });
});

/* ─── Prévia: tooltip em cada número ──────────────────────────────────────── */

/**
 * A fórmula da rolagem como elementos, com o nome da fonte no tooltip de
 * cada termo. Sem fontes registradas, devolve só o texto.
 */
export function formulaComFontes(roll) {
  const frag = document.createDocumentFragment();
  const faixas = roll?.options?.[OPCAO];
  const termos = termosDa(roll);
  const mapa = fontePorTermo(faixas, termos);
  const valorDaFaixa = (faixa) => termos.slice(faixa.ini, faixa.fim).reduce((s, tm) => s + (tm.valor ?? 0), 0);
  (roll?.terms ?? []).forEach((termo, indice) => {
    if (termo instanceof foundry.dice.terms.OperatorTerm) {
      frag.append(` ${termo.operator} `);
      return;
    }
    const texto = String(termo.expression ?? termo.formula);
    const faixa = mapa.get(indice);
    if (!faixa) { frag.append(texto); return; }
    const span = document.createElement('span');
    span.className = 't20g-fonte-termo';
    span.textContent = texto;
    span.dataset.tooltip = textoDaFonte(faixa, valorDaFaixa(faixa), t('FonteDiferenca'));
    frag.append(span);
  });
  return frag;
}

/* ─── Tabela no chat ──────────────────────────────────────────────────────── */

/** O `.dice-roll` do último clique direito, para saber QUAL rolagem do cartão. */
let ultimoClique = null;
document.addEventListener('contextmenu', (ev) => {
  const alvo = ev.target instanceof Element ? ev.target : null;
  ultimoClique = {
    mensagem: alvo?.closest('[data-message-id]')?.dataset.messageId ?? null,
    rolagem: alvo?.closest('.dice-roll') ?? null
  };
}, true);

function indiceDoClique(li, message) {
  const el = li?.[0] ?? li;
  if (!ultimoClique?.rolagem || ultimoClique.mensagem !== message.id) return -1;
  const todas = [...(el?.querySelectorAll?.('.dice-roll') ?? [])];
  if (todas.length !== message.rolls.length) return -1;
  return todas.indexOf(ultimoClique.rolagem);
}

function valorTexto(valor, primeiro) {
  if (valor === null || valor === undefined) return '—';
  if (primeiro) return String(valor);
  return valor < 0 ? `−${Math.abs(valor)}` : `+${valor}`;
}

function tabelaDaRolagem(roll) {
  const termos = termosDa(roll);
  const linhas = linhasDaTabela(roll.options?.[OPCAO] ?? null, termos, {
    semOrigem: t('FonteSemRegistro'),
    diferenca: t('FonteDiferenca')
  });
  const corpo = linhas.map((linha, i) => {
    const dados = linha.resultados?.length && linha.resultados.length > 0 && linha.expressao.match(/d/i)
      ? ` <span class="t20g-fontes-dados">[${linha.resultados.join(', ')}]</span>` : '';
    const detalhes = linha.detalhes.map((d) => `<tr class="t20g-fontes-detalhe${d.semOrigem ? ' t20g-fontes-sem' : ''}">
        <td>${esc(d.fonte)}</td><td></td><td>${esc(valorTexto(d.valor, false))}</td></tr>`).join('');
    return `<tr class="${linha.semOrigem ? 't20g-fontes-sem' : ''}">
        <td>${esc(linha.fonte)}</td>
        <td>${esc(linha.expressao)}${dados}</td>
        <td>${esc(valorTexto(linha.valor, i === 0))}</td></tr>${detalhes}`;
  }).join('');
  const titulo = roll.options?.title || roll.options?.flavor || '';
  return `<section class="t20g-fontes-rolagem">
      ${titulo ? `<h4>${esc(titulo)}</h4>` : ''}
      <table class="t20g-fontes">
        <thead><tr><th>${esc(t('FonteColunaFonte'))}</th><th>${esc(t('FonteColunaTermo'))}</th><th>${esc(t('FonteColunaValor'))}</th></tr></thead>
        <tbody>${corpo}</tbody>
        <tfoot><tr><td>${esc(t('FonteTotal'))}</td><td>${esc(roll.formula.replace(/\[[^\]]*\]/g, ''))}</td><td>${esc(roll.total)}</td></tr></tfoot>
      </table>
    </section>`;
}

export function podeVerFontes(message, ocultaDoUsuario) {
  if (!fontesAtivas() || !message?.rolls?.length || !message.isContentVisible) return false;
  return game.user.isGM || !ocultaDoUsuario;
}

export async function abrirFontes(li, message) {
  const indice = indiceDoClique(li, message);
  const rolagens = indice >= 0 ? [message.rolls[indice]] : message.rolls;
  const conteudo = rolagens.filter((r) => r?.terms).map(tabelaDaRolagem).join('');
  return new foundry.applications.api.DialogV2({
    window: { title: t('FonteTitulo'), icon: 'fa-solid fa-magnifying-glass-chart' },
    classes: ['t20g-fontes-janela'],
    position: { width: 480 },
    content: conteudo,
    buttons: [{ action: 'ok', label: t('FonteFechar'), default: true }]
  }).render({ force: true });
}
