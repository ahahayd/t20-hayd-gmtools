/**
 * T20 Hayd GMTools | atributos.mjs
 * Definição de atributos iniciais para Personagens de Jogador.
 *
 * Botão em "Configurações de Personagem" (ActorSettings do sistema) que
 * oferece os métodos do Livro Básico (p.16–17) e as variantes do
 * suplemento (Clássica, Épica, Valkaria, Khalmyr, Nimb, Pontos Variados),
 * além de arranjos prontos e compra com pontos/custos personalizados.
 *
 * Escreve APENAS system.atributos.<attr>.base — o bônus racial é um
 * preenchimento opcional (o sistema já o preenche pela automação da raça).
 */

const MODULE_ID = 't20-hayd-gmtools';
const { DialogV2 } = foundry.applications.api;

/* ─── Tabelas ─────────────────────────────────────────────────────────── */

/** Custo total por valor final (T20 p.17, Tabela 1-1). */
const CUSTO_PADRAO = { '-1': -1, '0': 0, '1': 1, '2': 2, '3': 4, '4': 7 };

const ICONES = {
  for: 'fa-hand-fist', des: 'fa-person-running', con: 'fa-heart-pulse',
  int: 'fa-brain', sab: 'fa-eye', car: 'fa-comments'
};

/** Chaves/rótulos de atributo na ordem do sistema. */
function atributosSistema() {
  return CONFIG.T20?.atributos ?? {
    for: 'Força', con: 'Constituição', des: 'Destreza',
    int: 'Inteligência', sab: 'Sabedoria', car: 'Carisma'
  };
}

/** Conversão rolagem → atributo (T20 p.17): faixas "até X" + valor final. */
const CONVERSAO_PADRAO = {
  faixas: [[7, -2], [9, -1], [11, 0], [13, 1], [15, 2], [17, 3]],
  acima: 4
};

/** Tabela de conversão vigente (o mestre pode personalizá-la nas opções). */
function obterConversao() {
  let cfg;
  try { cfg = game.settings.get(MODULE_ID, 'atributosConversao'); }
  catch { cfg = null; }
  const faixas = (cfg?.faixas ?? [])
    .map(f => [Number(f?.[0]), Number(f?.[1])])
    .filter(f => Number.isFinite(f[0]) && Number.isFinite(f[1]))
    .sort((a, b) => a[0] - b[0]);
  const acima = Number(cfg?.acima);
  if (!faixas.length || !Number.isFinite(acima)) return CONVERSAO_PADRAO;
  return { faixas, acima };
}

/** Converte o total de uma rolagem em valor de atributo pela tabela vigente. */
export function converter(total) {
  const { faixas, acima } = obterConversao();
  for (const [ate, valor] of faixas) if (total <= ate) return valor;
  return acima;
}

/**
 * Conversão do método Nimb (d20): extremos fixos do método (1–3 → −3;
 * 20 → 5) sobre a tabela vigente — 18–19 herdam o valor "acima" da tabela.
 */
export function converterNimb(total) {
  if (total <= 3) return -3;
  if (total >= 20) return 5;
  return converter(total);
}

function tabelaHtml(linhas) {
  return `<table class="t20g-atr-tabela">
    <thead><tr><th>Rolagem</th><th>Atributo</th></tr></thead>
    <tbody>${linhas.map(([r, v]) => `<tr><td class="t20g-atr-num">${r}</td><td class="t20g-atr-num">${v}</td></tr>`).join('')}</tbody>
  </table>`;
}

/** Tabela de conversão vigente em HTML (para os botões de ajuda). */
function tabelaConversaoHtml() {
  const { faixas, acima } = obterConversao();
  const linhas = [];
  let prev = null;
  for (const [ate, valor] of faixas) {
    const rotulo = prev === null ? `${ate} ou menos` : (prev + 1 === ate ? `${ate}` : `${prev + 1}–${ate}`);
    linhas.push([rotulo, valor]);
    prev = ate;
  }
  linhas.push([`${prev + 1} ou mais`, acima]);
  return tabelaHtml(linhas);
}

/**
 * Tabela EFETIVA do Nimb em HTML: percorre os totais reais do d20 (1–20)
 * aplicando converterNimb — mostra os extremos fixos do método (1–3 → −3,
 * 20 → 5) combinados com a tabela vigente nas faixas intermediárias.
 */
function tabelaConversaoNimbHtml() {
  const linhas = [];
  let inicio = 1;
  let valorAtual = converterNimb(1);
  for (let t = 2; t <= 20; t++) {
    const v = converterNimb(t);
    if (v !== valorAtual) {
      linhas.push([inicio === t - 1 ? `${inicio}` : `${inicio}–${t - 1}`, valorAtual]);
      inicio = t;
      valorAtual = v;
    }
  }
  linhas.push([inicio === 20 ? '20' : `${inicio}–20`, valorAtual]);
  return tabelaHtml(linhas);
}

/** Formata a lista de dados de um Roll ("5 4 ~~2~~", riscando descartados). */
function dadosHtml(roll) {
  return (roll.dice ?? []).flatMap(d => d.results ?? [])
    .map(r => r.discarded || r.rerolled ? `<del>${r.result}</del>` : `<b>${r.result}</b>`)
    .join(' ');
}

/* ─── Botão de ajuda ("?") dos métodos ────────────────────────────────── */

function botaoAjuda() {
  return `<button type="button" class="t20g-atr-ajuda" data-tooltip="Como funciona este método">
    <i class="fa-solid fa-circle-question"></i></button>`;
}

/** Liga o "?" do diálogo a uma janelinha de explicação do método. */
function wireAjuda(el, titulo, conteudoFn) {
  el.querySelector('.t20g-atr-ajuda')?.addEventListener('click', () => {
    DialogV2.prompt({
      window: { title: titulo, icon: 'fa-solid fa-circle-question' },
      position: { width: 400 },
      content: conteudoFn(),
      ok: { label: 'Entendi', icon: 'fa-solid fa-check' },
      rejectClose: false
    }).catch(() => null);
  });
}

/** Métodos por rolagem de 6 conjuntos. */
const METODOS_ROLAGEM = {
  rolagem: {
    nome: 'Rolagem padrão', formula: '4d6kh3', fonte: 'T20 p.17', redeSeguranca: true,
    desc: '4d6, descarta o menor dado. Rede de segurança: soma dos atributos menor que 6 permite rerolar o menor.'
  },
  classica: {
    nome: 'Clássica', formula: '3d6', fonte: 'Heróis de Arton p.280', redeSeguranca: false,
    desc: '3d6 direto. Gera personagens fracos e desiguais — clima brutal e realista. Sem rede de segurança: jogue com o que sair!'
  },
  epica: {
    nome: 'Épica', formula: '3d6kh2 + 6', fonte: 'Heróis de Arton p.280', redeSeguranca: true,
    desc: '3d6+6, descartando o menor dado. Personagens poderosos, quase sem pontos fracos.'
  }
};

/** Arranjo fixo Khalmyr (sem rolagem). */
const ARRANJO_KHALMYR = {
  nome: 'Khalmyr',
  valores: [3, 3, 2, 1, 0, -1],
  nota: 'Heróis de Arton p.281 — pontos fortes e fracos, grupo equilibrado'
};

/* ─── Configurações ───────────────────────────────────────────────────── */

function obterCustos() {
  let custos;
  try { custos = game.settings.get(MODULE_ID, 'atributosCustos'); }
  catch { custos = null; }
  if (!custos || foundry.utils.isEmpty(custos)) custos = CUSTO_PADRAO;
  const limpo = {};
  for (const [v, c] of Object.entries(custos)) {
    const valor = Number(v), custo = Number(c);
    if (Number.isInteger(valor) && Number.isFinite(custo)) limpo[valor] = custo;
  }
  if (!(0 in limpo)) limpo[0] = 0;
  return limpo;
}

function registrarConfiguracoes() {
  game.settings.register(MODULE_ID, 'atributosMetodoPadrao', {
    name: 'Método padrão da campanha',
    hint: 'Método de definição de atributos adotado pela mesa — aparece pré-selecionado e destacado para os jogadores no menu de definir atributos.',
    scope: 'world', config: true, type: String, default: '',
    choices: {
      '': '— Nenhum —',
      compra: 'Compra por Pontos',
      rolagem: 'Rolagem padrão',
      classica: 'Clássica',
      epica: 'Épica',
      valkaria: 'Valkaria',
      nimb: 'Nimb',
      predefinido: 'Khalmyr'
    }
  });
  game.settings.register(MODULE_ID, 'atributosPontos', {
    name: 'Pontos da compra',
    hint: 'Quantidade de pontos sugerida na Compra por Pontos (padrão do livro: 10; 5 para campanhas "pé no chão", 15 para épicas).',
    scope: 'world', config: true, type: Number, default: 10
  });
  game.settings.register(MODULE_ID, 'atributosMultiNegativos', {
    name: 'Permitir vários atributos negativos',
    hint: 'Se marcado, mais de um atributo pode ficar negativo na compra por pontos (a regra oficial permite reduzir apenas UM atributo para −1).',
    scope: 'world', config: true, type: Boolean, default: false
  });
  game.settings.register(MODULE_ID, 'atributosCustos', {
    name: 'Custos da compra de atributos',
    scope: 'world', config: false, type: Object, default: CUSTO_PADRAO
  });
  game.settings.registerMenu(MODULE_ID, 'atributosCustosMenu', {
    name: 'Custos da compra por pontos',
    label: 'Editar custos',
    hint: 'Modifique o custo de cada valor de atributo e habilite novas compras (ex.: valor 5 por 10 pontos).',
    icon: 'fa-solid fa-coins',
    type: class extends FormApplication {
      render() { abrirEditorCustos(); return this; }
      async _updateObject() {}
    },
    restricted: true
  });
  game.settings.register(MODULE_ID, 'atributosConversao', {
    name: 'Conversão de rolagens em atributos',
    scope: 'world', config: false, type: Object, default: CONVERSAO_PADRAO
  });
  game.settings.registerMenu(MODULE_ID, 'atributosConversaoMenu', {
    name: 'Conversão de rolagens em atributos',
    label: 'Editar conversão',
    hint: 'Personalize os intervalos de rolagem e quanto cada um vale de atributo (ex.: fazer 18 valer 5 em vez de 4). Vale para todos os métodos com rolagem.',
    icon: 'fa-solid fa-arrow-right-arrow-left',
    type: class extends FormApplication {
      render() { abrirEditorConversao(); return this; }
      async _updateObject() {}
    },
    restricted: true
  });
}

/* ─── Editor de custos (GM) ───────────────────────────────────────────── */

async function abrirEditorCustos() {
  if (!game.user.isGM) return;
  const custos = obterCustos();
  const valores = Object.keys(custos).map(Number).sort((a, b) => a - b);

  const linha = (v, c) => `
    <div class="t20g-atr-custo-linha">
      <input type="number" step="1" name="valor" value="${v}" data-tooltip="Valor final do atributo">
      <span>custa</span>
      <input type="number" step="1" name="custo" value="${c}" data-tooltip="Custo total em pontos (negativo devolve pontos)">
      <a class="t20g-atr-custo-remover" data-tooltip="Remover"><i class="fa-solid fa-trash"></i></a>
    </div>`;

  const resultado = await DialogV2.wait({
    window: { title: 'Custos da Compra de Atributos', icon: 'fa-solid fa-coins' },
    position: { width: 380 },
    content: `
      <p class="notes">Custo <b>total</b> por valor final (não incremental). Os valores devem formar
      uma sequência contínua (ex.: −1 a 5). Padrão do livro: −1▸−1, 0▸0, 1▸1, 2▸2, 3▸4, 4▸7.</p>
      <div class="t20g-atr-custos">${valores.map(v => linha(v, custos[v])).join('')}</div>
      <div class="t20g-atr-custo-acoes">
        <button type="button" class="t20g-atr-custo-add"><i class="fa-solid fa-plus"></i> Adicionar valor</button>
        <button type="button" class="t20g-atr-custo-reset"><i class="fa-solid fa-rotate-left"></i> Restaurar padrão</button>
      </div>`,
    buttons: [
      {
        action: 'salvar', label: 'Salvar', icon: 'fa-solid fa-check', default: true,
        callback: (ev, btn) => {
          const out = {};
          btn.form.querySelectorAll('.t20g-atr-custo-linha').forEach(l => {
            const v = Number(l.querySelector('[name="valor"]').value);
            const c = Number(l.querySelector('[name="custo"]').value);
            if (Number.isInteger(v) && Number.isFinite(c)) out[v] = c;
          });
          return out;
        }
      },
      { action: 'cancelar', label: 'Cancelar' }
    ],
    render: (ev, dialog) => {
      const el = dialog.element;
      el.querySelector('.t20g-atr-custo-add')?.addEventListener('click', () => {
        const cont = el.querySelector('.t20g-atr-custos');
        const atuais = [...cont.querySelectorAll('[name="valor"]')].map(i => Number(i.value) || 0);
        const max = atuais.length ? Math.max(...atuais) : -1;
        cont.insertAdjacentHTML('beforeend', linha(max + 1, 0));
        wireRemover(cont);
      });
      el.querySelector('.t20g-atr-custo-reset')?.addEventListener('click', () => {
        const cont = el.querySelector('.t20g-atr-custos');
        cont.innerHTML = Object.entries(CUSTO_PADRAO).map(([v, c]) => linha(v, c)).join('');
        wireRemover(cont);
      });
      const wireRemover = (cont) => cont.querySelectorAll('.t20g-atr-custo-remover').forEach(a => {
        a.onclick = () => a.closest('.t20g-atr-custo-linha').remove();
      });
      wireRemover(el);
    },
    rejectClose: false
  });

  if (!resultado || resultado === 'cancelar') return;

  // Validação: 0 presente e sequência contínua (as setas andam de 1 em 1)
  const chaves = Object.keys(resultado).map(Number).sort((a, b) => a - b);
  if (!chaves.length || !chaves.includes(0)) {
    ui.notifications.error('A tabela precisa incluir o valor 0.');
    return abrirEditorCustos();
  }
  for (let i = 1; i < chaves.length; i++) {
    if (chaves[i] !== chaves[i - 1] + 1) {
      ui.notifications.error(`Sequência com lacuna entre ${chaves[i - 1]} e ${chaves[i]} — os valores devem ser contínuos.`);
      return abrirEditorCustos();
    }
  }
  await game.settings.set(MODULE_ID, 'atributosCustos', resultado);
  ui.notifications.info('Custos da compra de atributos salvos.');
}

/* ─── Editor de conversão de rolagens (GM) ────────────────────────────── */

async function abrirEditorConversao() {
  if (!game.user.isGM) return;
  const { faixas, acima } = obterConversao();

  const linha = (ate, valor) => `
    <div class="t20g-atr-custo-linha">
      <span>até</span>
      <input type="number" step="1" name="ate" value="${ate}" data-tooltip="Total da rolagem (limite superior da faixa)">
      <span>vale</span>
      <input type="number" step="1" name="valor" value="${valor}" data-tooltip="Valor de atributo desta faixa">
      <a class="t20g-atr-custo-remover" data-tooltip="Remover"><i class="fa-solid fa-trash"></i></a>
    </div>`;

  const resultado = await DialogV2.wait({
    window: { title: 'Conversão de Rolagens em Atributos', icon: 'fa-solid fa-arrow-right-arrow-left' },
    position: { width: 400 },
    content: `
      <p class="notes">Cada faixa cobre os totais até o limite indicado (a partir do fim da
      anterior). O que passar da última faixa vale o valor final. Padrão (T20 p.17):
      ≤7▸−2, 8–9▸−1, 10–11▸0, 12–13▸1, 14–15▸2, 16–17▸3, 18+▸4.</p>
      <div class="t20g-atr-custos">${faixas.map(([a, v]) => linha(a, v)).join('')}</div>
      <div class="form-group">
        <label>Acima da última faixa, vale</label>
        <input type="number" step="1" name="acima" value="${acima}" style="width:72px">
      </div>
      <div class="t20g-atr-custo-acoes">
        <button type="button" class="t20g-atr-custo-add"><i class="fa-solid fa-plus"></i> Adicionar faixa</button>
        <button type="button" class="t20g-atr-custo-reset"><i class="fa-solid fa-rotate-left"></i> Restaurar padrão</button>
      </div>`,
    buttons: [
      {
        action: 'salvar', label: 'Salvar', icon: 'fa-solid fa-check', default: true,
        callback: (ev, btn) => {
          const faixasOut = [];
          btn.form.querySelectorAll('.t20g-atr-custo-linha').forEach(l => {
            const a = Number(l.querySelector('[name="ate"]').value);
            const v = Number(l.querySelector('[name="valor"]').value);
            if (Number.isInteger(a) && Number.isFinite(v)) faixasOut.push([a, v]);
          });
          return { faixas: faixasOut, acima: Number(btn.form.querySelector('[name="acima"]').value) };
        }
      },
      { action: 'cancelar', label: 'Cancelar' }
    ],
    render: (ev, dialog) => {
      const el = dialog.element;
      const wireRemover = (cont) => cont.querySelectorAll('.t20g-atr-custo-remover').forEach(a => {
        a.onclick = () => a.closest('.t20g-atr-custo-linha').remove();
      });
      el.querySelector('.t20g-atr-custo-add')?.addEventListener('click', () => {
        const cont = el.querySelector('.t20g-atr-custos');
        const atuais = [...cont.querySelectorAll('[name="ate"]')].map(i => Number(i.value) || 0);
        const max = atuais.length ? Math.max(...atuais) : 0;
        cont.insertAdjacentHTML('beforeend', linha(max + 2, 0));
        wireRemover(cont);
      });
      el.querySelector('.t20g-atr-custo-reset')?.addEventListener('click', () => {
        const cont = el.querySelector('.t20g-atr-custos');
        cont.innerHTML = CONVERSAO_PADRAO.faixas.map(([a, v]) => linha(a, v)).join('');
        el.querySelector('[name="acima"]').value = CONVERSAO_PADRAO.acima;
        wireRemover(cont);
      });
      wireRemover(el);
    },
    rejectClose: false
  });

  if (!resultado || resultado === 'cancelar') return;

  // Validação: ao menos uma faixa, limites únicos e valor final numérico.
  if (!resultado.faixas.length || !Number.isFinite(resultado.acima)) {
    ui.notifications.error('Defina ao menos uma faixa e o valor final.');
    return abrirEditorConversao();
  }
  const ates = resultado.faixas.map(f => f[0]);
  if (new Set(ates).size !== ates.length) {
    ui.notifications.error('Há faixas com o mesmo limite — cada "até" deve ser único.');
    return abrirEditorConversao();
  }
  resultado.faixas.sort((a, b) => a[0] - b[0]);
  await game.settings.set(MODULE_ID, 'atributosConversao', resultado);
  ui.notifications.info('Tabela de conversão de rolagens salva.');
}

/* ─── Aplicação no ator ───────────────────────────────────────────────── */

/**
 * Confirmação final: mostra atual → novo, avisa da substituição e oferece
 * o preenchimento OPCIONAL do bônus racial. Aplica apenas .base (e .racial
 * quando alterado pelo usuário).
 */
async function confirmarAplicar(actor, bases, raciais, resumo) {
  const attrs = atributosSistema();
  const linhas = Object.entries(attrs).map(([k, rotulo]) => {
    const atual = actor.system.atributos?.[k] ?? {};
    const racial = raciais?.[k] ?? atual.racial ?? 0;
    const mudou = (atual.base ?? 0) !== bases[k];
    return `
      <tr>
        <td><i class="fa-solid ${ICONES[k] ?? 'fa-star'}"></i> ${rotulo}</td>
        <td class="t20g-atr-num">${atual.base ?? 0}</td>
        <td class="t20g-atr-seta">→</td>
        <td class="t20g-atr-num ${mudou ? 't20g-atr-novo' : ''}">${bases[k]}</td>
        <td><input type="number" step="1" name="racial-${k}" value="${racial}" data-tooltip="Bônus racial (opcional)"></td>
      </tr>`;
  }).join('');

  const dados = await DialogV2.wait({
    window: { title: `Definir atributos — ${actor.name}`, icon: 'fa-solid fa-dice-d20' },
    position: { width: 420 },
    content: `
      <p class="notification warning" style="margin-top:0">Isto vai <b>substituir os valores base atuais</b> dos atributos do personagem.</p>
      <p class="notes">${resumo}</p>
      <table class="t20g-atr-tabela">
        <thead><tr><th>Atributo</th><th>Atual</th><th></th><th>Novo</th><th>Racial (opcional)</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <p class="notes">Racial: o sistema preenche automaticamente pela raça — deixe como está se usa essa automação.</p>`,
    buttons: [
      {
        action: 'aplicar', label: 'Aplicar', icon: 'fa-solid fa-check', default: true,
        callback: (ev, btn) => new foundry.applications.ux.FormDataExtended(btn.form).object
      },
      { action: 'cancelar', label: 'Cancelar' }
    ],
    rejectClose: false
  });
  if (!dados || dados === 'cancelar') return false;

  const update = {};
  for (const k of Object.keys(attrs)) {
    update[`system.atributos.${k}.base`] = bases[k];
    const racial = Number(dados[`racial-${k}`]);
    if (Number.isFinite(racial) && racial !== (actor.system.atributos?.[k]?.racial ?? 0)) {
      update[`system.atributos.${k}.racial`] = racial;
    }
  }
  await actor.update(update);

  const lista = Object.entries(attrs)
    .map(([k, rotulo]) => `${rotulo.slice(0, 3)} ${bases[k] >= 0 ? bases[k] : `−${-bases[k]}`}`)
    .join(', ');
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="t20g-atr-chat"><b><i class="fa-solid fa-dice-d20"></i> Atributos definidos</b><br>${resumo}<br><em>${lista}</em></div>`
  });
  ui.notifications.info(`Atributos de ${actor.name} atualizados.`);
  return true;
}

/* ─── Compra por pontos ───────────────────────────────────────────────── */

async function abrirCompra(actor, pontosTotais, tituloMetodo, estadoInicial = null) {
  const attrs = atributosSistema();
  const custos = obterCustos();
  const valores = Object.keys(custos).map(Number).sort((a, b) => a - b);
  const vMin = valores[0], vMax = valores.at(-1);
  const multiNeg = game.settings.get(MODULE_ID, 'atributosMultiNegativos');

  const estado = {};
  for (const k of Object.keys(attrs)) {
    estado[k] = estadoInicial?.[k]
      ? { ...estadoInicial[k] }
      : { base: 0, racial: actor.system.atributos?.[k]?.racial ?? 0 };
  }

  /**
   * Valida o estado INTEIRO (fonte única da regra): pontos gastos dentro
   * do total e, salvo configuração do mestre, no máximo UM atributo com
   * base negativa (T20 p.17). Toda mutação passa por aqui — não há como um
   * caminho de clique específico contornar a regra.
   */
  const violacao = () => {
    const gasto = Object.values(estado).reduce((t, e) => t + (custos[e.base] ?? 0), 0);
    if (gasto > pontosTotais) return 'Pontos insuficientes.';
    if (!multiNeg && Object.values(estado).filter(e => e.base < 0).length > 1) {
      return 'Apenas um atributo pode ficar negativo (T20 p.17).';
    }
    return null;
  };

  // Estado inicial corrompido (não deveria acontecer): recomeça do zero.
  if (violacao()) for (const k of Object.keys(attrs)) estado[k].base = 0;

  const linha = (k, rotulo) => `
    <div class="t20g-atr-linha" data-attr="${k}">
      <span class="t20g-atr-nome"><i class="fa-solid ${ICONES[k] ?? 'fa-star'}"></i> ${rotulo}</span>
      <span class="t20g-atr-controle">
        <button type="button" class="t20g-menos" data-campo="base" data-tooltip="Reduzir">−</button>
        <span class="t20g-num" data-campo="base">0</span>
        <button type="button" class="t20g-mais" data-campo="base" data-tooltip="Aumentar">+</button>
      </span>
      <span class="t20g-atr-op">+</span>
      <span class="t20g-atr-controle t20g-atr-racial">
        <button type="button" class="t20g-menos" data-campo="racial">−</button>
        <span class="t20g-num" data-campo="racial">${estado[k].racial}</span>
        <button type="button" class="t20g-mais" data-campo="racial">+</button>
      </span>
      <span class="t20g-atr-op">=</span>
      <span class="t20g-atr-total">${estado[k].base + estado[k].racial}</span>
    </div>`;

  /** Explicação da compra, com a tabela de custos VIGENTE (lida na hora,
   * refletindo edições do mestre). */
  const ajudaCompra = () => {
    const c = obterCustos();
    const vs = Object.keys(c).map(Number).sort((a, b) => a - b);
    return `
      <p>Todos os atributos começam em <b>0</b> e você recebe <b>${pontosTotais}</b> pontos
      para aumentá-los. O custo de cada valor é <b>total</b>, não incremental (T20 p.17):</p>
      <table class="t20g-atr-tabela">
        <thead><tr><th>Valor final</th><th>Custo</th></tr></thead>
        <tbody>${vs.map(v => `<tr><td class="t20g-atr-num">${v}</td><td class="t20g-atr-num">${c[v]} ${Math.abs(c[v]) === 1 ? 'ponto' : 'pontos'}</td></tr>`).join('')}</tbody>
      </table>
      ${multiNeg
        ? '<p>O mestre liberou deixar <b>mais de um</b> atributo negativo.</p>'
        : '<p>Você pode reduzir <b>um único</b> atributo abaixo de 0 para receber pontos adicionais (T20 p.17).</p>'}
      <p class="notes">A coluna Racial é opcional — o sistema preenche automaticamente pela raça.</p>`;
  };

  const resultado = await DialogV2.wait({
    window: { title: `${tituloMetodo} — ${actor.name}`, icon: 'fa-solid fa-coins' },
    position: { width: 460 },
    content: `
      <div class="t20g-atr-pontos">Pontos restantes: <output class="t20g-atr-restantes">${pontosTotais}</output>${botaoAjuda()}</div>
      <div class="t20g-atr-cab">
        <span></span><span>Base</span><span></span><span>Racial</span><span></span><span>Total</span>
      </div>
      ${Object.entries(attrs).map(([k, r]) => linha(k, r)).join('')}`,
    buttons: [
      {
        action: 'aplicar', label: 'Aplicar', icon: 'fa-solid fa-check', default: true,
        // Portão final: nenhum estado inválido sai deste diálogo.
        callback: () => {
          const erro = violacao();
          if (erro) { ui.notifications.error(erro); return 'invalido'; }
          return { ...estado };
        }
      },
      { action: 'cancelar', label: 'Cancelar' }
    ],
    render: (ev, dialog) => {
      const el = dialog.element;
      wireAjuda(el, `Como funciona — ${tituloMetodo}`, ajudaCompra);
      const gasto = () => Object.values(estado).reduce((t, e) => t + (custos[e.base] ?? 0), 0);
      const restantes = () => pontosTotais - gasto();

      /** A mudança de base seria válida? (aplica, valida, reverte) */
      const podeMudar = (k, delta) => {
        const anterior = estado[k].base;
        const novo = anterior + delta;
        if (!(novo in custos)) return false;
        estado[k].base = novo;
        const erro = violacao();
        estado[k].base = anterior;
        return !erro;
      };

      const atualizar = () => {
        el.querySelector('.t20g-atr-restantes').textContent = restantes();
        for (const [k, e] of Object.entries(estado)) {
          const l = el.querySelector(`[data-attr="${k}"]`);
          l.querySelector('.t20g-num[data-campo="base"]').textContent = e.base;
          l.querySelector('.t20g-num[data-campo="racial"]').textContent = e.racial;
          l.querySelector('.t20g-atr-total').textContent = e.base + e.racial;
          l.querySelector('.t20g-mais[data-campo="base"]').disabled = !podeMudar(k, +1);
          l.querySelector('.t20g-menos[data-campo="base"]').disabled = !podeMudar(k, -1);
        }
      };

      el.querySelectorAll('.t20g-mais, .t20g-menos').forEach(btn => btn.addEventListener('click', () => {
        const k = btn.closest('[data-attr]').dataset.attr;
        const campo = btn.dataset.campo;
        const delta = btn.classList.contains('t20g-mais') ? 1 : -1;
        if (campo === 'racial') {
          estado[k].racial = Math.clamp(estado[k].racial + delta, -5, 5);
        } else {
          // Aplica e valida o estado RESULTANTE; reverte se quebrar regra.
          const anterior = estado[k].base;
          const novo = anterior + delta;
          if (!(novo in custos)) return;
          estado[k].base = novo;
          const erro = violacao();
          if (erro) {
            estado[k].base = anterior;
            return ui.notifications.warn(erro);
          }
        }
        atualizar();
      }));
      atualizar();
    },
    rejectClose: false
  });

  if (resultado === 'invalido') return abrirCompra(actor, pontosTotais, tituloMetodo, { ...estado });
  if (!resultado || resultado === 'cancelar') return;

  const sobra = pontosTotais - Object.values(resultado).reduce((t, e) => t + (custos[e.base] ?? 0), 0);
  const bases = {}, raciais = {};
  for (const [k, e] of Object.entries(resultado)) { bases[k] = e.base; raciais[k] = e.racial; }
  const resumo = `${tituloMetodo} (${pontosTotais} pontos${sobra > 0 ? `, ${sobra} não gastos` : ''}).`;
  const ok = await confirmarAplicar(actor, bases, raciais, resumo);
  // Cancelou a confirmação: volta à compra preservando o que foi montado.
  if (!ok) return abrirCompra(actor, pontosTotais, tituloMetodo, resultado);
}

/**
 * Compra por Pontos: escolhe o total (presets do livro/Heróis de Arton ou
 * personalizado, com a sugestão do mestre) e abre a compra.
 */
async function abrirEscolhaPontos(actor) {
  const padrao = Number(game.settings.get(MODULE_ID, 'atributosPontos')) || 10;
  let sugerido = false;
  try { sugerido = ['compra', 'pontosVariados'].includes(game.settings.get(MODULE_ID, 'atributosMetodoPadrao')); }
  catch { sugerido = false; }

  const dados = await DialogV2.wait({
    window: { title: `Compra por Pontos — ${actor.name}`, icon: 'fa-solid fa-coins' },
    position: { width: 380 },
    content: `
      <div class="t20g-atr-presets">
        ${botaoAjuda()}
        <button type="button" data-pontos="5">5 — pé no chão</button>
        <button type="button" data-pontos="10">10 — padrão</button>
        <button type="button" data-pontos="15">15 — épica</button>
      </div>
      ${sugerido ? `<p class="notes"><span class="t20g-atr-badge"><i class="fa-solid fa-star"></i> Padrão da mesa</span>
        O mestre sugere <b>${padrao}</b> pontos para esta campanha.</p>` : ''}
      <div class="form-group"><label>Total de pontos</label>
        <input type="number" name="pontos" value="${padrao}" step="1" min="0"></div>`,
    buttons: [
      {
        action: 'continuar', label: 'Continuar', icon: 'fa-solid fa-arrow-right', default: true,
        callback: (ev, btn) => Number(btn.form.elements.pontos.value)
      },
      { action: 'cancelar', label: 'Cancelar' }
    ],
    render: (ev, dialog) => {
      wireAjuda(dialog.element, 'Como funciona — Compra por Pontos', () => `
        <p>Todos os atributos começam em 0 e você os aumenta gastando pontos (T20 p.17).
        A pontuação pode variar para gerar personagens mais ou menos poderosos:</p>
        <p><b>5 pontos</b> para campanhas "pé no chão", <b>10</b> é o padrão do livro,
        <b>15</b> para campanhas épicas e exageradas — ou qualquer total personalizado
        que a mesa combinar.</p>
        <p class="notes">Compra: T20 p.17. Pontuações variadas: Heróis de Arton p.281.</p>`);
      dialog.element.querySelectorAll('[data-pontos]').forEach(b => b.addEventListener('click', () => {
        dialog.element.querySelector('[name="pontos"]').value = b.dataset.pontos;
      }));
    },
    rejectClose: false
  });
  if (dados === null || dados === 'cancelar' || !Number.isFinite(dados)) return;
  return abrirCompra(actor, Math.max(0, dados), 'Compra por Pontos');
}

/* ─── Distribuição de valores (compartilhada) ─────────────────────────── */

/**
 * Bloco de distribuição: um <select> por atributo escolhendo qual dos seis
 * resultados ele recebe. Seleções são únicas — escolher um valor já usado
 * troca com o atributo que o detinha.
 */
function montarDistribuicao(container, entradas) {
  const attrs = atributosSistema();
  const opcoes = (sel) => entradas
    .map((e, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${e.rotulo}</option>`)
    .join('');
  container.innerHTML = `
    <h4>Distribua os valores</h4>
    ${Object.entries(attrs).map(([k, rotulo], idx) => `
      <div class="t20g-atr-dist-linha">
        <span class="t20g-atr-nome"><i class="fa-solid ${ICONES[k] ?? 'fa-star'}"></i> ${rotulo}</span>
        <select data-attr="${k}">${opcoes(idx)}</select>
      </div>`).join('')}`;

  container.querySelectorAll('select[data-attr]').forEach(sel => {
    sel.dataset.anterior = sel.value;
    sel.addEventListener('change', () => {
      const outro = [...container.querySelectorAll('select[data-attr]')]
        .find(s => s !== sel && s.value === sel.value);
      if (outro) {
        outro.value = sel.dataset.anterior;
        outro.dataset.anterior = outro.value;
      }
      sel.dataset.anterior = sel.value;
    });
  });
}

/** Lê a distribuição → { for: valorFinal, ... } */
function lerDistribuicao(container, entradas) {
  const bases = {};
  container.querySelectorAll('select[data-attr]').forEach(sel => {
    bases[sel.dataset.attr] = entradas[Number(sel.value)].valor;
  });
  return bases;
}

/* ─── Métodos com rolagem (padrão, Clássica, Épica) ───────────────────── */

async function abrirRolagem(actor, chave) {
  const met = METODOS_ROLAGEM[chave];
  const attrs = atributosSistema();
  const n = Object.keys(attrs).length;
  const rolagens = new Array(n).fill(null);
  const LIMITE_SOMA = 6;

  const slots = Array.from({ length: n }, (_, i) => `
    <div class="t20g-atr-slot" data-i="${i}">
      <button type="button" class="t20g-atr-rolar"><i class="fa-solid fa-dice"></i> Rolar</button>
      <span class="t20g-atr-dados">—</span>
      <strong class="t20g-atr-conv">?</strong>
    </div>`).join('');

  const resultado = await DialogV2.wait({
    window: { title: `${met.nome} — ${actor.name}`, icon: 'fa-solid fa-dice' },
    position: { width: 460 },
    content: `
      <div class="t20g-atr-acoes">
        ${botaoAjuda()}
        <button type="button" class="t20g-atr-rolar-todos"><i class="fa-solid fa-dice-d20"></i> Rolar todos</button>
        ${met.redeSeguranca ? `
        <button type="button" class="t20g-atr-reroll" disabled
          data-tooltip="Disponível quando a soma dos seis valores for menor que ${LIMITE_SOMA} (T20 p.17)">
          <i class="fa-solid fa-rotate-left"></i> Rerolar o menor</button>` : ''}
        <span class="t20g-atr-soma"></span>
      </div>
      ${slots}
      <div class="t20g-atr-dist"></div>`,
    buttons: [
      {
        action: 'aplicar', label: 'Aplicar', icon: 'fa-solid fa-check', default: true,
        // Lê a distribuição AQUI: depois do fechamento o DOM não existe mais.
        callback: (ev, btn, dialog) => dialog._entradas
          ? lerDistribuicao(dialog.element.querySelector('.t20g-atr-dist'), dialog._entradas)
          : 'cancelar'
      },
      { action: 'cancelar', label: 'Cancelar' }
    ],
    render: (ev, dialog) => {
      const el = dialog.element;
      wireAjuda(el, `Como funciona — ${met.nome}`, () => `
        <p>${met.desc}</p>
        <p>Role os seis conjuntos (<b>${met.formula}</b>), converta cada total pela tabela
        abaixo e distribua os valores entre os atributos como quiser.</p>
        ${tabelaConversaoHtml()}
        ${met.redeSeguranca ? `
        <p>Rede de segurança: se a soma dos seis valores convertidos for menor que
        <b>${LIMITE_SOMA}</b>, o botão "Rerolar o menor" é liberado — repita até a soma
        chegar a ${LIMITE_SOMA} ou mais.</p>` : `
        <p>Este método <b>não tem</b> rede de segurança — dê um jeito de jogar com o que sair!</p>`}
        <p class="notes">Fonte: ${met.fonte}.</p>`);
      const btnAplicar = el.querySelector('button[data-action="aplicar"]');
      if (btnAplicar) btnAplicar.disabled = true;

      const completo = () => rolagens.every(Boolean);
      const somaConvertida = () => rolagens.reduce((t, r) => t + converter(r.total), 0);

      const atualizar = () => {
        rolagens.forEach((r, i) => {
          const slot = el.querySelector(`.t20g-atr-slot[data-i="${i}"]`);
          if (!r) return;
          slot.querySelector('.t20g-atr-dados').innerHTML = dadosHtml(r);
          slot.querySelector('.t20g-atr-conv').textContent = `${r.total} → ${converter(r.total)}`;
          slot.querySelector('.t20g-atr-rolar').disabled = true;
        });
        if (!completo()) return;

        const soma = somaConvertida();
        el.querySelector('.t20g-atr-soma').textContent = `Soma dos atributos: ${soma}`;
        const btnReroll = el.querySelector('.t20g-atr-reroll');
        if (btnReroll) btnReroll.disabled = soma >= LIMITE_SOMA;
        if (btnAplicar) btnAplicar.disabled = false;

        const entradas = rolagens.map(r => ({
          valor: converter(r.total),
          rotulo: `${r.total} → ${converter(r.total)}`
        }));
        montarDistribuicao(el.querySelector('.t20g-atr-dist'), entradas);
        dialog._entradas = entradas;
      };

      const rolar = async (i) => {
        const roll = await new Roll(met.formula).evaluate();
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor }),
          flavor: `${met.nome} — conjunto ${i + 1} (${met.formula})`
        });
        rolagens[i] = roll;
        atualizar();
      };

      el.querySelectorAll('.t20g-atr-rolar').forEach(btn => btn.addEventListener('click', () => {
        const i = Number(btn.closest('.t20g-atr-slot').dataset.i);
        if (!rolagens[i]) rolar(i);
      }));
      el.querySelector('.t20g-atr-rolar-todos')?.addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        for (let i = 0; i < n; i++) if (!rolagens[i]) await rolar(i);
      });
      el.querySelector('.t20g-atr-reroll')?.addEventListener('click', async (e) => {
        if (!completo() || somaConvertida() >= LIMITE_SOMA) return;
        // Rerola o MENOR valor (menor convertido; empate → menor total)
        let alvo = 0;
        rolagens.forEach((r, i) => {
          const [a, b] = [rolagens[alvo], r];
          if (converter(b.total) < converter(a.total)
            || (converter(b.total) === converter(a.total) && b.total < a.total)) alvo = i;
        });
        e.currentTarget.disabled = true;
        rolagens[alvo] = null;
        await rolar(alvo);
      });
    },
    rejectClose: false
  });

  if (!resultado || resultado === 'cancelar') return;

  // Sem reabrir no cancelamento: reabrir rolaria dados NOVOS. As rolagens
  // originais permanecem registradas no chat.
  const ok = await confirmarAplicar(actor, resultado, null, `${met.nome} (${met.formula}, ${met.fonte}).`);
  if (!ok) ui.notifications.info('Definição cancelada — as rolagens continuam no chat.');
}

/* ─── Valkaria (7d6 sobre base 8) ─────────────────────────────────────── */

async function abrirValkaria(actor) {
  const attrs = atributosSistema();
  const N = 7;
  const dados = new Array(N).fill(null);   // resultado de cada d6
  const atribuicao = new Array(N).fill('');

  const opcoesAttr = `<option value="">—</option>` + Object.entries(attrs)
    .map(([k, r]) => `<option value="${k}">${r}</option>`).join('');
  const chips = Array.from({ length: N }, (_, i) => `
    <span class="t20g-atr-valk-dado" data-i="${i}">
      <button type="button" class="t20g-atr-rolar-dado" data-tooltip="Rolar este d6"><i class="fa-solid fa-dice"></i></button>
      <b class="t20g-atr-valk-res">?</b> em
      <select data-i="${i}" disabled>${opcoesAttr}</select>
    </span>`).join('');

  const resultado = await DialogV2.wait({
    window: { title: `Valkaria — ${actor.name}`, icon: 'fa-solid fa-dice' },
    position: { width: 470 },
    content: `
      <div class="t20g-atr-acoes">
        ${botaoAjuda()}
        <button type="button" class="t20g-atr-rolar-todos"><i class="fa-solid fa-forward"></i> Rolar restantes</button>
      </div>
      <div class="t20g-atr-valk-dados">${chips}</div>
      <div class="t20g-atr-valk-tabela"></div>`,
    buttons: [
      {
        action: 'aplicar', label: 'Aplicar', icon: 'fa-solid fa-check', default: true,
        // Guarda contra submit por Enter antes de rolar/atribuir tudo
        callback: () => (dados.every(d => d !== null) && atribuicao.every(Boolean))
          ? { dados: [...dados], atribuicao: [...atribuicao] }
          : 'cancelar'
      },
      { action: 'cancelar', label: 'Cancelar' }
    ],
    render: (ev, dialog) => {
      const el = dialog.element;
      wireAjuda(el, 'Como funciona — Valkaria', () => `
        <p>Cada atributo começa com valor de rolagem <b>8</b>. Role 7d6, um a um, e aplique
        cada dado <b>inteiro</b> em um atributo (pode acumular vários no mesmo).</p>
        <p>O total de cada atributo é convertido pela tabela abaixo — totais altos não passam
        do valor final, mesmo acima de 18. Dados não podem ser divididos entre atributos, e
        todos os 7 precisam ser aplicados.</p>
        ${tabelaConversaoHtml()}
        <p class="notes">Fonte: Heróis de Arton p.281.</p>`);
      const btnAplicar = el.querySelector('button[data-action="aplicar"]');
      if (btnAplicar) btnAplicar.disabled = true;

      const totais = () => {
        const t = {};
        for (const k of Object.keys(attrs)) t[k] = 8;
        atribuicao.forEach((k, i) => { if (k && dados[i] !== null) t[k] += dados[i]; });
        return t;
      };

      const atualizarTabela = () => {
        const t = totais();
        el.querySelector('.t20g-atr-valk-tabela').innerHTML = `
          <div class="t20g-atr-cab"><span></span><span>Rolagem</span><span>Atributo</span></div>
          ${Object.entries(attrs).map(([k, rotulo]) => `
            <div class="t20g-atr-linha">
              <span class="t20g-atr-nome"><i class="fa-solid ${ICONES[k] ?? 'fa-star'}"></i> ${rotulo}</span>
              <span class="t20g-atr-num">${t[k]}</span>
              <strong class="t20g-atr-total">${converter(t[k])}</strong>
            </div>`).join('')}`;
        if (btnAplicar) btnAplicar.disabled = dados.some(d => d === null) || atribuicao.some(a => !a);
      };

      const rolar = async (i) => {
        const roll = await new Roll('1d6').evaluate();
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor }),
          flavor: `Valkaria — dado ${i + 1} de ${N} (1d6)`
        });
        dados[i] = roll.total;
        const chip = el.querySelector(`.t20g-atr-valk-dado[data-i="${i}"]`);
        chip.querySelector('.t20g-atr-rolar-dado').disabled = true;
        chip.querySelector('.t20g-atr-valk-res').textContent = roll.total;
        chip.querySelector('select').disabled = false;
        atualizarTabela();
      };

      el.querySelectorAll('.t20g-atr-rolar-dado').forEach(btn => btn.addEventListener('click', () => {
        const i = Number(btn.closest('.t20g-atr-valk-dado').dataset.i);
        if (dados[i] === null) rolar(i);
      }));
      el.querySelector('.t20g-atr-rolar-todos')?.addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        for (let i = 0; i < N; i++) if (dados[i] === null) await rolar(i);
      });
      el.querySelectorAll('.t20g-atr-valk-dados select').forEach(sel => sel.addEventListener('change', () => {
        atribuicao[Number(sel.dataset.i)] = sel.value;
        atualizarTabela();
      }));
      atualizarTabela();
    },
    rejectClose: false
  });

  if (!resultado || resultado === 'cancelar') return;

  const bases = {};
  for (const k of Object.keys(attrs)) bases[k] = 8;
  resultado.atribuicao.forEach((k, i) => { if (k) bases[k] += resultado.dados[i]; });
  for (const k of Object.keys(bases)) bases[k] = converter(bases[k]);

  const ok = await confirmarAplicar(actor, bases, null, 'Valkaria (7d6 sobre base 8, Heróis de Arton p.281).');
  if (!ok) ui.notifications.info('Definição cancelada — a rolagem continua no chat.');
}

/* ─── Nimb (7d20, descarta o menor) ───────────────────────────────────── */

async function abrirNimb(actor) {
  const N = 7;
  const dados = new Array(N).fill(null); // resultados individuais dos d20

  const slots = Array.from({ length: N }, (_, i) => `
    <div class="t20g-atr-slot" data-i="${i}">
      <button type="button" class="t20g-atr-rolar"><i class="fa-solid fa-dice-d20"></i> Rolar d20</button>
      <span class="t20g-atr-dados">—</span>
      <strong class="t20g-atr-conv">?</strong>
    </div>`).join('');

  const resultado = await DialogV2.wait({
    window: { title: `Nimb — ${actor.name}`, icon: 'fa-solid fa-dice-d20' },
    position: { width: 460 },
    content: `
      <div class="t20g-atr-acoes">
        ${botaoAjuda()}
        <button type="button" class="t20g-atr-rolar-todos"><i class="fa-solid fa-forward"></i> Rolar restantes</button>
      </div>
      ${slots}
      <div class="t20g-atr-dist"></div>`,
    buttons: [
      {
        action: 'aplicar', label: 'Aplicar', icon: 'fa-solid fa-check', default: true,
        callback: (ev, btn, dialog) => dialog._entradas
          ? lerDistribuicao(dialog.element.querySelector('.t20g-atr-dist'), dialog._entradas)
          : 'cancelar'
      },
      { action: 'cancelar', label: 'Cancelar' }
    ],
    render: (ev, dialog) => {
      const el = dialog.element;
      wireAjuda(el, 'Como funciona — Nimb', () => `
        <p>Role 7d20, um a um, e <b>descarte o menor</b>. Aplique os seis valores restantes
        nos atributos e converta pela tabela abaixo — já com os extremos fixos do método:
        1–3 vira <b>−3</b> (você será muito ruim em algo) e um 20 vira um espantoso
        <b>5</b> — valor impossível em qualquer outro método.</p>
        ${tabelaConversaoNimbHtml()}
        <p>Pode gerar personagens muito poderosos (ou muito fracos!) e praticamente garante
        um grupo desequilibrado. Use por sua conta e risco!</p>
        <p class="notes">Fonte: Heróis de Arton p.281.</p>`);
      const btnAplicar = el.querySelector('button[data-action="aplicar"]');
      if (btnAplicar) btnAplicar.disabled = true;

      const atualizar = () => {
        dados.forEach((d, i) => {
          if (d === null) return;
          const slot = el.querySelector(`.t20g-atr-slot[data-i="${i}"]`);
          slot.querySelector('.t20g-atr-dados').innerHTML = `<b>${d}</b>`;
          slot.querySelector('.t20g-atr-conv').textContent = `${d} → ${converterNimb(d)}`;
          slot.querySelector('.t20g-atr-rolar').disabled = true;
        });
        if (dados.some(d => d === null)) return;

        // Todos rolados: descarta o MENOR (primeiro, em caso de empate)
        let menor = 0;
        dados.forEach((d, i) => { if (d < dados[menor]) menor = i; });
        const slotMenor = el.querySelector(`.t20g-atr-slot[data-i="${menor}"]`);
        slotMenor.querySelector('.t20g-atr-dados').innerHTML = `<del>${dados[menor]}</del>`;
        slotMenor.querySelector('.t20g-atr-conv').textContent = 'descartado';

        const mantidos = dados.filter((_, i) => i !== menor);
        const entradas = mantidos.map(v => ({ valor: converterNimb(v), rotulo: `${v} → ${converterNimb(v)}` }));
        montarDistribuicao(el.querySelector('.t20g-atr-dist'), entradas);
        dialog._entradas = entradas;
        if (btnAplicar) btnAplicar.disabled = false;
      };

      const rolar = async (i) => {
        const roll = await new Roll('1d20').evaluate();
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor }),
          flavor: `Nimb — dado ${i + 1} de ${N} (1d20)`
        });
        dados[i] = roll.total;
        atualizar();
      };

      el.querySelectorAll('.t20g-atr-rolar').forEach(btn => btn.addEventListener('click', () => {
        const i = Number(btn.closest('.t20g-atr-slot').dataset.i);
        if (dados[i] === null) rolar(i);
      }));
      el.querySelector('.t20g-atr-rolar-todos')?.addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        for (let i = 0; i < N; i++) if (dados[i] === null) await rolar(i);
      });
    },
    rejectClose: false
  });

  if (!resultado || resultado === 'cancelar') return;

  const ok = await confirmarAplicar(actor, resultado, null, 'Nimb (7d20 descartando o menor, Heróis de Arton p.281).');
  if (!ok) ui.notifications.info('Definição cancelada — a rolagem continua no chat.');
}

/* ─── Arranjo Khalmyr ─────────────────────────────────────────────────── */

async function abrirArranjo(actor) {
  const a = ARRANJO_KHALMYR;

  const resultado = await DialogV2.wait({
    window: { title: `Khalmyr — ${actor.name}`, icon: 'fa-solid fa-table-cells' },
    position: { width: 460 },
    content: `
      <div class="t20g-atr-acoes">${botaoAjuda()}<span class="notes">Conjunto fixo: <b>${a.valores.join(', ')}</b> — sem rolagens</span></div>
      <div class="t20g-atr-dist"></div>`,
    buttons: [
      {
        action: 'aplicar', label: 'Aplicar', icon: 'fa-solid fa-check', default: true,
        callback: (ev, btn, dialog) =>
          lerDistribuicao(dialog.element.querySelector('.t20g-atr-dist'), dialog._entradas)
      },
      { action: 'cancelar', label: 'Cancelar' }
    ],
    render: (ev, dialog) => {
      const el = dialog.element;
      wireAjuda(el, 'Como funciona — Khalmyr', () => `
        <p>Distribua o conjunto <b>fixo</b> ${a.valores.join(', ')} entre os atributos, sem
        rolar nada — zero conta na sessão 0.</p>
        <p>Gera personagens interessantes (com pontos fortes e fracos), mas completamente
        equilibrados entre si, já que todos do grupo terão os mesmos valores.</p>
        <p class="notes">Fonte: Heróis de Arton p.281.</p>`);
      dialog._entradas = a.valores.map(v => ({ valor: v, rotulo: String(v) }));
      montarDistribuicao(el.querySelector('.t20g-atr-dist'), dialog._entradas);
    },
    rejectClose: false
  });

  if (!resultado || resultado === 'cancelar') return;

  const ok = await confirmarAplicar(actor, resultado, null,
    `Khalmyr (${a.valores.join(', ')}, Heróis de Arton p.281).`);
  if (!ok) return abrirArranjo(actor);
}

/* ─── Seleção de método ───────────────────────────────────────────────── */

const METODOS = [
  { key: 'compra', nome: 'Compra por Pontos', fonte: 'T20 p.17', desc: () => `Escolha o total de pontos (sugestão da mesa: ${Number(game.settings.get(MODULE_ID, 'atributosPontos')) || 10}) e distribua — custos configuráveis pelo mestre.` },
  { key: 'rolagem', nome: 'Rolagem padrão', fonte: 'T20 p.17', desc: () => '4d6, descarta o menor; distribua como quiser.' },
  { key: 'classica', nome: 'Clássica', fonte: 'Heróis de Arton p.280', desc: () => '3d6 direto — heróis do povo, clima brutal.' },
  { key: 'epica', nome: 'Épica', fonte: 'Heróis de Arton p.280', desc: () => '3d6+6 descartando o menor — heróis "escolhidos".' },
  { key: 'valkaria', nome: 'Valkaria', fonte: 'Heróis de Arton p.281', desc: () => '7d6 aplicados livremente sobre base 8.' },
  { key: 'nimb', nome: 'Nimb', fonte: 'Heróis de Arton p.281', desc: () => '7d20 descartando o menor — de −3 a 5. Conta e risco!' },
  { key: 'predefinido', nome: 'Khalmyr', fonte: 'Heróis de Arton p.281', desc: () => 'Conjunto fixo 3, 3, 2, 1, 0, −1 — sem rolagens, grupo equilibrado.' }
];

export async function abrirDefinicaoAtributos(actor) {
  if (!actor || actor.type !== 'character') {
    return ui.notifications.warn('A definição de atributos vale apenas para Personagens de Jogador.');
  }

  /* Método padrão da campanha (configurado pelo mestre): pré-selecionado
   * e destacado; sem configuração, o primeiro da lista fica marcado. */
  let metodoPadrao = '';
  try { metodoPadrao = game.settings.get(MODULE_ID, 'atributosMetodoPadrao') ?? ''; }
  catch { metodoPadrao = ''; }
  // Mundos que configuraram o antigo "Pontos Variados" caem na Compra.
  if (metodoPadrao === 'pontosVariados') metodoPadrao = 'compra';
  if (!METODOS.some(m => m.key === metodoPadrao)) metodoPadrao = '';

  const radios = METODOS.map((m, i) => {
    const ehPadrao = m.key === metodoPadrao;
    const marcado = metodoPadrao ? ehPadrao : i === 0;
    return `
    <label class="t20g-atr-metodo ${ehPadrao ? 't20g-atr-metodo-padrao' : ''}">
      <input type="radio" name="metodo" value="${m.key}" ${marcado ? 'checked' : ''}>
      <span><b>${m.nome}</b> <em>(${m.fonte})</em>
        ${ehPadrao ? '<span class="t20g-atr-badge"><i class="fa-solid fa-star"></i> Padrão da mesa</span>' : ''}
        <br><span class="notes">${m.desc()}</span></span>
    </label>`;
  }).join('');

  const escolha = await DialogV2.wait({
    window: { title: `Definir atributos iniciais — ${actor.name}`, icon: 'fa-solid fa-dice-d20' },
    position: { width: 440 },
    content: `<div class="t20g-atr-metodos">${radios}</div>`,
    buttons: [
      {
        action: 'continuar', label: 'Continuar', icon: 'fa-solid fa-arrow-right', default: true,
        callback: (ev, btn) => btn.form.elements.metodo.value
      },
      { action: 'cancelar', label: 'Cancelar' }
    ],
    rejectClose: false
  });
  if (!escolha || escolha === 'cancelar') return;

  switch (escolha) {
    case 'compra': return abrirEscolhaPontos(actor);
    case 'rolagem':
    case 'classica':
    case 'epica': return abrirRolagem(actor, escolha);
    case 'valkaria': return abrirValkaria(actor);
    case 'nimb': return abrirNimb(actor);
    case 'predefinido': return abrirArranjo(actor);
  }
}

/* ─── Hooks ───────────────────────────────────────────────────────────── */

Hooks.once('init', () => {
  registrarConfiguracoes();
});

Hooks.once('ready', () => {
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = { ...(mod.api ?? {}), definirAtributos: abrirDefinicaoAtributos };
});

/* Ficha nova (atributos base todos zerados): oferece o definidor direto no
 * cabeçalho da ficha, junto de Protótipo de Token/Configurações. Some assim
 * que os atributos são definidos — o update re-renderiza a ficha e o botão
 * deixa de ser incluído. */
Hooks.on('getActorSheetHeaderButtons', (sheet, buttons) => {
  const actor = sheet.actor ?? sheet.object;
  if (actor?.type !== 'character' || !sheet.isEditable) return;

  const zerado = Object.values(actor.system?.atributos ?? {}).every(a => !a?.base);
  if (!zerado) return;

  buttons.unshift({
    label: 'Definir Atributos',
    class: 't20g-atr-header',
    icon: 'fa-solid fa-dice-d20',
    onclick: () => abrirDefinicaoAtributos(actor)
  });
});

/* O cabeçalho do App V1 só é montado no primeiro render; updates do ator
 * re-renderizam apenas o conteúdo. Este hook esconde o botão assim que os
 * atributos deixam de estar zerados (e o devolve se voltarem a zero). */
Hooks.on('renderActorSheet', (app) => {
  const actor = app.actor;
  if (actor?.type !== 'character') return;
  const btn = app.element?.find?.('.header-button.t20g-atr-header');
  if (!btn?.length) return;
  const zerado = Object.values(actor.system?.atributos ?? {}).every(a => !a?.base);
  btn.toggle(zerado);
});

/* Injeta o botão em "Configurações de Personagem" (ActorSettings, App V1). */
Hooks.on('renderActorSettings', (app, html) => {
  const actor = app.object;
  if (actor?.type !== 'character') return;

  const $html = html instanceof jQuery ? html : $(html);
  if ($html.find('.t20g-atr-abrir').length) return;

  const $secao = $(`
    <h2>Atributos Iniciais</h2>
    <div class="form-group">
      <label>Definir pontos de atributo</label>
      <button type="button" class="t20g-atr-abrir">
        <i class="fa-solid fa-dice-d20"></i> Definir…
      </button>
    </div>`);
  $secao.filter('.form-group').find('.t20g-atr-abrir').on('click', () => {
    app.close();
    abrirDefinicaoAtributos(actor);
  });
  $html.find('button[type="submit"]').before($secao);
  app.setPosition({ height: 'auto' });
});
