/**
 * Auras — regras puras.
 *
 * Nada aqui toca em documentos do Foundry: é o que permite testar a mecânica
 * (raio, elegibilidade, cura, lembrete por rodada) sem um mundo real.
 *
 * Uma aura é um efeito em raio a partir do personagem que atinge aliados
 * próximos. Os parâmetros que variam de poder para poder — raio e se paredes
 * bloqueiam — vêm do catálogo, não daqui.
 */

/* ─── Estado guardado na ficha da fonte ──────────────────────────────────── */

/**
 * Estado de uma aura ativa. Nada derivável é guardado: raio, bônus e lista de
 * alvos são sempre recalculados, para que ganhar um poder novo ou uma magia de
 * atributo no meio da cena valha na hora.
 */
export function normalizarEstado(bruto) {
  if (!bruto || typeof bruto !== 'object') return null;
  return {
    id: typeof bruto.id === 'string' ? bruto.id : null,
    cena: bruto.cena ?? null,
    token: bruto.token ?? null,
    aviso: marca(bruto.aviso),
    sustentada: marca(bruto.sustentada),
    pedido: bruto.pedido?.id ? { ...bruto.pedido, id: String(bruto.pedido.id) } : null,
    feito: bruto.feito ? String(bruto.feito) : null
  };
}

function marca(valor) {
  if (!valor || typeof valor !== 'object') return null;
  const rodada = Number(valor.rodada);
  return {
    combate: valor.combate ?? null,
    rodada: Number.isFinite(rodada) ? rodada : null
  };
}

/** Todas as auras ativas de uma ficha, já normalizadas. */
export function aurasAtivas(flag) {
  const tudo = flag && typeof flag === 'object' ? flag : {};
  const saida = [];
  for (const [itemId, bruto] of Object.entries(tudo)) {
    const estado = normalizarEstado(bruto);
    if (estado) saida.push({ itemId, ...estado });
  }
  return saida;
}

/* ─── Raio ───────────────────────────────────────────────────────────────── */

/**
 * Raio final em metros. Modificadores (Aura Poderosa) valem para todas as
 * auras da mesma ficha, e o maior vence — dois poderes de ampliação não somam.
 */
export function raioEfetivo(base, modificadores = []) {
  const inicial = Number(base) || 0;
  const maiores = modificadores
    .map((m) => Number(m?.raio) || 0)
    .filter((n) => n > 0);
  return Math.max(inicial, ...maiores, 0);
}

/**
 * A distância medida cabe no raio?
 *
 * A comparação tolera erro de ponto flutuante: 9 m medidos como 9.0000000001
 * não podem ficar de fora por um detalhe de representação binária.
 */
export function dentroDoRaio(distancia, raio) {
  const d = Number(distancia);
  const r = Number(raio);
  if (!Number.isFinite(d) || !Number.isFinite(r)) return false;
  return d <= r + 1e-6;
}

/* ─── Elegibilidade ──────────────────────────────────────────────────────── */

/**
 * Este token pode receber a aura?
 *
 * `dados` é um retrato do token (disposição, oculto, se é a própria fonte),
 * montado por quem tem acesso ao canvas — assim a regra continua pura.
 */
export function alvoElegivel(dados, spec = {}) {
  if (!dados) return false;

  // A fonte entra por ser a fonte: "você e os aliados dentro da aura".
  if (dados.ehFonte) return spec.incluirFonte !== false;

  if (dados.oculto && !spec.ocultos) return false;

  const aceitas = spec.disposicoes ?? ['FRIENDLY'];
  return aceitas.includes(dados.disposicao);
}

/**
 * O que precisa ser criado, atualizado e removido para que o conjunto de
 * alvos com efeito passe a ser exatamente o desejado.
 *
 * Devolver as três listas (em vez de reaplicar tudo) é o que permite não
 * gravar nada quando nada mudou — cada escrita é banco, socket e re-preparo
 * de ficha em todos os clientes.
 */
export function diferencaDeAlvos(atuais = [], desejados = []) {
  const tem = new Set(atuais.filter(Boolean));
  const quer = new Set(desejados.filter(Boolean));
  return {
    criar: [...quer].filter((uuid) => !tem.has(uuid)),
    manter: [...quer].filter((uuid) => tem.has(uuid)),
    remover: [...tem].filter((uuid) => !quer.has(uuid))
  };
}

/* ─── Cura ───────────────────────────────────────────────────────────────── */

/** PV curados por rodada: valor fixo do poder + o atributo da fonte. */
export function curaDaAura(modificador, valorAtributo) {
  if (!modificador?.cura) return 0;
  const fixo = Number(modificador.cura.fixo) || 0;
  const atributo = Number(valorAtributo) || 0;
  return Math.max(0, fixo + atributo);
}

/** Cura sem passar do máximo da ficha; devolve o ganho REAL. */
export function clampCura(atual, maximo, quanto) {
  const pv = Number(atual) || 0;
  const max = Number(maximo) || 0;
  const cura = Math.max(0, Number(quanto) || 0);
  const novo = Math.min(pv + cura, max);
  return { novo, ganho: Math.max(0, novo - pv) };
}

/** Desfaz uma cura já aplicada, sem levar o personagem abaixo de zero. */
export function desfazerCura(atual, ganho) {
  const pv = Number(atual) || 0;
  const devolver = Math.max(0, Number(ganho) || 0);
  return Math.max(0, pv - devolver);
}

/* ─── Lembrete de sustentar ──────────────────────────────────────────────── */

/**
 * Já avisamos nesta rodada?
 *
 * O lembrete do início do turno não pode duplicar quando o Mestre vai e volta
 * na iniciativa, mas precisa voltar na rodada seguinte e em outro encontro.
 */
export function precisaAvisar(estado, { combate, rodada } = {}) {
  const anterior = normalizarEstado(estado)?.aviso;
  if (!anterior) return true;
  if (anterior.combate !== (combate ?? null)) return true;
  return anterior.rodada !== (Number.isFinite(Number(rodada)) ? Number(rodada) : null);
}

/**
 * Há um pedido do jogador que o Mestre ainda não executou?
 *
 * O par pedido/feito é o canal jogador → Mestre sem socket: o jogador escreve
 * na própria ficha, o Mestre executa e marca. Comparar os dois é o que impede
 * o `updateActor` de virar laço infinito.
 */
export function pedidoPendente(estado) {
  const dados = normalizarEstado(estado);
  if (!dados?.pedido?.id) return null;
  return dados.pedido.id === dados.feito ? null : dados.pedido;
}
