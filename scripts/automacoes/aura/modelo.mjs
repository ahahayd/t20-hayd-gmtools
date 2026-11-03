/**
 * Modelo de Aura — regras puras.
 *
 * A Aura Sagrada tem os parâmetros fixos no catálogo. O Modelo de Aura deixa
 * o usuário montar qualquer aura no próprio item: a configuração mora numa
 * flag do item e vira, aqui, o mesmo bloco `aura` que o motor já consome.
 * Assim geometria, efeitos, lembrete e prévia são os mesmos das auras do
 * catálogo — nada é duplicado.
 *
 * Nada aqui toca em documentos do Foundry: o cálculo das fórmulas recebe os
 * dados de rolagem já montados e um avaliador injetável, para os testes.
 */

/** Flag no ITEM com a configuração do modelo. */
export const FLAG_MODELO = 'auraModelo';

/** Modos de Efeito Ativo (CONST.ACTIVE_EFFECT_MODES). */
export const MODOS = [
  { id: 2, rotulo: 'Somar' },
  { id: 1, rotulo: 'Multiplicar' },
  { id: 5, rotulo: 'Substituir' },
  { id: 4, rotulo: 'Melhorar (o maior vence)' },
  { id: 3, rotulo: 'Piorar (o menor vence)' },
  { id: 0, rotulo: 'Personalizado' }
];

/** Onde um efeito de uso aparece na janela de rolagem do T20. */
export const USOS = ['attack', 'skill', 'ability', 'power', 'spell', 'equipment', 'consumable'];

/** Campos mais pedidos, sugeridos na lista do editor (o campo aceita qualquer um). */
export const CAMPOS_SUGERIDOS = [
  { key: 'system.modificadores.pericias.resistencia', rotulo: 'Testes de resistência' },
  { key: 'system.modificadores.pericias.geral', rotulo: 'Todas as perícias' },
  { key: 'system.modificadores.pericias.ataque', rotulo: 'Testes de ataque' },
  { key: 'system.modificadores.dano.geral', rotulo: 'Dano (todos)' },
  { key: 'system.modificadores.dano.cac', rotulo: 'Dano corpo a corpo' },
  { key: 'system.modificadores.dano.dist', rotulo: 'Dano à distância' },
  { key: 'system.modificadores.dano.mag', rotulo: 'Dano mágico' },
  { key: 'system.attributes.defesa.bonus', rotulo: 'Defesa' },
  { key: 'system.attributes.movimento.walk.base', rotulo: 'Deslocamento' },
  { key: 'system.atributos.for.value', rotulo: 'Força' },
  { key: 'system.atributos.des.value', rotulo: 'Destreza' },
  { key: 'system.atributos.con.value', rotulo: 'Constituição' },
  { key: 'system.atributos.int.value', rotulo: 'Inteligência' },
  { key: 'system.atributos.sab.value', rotulo: 'Sabedoria' },
  { key: 'system.atributos.car.value', rotulo: 'Carisma' },
  { key: 'ataque', rotulo: 'Ataque (efeito de uso)' },
  { key: 'dano', rotulo: 'Dano (efeito de uso)' },
  { key: 'pericia', rotulo: 'Perícia (efeito de uso)' },
  { key: 'cd', rotulo: 'CD (efeito de uso)' }
];

/** Um efeito novo, do jeito que o botão "Adicionar efeito" cria. */
export function efeitoPadrao(tipo = 'passivo') {
  return {
    id: '',
    nome: '',
    tipo,
    alvos: { aliados: true, neutros: false, inimigos: false, fonte: true },
    usos: Object.fromEntries(USOS.map((u) => [u, true])),
    mudancas: [],
    condicoes: [],
    resistencia: resistenciaPadrao()
  };
}

/* ─── Teste de resistência ───────────────────────────────────────────────── */

/** Testes que um efeito pode pedir. */
export const TESTES = [
  { id: 'fort', rotulo: 'Fortitude' },
  { id: 'refl', rotulo: 'Reflexos' },
  { id: 'vont', rotulo: 'Vontade' }
];

/** Atributos que entram na CD. */
export const ATRIBUTOS = ['for', 'des', 'con', 'int', 'sab', 'car'];

/**
 * Quando o alvo testa:
 * - `entrar`: uma vez ao entrar na área (sair e voltar testa de novo);
 * - `turnoFonte`: no início de cada turno da fonte, todos na área;
 * - `turnoAlvo`: no início do turno de cada alvo que está na área.
 * Nos dois por turno, quem entra no meio da rodada só é afetado depois do
 * primeiro teste.
 */
export const MOMENTOS = ['entrar', 'turnoFonte', 'turnoAlvo'];

/* ─── Dano ───────────────────────────────────────────────────────────────── */

/** Quando o dano é causado: ao ligar a aura ou a cada início de turno. */
export const MOMENTOS_DANO = ['ativar', 'turnoFonte', 'turnoAlvo'];

/** O que um sucesso no teste faz com o dano. */
export const SUCESSOS_DANO = ['metade', 'anula'];

export function danoPadrao() {
  return {
    id: '',
    nome: '',
    formula: '',
    tipo: '',
    quando: 'turnoFonte',
    alvos: { aliados: false, neutros: false, inimigos: true, fonte: false },
    resistencia: { ...resistenciaPadrao(), teste: 'refl', sucesso: 'metade' }
  };
}

function normalizarDano(d, i) {
  return {
    id: typeof d?.id === 'string' && d.id ? d.id : `dano${i}`,
    nome: typeof d?.nome === 'string' ? d.nome.trim() : '',
    formula: String(d?.formula ?? '').trim(),
    tipo: String(d?.tipo ?? '').trim(),
    quando: MOMENTOS_DANO.includes(d?.quando) ? d.quando : 'turnoFonte',
    alvos: normalizarAlvos(d?.alvos ?? { aliados: false, inimigos: true, fonte: false }),
    resistencia: {
      ...normalizarResistencia(d?.resistencia),
      sucesso: SUCESSOS_DANO.includes(d?.resistencia?.sucesso) ? d.resistencia.sucesso : 'metade'
    }
  };
}

/** Dano que sobra depois do teste. */
export function danoFinal(total, resistencia, passou) {
  const n = Math.max(0, Math.trunc(Number(total) || 0));
  if (!resistencia?.ativa || !passou) return n;
  return resistencia.sucesso === 'anula' ? 0 : Math.floor(n / 2);
}

export function resistenciaPadrao() {
  return { ativa: false, teste: 'vont', atributo: 'car', bonus: 0, quando: 'entrar' };
}

export function normalizarResistencia(bruto) {
  const r = bruto && typeof bruto === 'object' ? bruto : {};
  return {
    ativa: !!r.ativa,
    teste: TESTES.some((x) => x.id === r.teste) ? r.teste : 'vont',
    atributo: ATRIBUTOS.includes(r.atributo) ? r.atributo : 'car',
    bonus: Math.trunc(Number(r.bonus) || 0),
    quando: MOMENTOS.includes(r.quando) ? r.quando : 'entrar'
  };
}

/** CD do T20: 10 + metade do nível + atributo da fonte + bônus extra. */
export function cdDaResistencia(res, dadosFonte = {}) {
  const nivel = Number(dadosFonte.nivel) || 0;
  const atributo = Number(dadosFonte[res.atributo]) || 0;
  return 10 + Math.floor(nivel / 2) + atributo + (Number(res.bonus) || 0);
}

/**
 * O que fazer com um alvo de efeito resistível agora.
 * `registro` é o último teste dele ({ passou }) ou nada.
 * @returns {'rolar'|'aplicar'|'poupar'}
 */
export function situacaoDoAlvo(res, registro) {
  if (!registro) return res.quando === 'entrar' ? 'rolar' : 'poupar';
  return registro.passou ? 'poupar' : 'aplicar';
}

/** Uma Aura Sagrada: o ponto de partida de quem abre o editor pela primeira vez. */
export function modeloPadrao() {
  return {
    raio: 9,
    bloqueavel: true,
    ignoraDiagonal: false,
    ocultos: false,
    custo: 0,
    lembrete: true,
    efeitos: [{
      ...efeitoPadrao('passivo'),
      id: 'ef0',
      mudancas: [{ key: 'system.modificadores.pericias.resistencia', mode: 2, valor: '@car' }]
    }],
    aprimoramentos: [],
    danos: []
  };
}

const num = (v, padrao = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : padrao;
};

const lista = (v) => (Array.isArray(v) ? v : Object.values(v && typeof v === 'object' ? v : {}));
const modoValido = (m) => (MODOS.some((x) => x.id === Number(m)) ? Number(m) : 2);

function normalizarLinhas(bruto) {
  return lista(bruto)
    .map((m) => ({
      key: String(m?.key ?? '').trim(),
      mode: modoValido(m?.mode),
      valor: String(m?.valor ?? '').trim()
    }))
    .filter((m) => m.key && m.valor);
}

function normalizarAlvos(alvos) {
  const a = alvos && typeof alvos === 'object' ? alvos : {};
  return {
    aliados: a.aliados !== false,
    neutros: !!a.neutros,
    inimigos: !!a.inimigos,
    fonte: a.fonte !== false
  };
}

/**
 * Um efeito da aura: passivo (vale sempre) ou de uso (opção na rolagem),
 * com as próprias linhas, condições e o próprio público — uma aura pode dar
 * bônus aos aliados e penalidade aos inimigos ao mesmo tempo.
 */
function normalizarEfeito(e, i) {
  const tipo = e?.tipo === 'uso' ? 'uso' : 'passivo';
  return {
    id: typeof e?.id === 'string' && e.id ? e.id : `ef${i}`,
    nome: typeof e?.nome === 'string' ? e.nome.trim() : '',
    tipo,
    alvos: normalizarAlvos(e?.alvos),
    usos: Object.fromEntries(USOS.map((u) => [u, !!e?.usos?.[u]])),
    mudancas: normalizarLinhas(e?.mudancas),
    // Condição numa opção de rolagem não faz sentido: só no passivo.
    condicoes: tipo === 'passivo' && Array.isArray(e?.condicoes)
      ? [...new Set(e.condicoes.filter((c) => typeof c === 'string' && c))]
      : [],
    resistencia: normalizarResistencia(e?.resistencia)
  };
}

/**
 * Aprimoramento: "+N PM" que o jogador escolhe ao ativar a aura.
 *
 * Um aprimoramento pode mexer em várias coisas de uma vez (+1 em ataque,
 * dano e Defesa por 2 PM): cada linha diz em qual efeito, qual campo e
 * quanto. `acao: 'aumentar'` soma `valor` à linha daquele efeito com o
 * mesmo campo; `acao: 'novo'` acrescenta uma linha nele. `maximo` > 1
 * deixa comprar várias vezes (cada compra soma de novo e custa de novo).
 */
function normalizarLinhaDeAprimoramento(l) {
  return {
    acao: l?.acao === 'novo' ? 'novo' : 'aumentar',
    efeito: String(l?.efeito ?? ''),
    key: String(l?.key ?? '').trim(),
    mode: modoValido(l?.mode),
    valor: String(l?.valor ?? '').trim()
  };
}

function normalizarAprimoramento(a, i) {
  // Primeira versão: uma linha só, com os campos na raiz do aprimoramento.
  const brutas = a?.linhas ? lista(a.linhas) : [a];
  return {
    id: typeof a?.id === 'string' && a.id ? a.id : `apr${i}`,
    nome: String(a?.nome ?? '').trim(),
    custo: Math.max(0, Math.trunc(num(a?.custo, 1))),
    maximo: Math.max(1, Math.trunc(num(a?.maximo, 1))),
    linhas: brutas.map(normalizarLinhaDeAprimoramento)
  };
}

/** Configuração gravada → formato garantido. Lixo vira o padrão, nunca erro. */
export function normalizarModelo(bruto) {
  if (!bruto || typeof bruto !== 'object') return null;
  const padrao = modeloPadrao();

  // Primeira versão: um efeito só, com `tipo`, `mudancas` e `alvos` na raiz.
  const brutos = Array.isArray(bruto.efeitos) || (bruto.efeitos && !('passivo' in bruto.efeitos))
    ? lista(bruto.efeitos)
    : [{
      id: 'ef0', nome: bruto.nome, tipo: bruto.tipo, alvos: bruto.alvos,
      usos: bruto.usos, mudancas: bruto.mudancas, condicoes: bruto.condicoes
    }];
  const efeitos = brutos.map(normalizarEfeito);
  const ids = new Set(efeitos.map((e) => e.id));

  return {
    raio: Math.max(0, num(bruto.raio, padrao.raio)),
    bloqueavel: bruto.bloqueavel !== false,
    ignoraDiagonal: !!bruto.ignoraDiagonal,
    ocultos: !!(bruto.ocultos ?? bruto.alvos?.ocultos),
    custo: Math.max(0, Math.trunc(num(bruto.custo))),
    lembrete: bruto.lembrete !== false,
    efeitos,
    danos: lista(bruto.danos).map(normalizarDano)
      .filter((d) => d.formula && (d.alvos.aliados || d.alvos.neutros || d.alvos.inimigos || d.alvos.fonte)),
    aprimoramentos: lista(bruto.aprimoramentos)
      .map(normalizarAprimoramento)
      .map((a) => ({
        ...a,
        linhas: a.linhas
          // Sem efeito escolhido, vai para o primeiro
          .map((l) => (ids.has(l.efeito) ? l : { ...l, efeito: efeitos[0]?.id ?? '' }))
          .filter((l) => l.key && l.valor && l.efeito)
      }))
      .filter((a) => a.linhas.length)
  };
}

const temPublico = (alvos) => alvos.aliados || alvos.neutros || alvos.inimigos || alvos.fonte;

/** O efeito afeta alguém e tem algo para dar? */
function efeitoUtil(efeito) {
  return temPublico(efeito.alvos) && (efeito.mudancas.length > 0 || efeito.condicoes.length > 0);
}

/** Dá para ligar? Precisa de raio e de ao menos um efeito útil. */
export function modeloValido(config) {
  const c = normalizarModelo(config);
  return !!c && c.raio > 0 && (c.efeitos.some(efeitoUtil) || c.danos.length > 0);
}

/** Disposições de `alvoElegivel` para um público. */
export function disposicoesDe(alvos) {
  const saida = [];
  if (alvos.aliados) saida.push('FRIENDLY');
  if (alvos.neutros) saida.push('NEUTRAL');
  if (alvos.inimigos) saida.push('HOSTILE');
  return saida;
}

/** Este efeito vale para este token? `quem` = { disposicao, ehFonte }. */
export function efeitoAfeta(alvos, quem = {}) {
  if (quem.ehFonte) return !!alvos.fonte;
  return disposicoesDe(alvos).includes(quem.disposicao);
}

/* ─── Aprimoramentos ─────────────────────────────────────────────────────── */

/**
 * Quantas vezes cada aprimoramento foi escolhido, dentro do máximo.
 * Escolha de aprimoramento que não existe mais no modelo é descartada.
 */
export function normalizarEscolhas(config, escolhas) {
  const saida = {};
  for (const a of config?.aprimoramentos ?? []) {
    const n = Math.min(a.maximo, Math.max(0, Math.trunc(num(escolhas?.[a.id]))));
    if (n > 0) saida[a.id] = n;
  }
  return saida;
}

/** PM total dos aprimoramentos escolhidos. */
export function custoDasEscolhas(config, escolhas) {
  const n = normalizarEscolhas(config, escolhas);
  return (config?.aprimoramentos ?? []).reduce((soma, a) => soma + a.custo * (n[a.id] ?? 0), 0);
}

/**
 * Linhas de um efeito já com os aprimoramentos aplicados (ainda fórmulas).
 *
 * "Aumentar" sem linha daquele campo vira linha nova: o aprimoramento nunca
 * some só porque o usuário apagou a linha base.
 */
export function linhasComAprimoramentos(config, efeito, escolhas) {
  const linhas = efeito.mudancas.map((m) => ({ ...m }));
  const n = normalizarEscolhas(config, escolhas);

  for (const a of config.aprimoramentos) {
    const vezes = n[a.id] ?? 0;
    if (!vezes) continue;
    for (const l of a.linhas) {
      if (l.efeito !== efeito.id) continue;
      const extra = vezes > 1 ? `(${l.valor}) * ${vezes}` : `(${l.valor})`;

      const alvo = l.acao === 'aumentar' ? linhas.find((m) => m.key === l.key) : null;
      if (alvo) {
        alvo.valor = `(${alvo.valor}) + ${extra}`;
      } else {
        linhas.push({ key: l.key, mode: l.mode, valor: l.mode === 2 ? extra : l.valor });
      }
    }
  }
  return linhas;
}

/* ─── Fórmulas ───────────────────────────────────────────────────────────── */

/** Alguma fórmula olha para o alvo? Então cada um recebe um valor diferente. */
export function dependeDoAlvo(config) {
  const formulas = [
    ...(config?.efeitos ?? []).flatMap((e) => e.mudancas),
    ...(config?.aprimoramentos ?? []).flatMap((a) => a.linhas)
  ];
  return formulas.some((m) => /@alvo\./.test(m.valor));
}

function caminho(dados, trecho) {
  let atual = dados;
  for (const parte of trecho.split('.')) {
    if (atual === null || atual === undefined) return undefined;
    atual = atual[parte];
  }
  // `@car` aponta para {value} em algumas fichas e para número em outras
  if (atual && typeof atual === 'object' && 'value' in atual) atual = atual.value;
  return atual;
}

/** Só aritmética sobra depois da troca? Então é número, não texto. */
const SO_CONTA = /^[\d\s+\-*/%().,]*(?:(?:floor|ceil|round|max|min|abs)[\d\s+\-*/%().,]*)*$/;

/** Avaliador padrão: o `Roll.safeEval` do Foundry quando existe. */
function avaliarPadrao(expr) {
  // Chamado pela classe: o safeEval lê `this.MATH_PROXY`. Solto, ele lançava
  // erro e a fórmula ia crua para o efeito ("(1) + (1) * 3").
  const Roll = globalThis.Roll;
  if (typeof Roll?.safeEval === 'function') return Roll.safeEval(expr);
  // eslint-disable-next-line no-new-func
  return Function('floor', 'ceil', 'round', 'max', 'min', 'abs', `"use strict"; return (${expr});`)(
    Math.floor, Math.ceil, Math.round, Math.max, Math.min, Math.abs
  );
}

/**
 * Resolve uma fórmula do editor.
 *
 * `@car`, `@nivel`, `@pericias.luta` vêm da FONTE; `@alvo.car` vem de quem
 * recebe. Só aritmética depois da troca vira número; sobra dado ou texto
 * (`1d6+3`), o texto vai como está para o sistema.
 *
 * @returns {string|number|null} null quando um @ não existe (alvo ausente)
 */
export function resolverFormula(formula, fonte = {}, alvo = null, avaliar = avaliarPadrao) {
  let faltou = false;
  const trocado = String(formula ?? '').replace(/@([a-zA-Z_][\w.]*)/g, (_m, trecho) => {
    const ehAlvo = trecho.startsWith('alvo.');
    const dados = ehAlvo ? alvo : fonte;
    const valor = dados ? caminho(dados, ehAlvo ? trecho.slice(5) : trecho) : undefined;
    if (valor === undefined || valor === null || valor === '') {
      faltou = true;
      return '0';
    }
    return String(valor);
  });
  if (faltou && alvo === null && /@alvo\./.test(formula)) return null;

  const expr = trocado.trim();
  if (!expr) return null;
  if (SO_CONTA.test(expr)) {
    try {
      const n = Number(avaliar(expr));
      if (Number.isFinite(n)) return Math.trunc(n) === n ? n : Math.floor(n);
    } catch { /* cai no texto */ }
  }
  return expr;
}

/**
 * Mudanças concretas de uma lista de linhas para um alvo.
 *
 * Número CONCRETO, como na Aura Sagrada: o sistema simplifica os
 * modificadores na preparação e um @ deixado no efeito congelaria no valor
 * da hora em que foi escrito — ou pior, leria o atributo de quem recebe.
 * Um bônus 0 somado não entra (evita efeito vazio na ficha).
 */
export function mudancasPara(linhas, fonte, alvo, avaliar = avaliarPadrao) {
  const saida = [];
  for (const m of linhas ?? []) {
    const valor = resolverFormula(m.valor, fonte, alvo, avaliar);
    if (valor === null) continue;
    if (valor === 0 && m.mode === 2) continue;
    saida.push({ key: m.key, mode: m.mode, value: String(valor), priority: 20 });
  }
  return saida;
}

/** Rótulo curto para o nome do efeito: "+3" quando é um bônus só. */
export function rotuloDasMudancas(changes) {
  if (changes.length !== 1 || changes[0].mode !== 2) return '';
  const n = Number(changes[0].value);
  if (!Number.isFinite(n)) return changes[0].value;
  return n >= 0 ? `+${n}` : String(n);
}

/* ─── Bloco `aura` para o motor ──────────────────────────────────────────── */

/** Público somado de todos os efeitos: é quem a geometria precisa achar. */
function publicoTotal(config) {
  const total = { aliados: false, neutros: false, inimigos: false, fonte: false };
  for (const e of config.efeitos) {
    if (!efeitoUtil(e)) continue;
    for (const chave of Object.keys(total)) total[chave] ||= e.alvos[chave];
  }
  // Quem só leva dano também precisa ser achado pela geometria
  for (const d of config.danos) {
    for (const chave of Object.keys(total)) total[chave] ||= d.alvos[chave];
  }
  return total;
}

/**
 * Converte a configuração no bloco `aura` que o motor das auras usa.
 *
 * `partes(fonte, alvo, escolhas)` devolve um efeito por efeito configurado,
 * cada um com o seu público (`alvos`) para o motor filtrar por token.
 * Recebe ATORES; os dados de rolagem são montados por `lerDados`, injetado
 * para manter este arquivo puro.
 */
export function specDoModelo(bruto, { lerDados = () => ({}), condicao = () => null } = {}) {
  const config = normalizarModelo(bruto);
  if (!modeloValido(config)) return null;

  const porAlvo = dependeDoAlvo(config);
  const publico = publicoTotal(config);

  // O T20 só oferece o efeito de uso nas rolagens dos tipos marcados nele;
  // sem nenhum marcado ele nunca apareceria, então vale para todos.
  const flagsDe = (e) => {
    if (e.tipo !== 'uso') return { onuse: false, custo: '0' };
    const marcados = USOS.filter((u) => e.usos[u]);
    return {
      onuse: true,
      custo: '0',
      ...Object.fromEntries((marcados.length ? marcados : USOS).map((u) => [u, true]))
    };
  };

  const partes = (fonte, alvo = null, escolhas = {}) => {
    const dadosFonte = lerDados(fonte);
    const dadosAlvo = porAlvo && alvo ? lerDados(alvo) : null;
    return config.efeitos.filter(efeitoUtil).map((e) => {
      const changes = mudancasPara(linhasComAprimoramentos(config, e, escolhas), dadosFonte, dadosAlvo);
      const extras = e.condicoes.map((id) => condicao(id)).filter(Boolean);
      return {
        parte: e.id,
        nome: e.nome || null,
        alvos: e.alvos,
        rotulo: rotuloDasMudancas(changes),
        changes: [...changes, ...extras.flatMap((c) => c.changes ?? [])],
        statuses: [...e.condicoes],
        flagsT20: flagsDe(e),
        // A fonte nunca testa contra a própria aura
        resistencia: e.resistencia.ativa
          ? { ...e.resistencia, cd: cdDaResistencia(e.resistencia, dadosFonte) }
          : null
      };
    });
  };

  return {
    modelo: config,
    raio: config.raio,
    bloqueavel: config.bloqueavel,
    ignoraDiagonal: config.ignoraDiagonal,
    // Aura Poderosa é do paladino: só amplia as auras do catálogo.
    aceitaModificadores: false,
    custo: config.custo,
    lembrete: config.lembrete,
    disposicoes: disposicoesDe(publico),
    incluirFonte: publico.fonte,
    ocultos: config.ocultos,
    porAlvo,
    aprimoramentos: config.aprimoramentos,
    partes,
    /** Danos com a fórmula já resolvida pela fonte e a CD do teste calculada. */
    danos: (fonte) => {
      const dados = lerDados(fonte);
      return config.danos.map((d) => ({
        ...d,
        formula: String(resolverFormula(d.formula, dados) ?? '0'),
        resistencia: { ...d.resistencia, cd: cdDaResistencia(d.resistencia, dados) }
      }));
    },
    resumo: (fonte, escolhas = {}) => {
      if (porAlvo) return 'varia por alvo';
      const lista = partes(fonte, null, escolhas);
      const rotulos = lista.map((p) => p.rotulo).filter(Boolean);
      if (rotulos.length && rotulos.length === lista.length) return rotulos.join(' / ');
      // Aura só de dano não tem efeito para resumir
      return lista.length ? `${lista.length} efeito(s)` : `${config.danos.length} dano(s)`;
    }
  };
}
