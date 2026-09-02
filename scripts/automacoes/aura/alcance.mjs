/**
 * Auras — geometria.
 *
 * Responde "quem está dentro da aura", que é a única parte que precisa do
 * canvas. As regras (raio efetivo, elegibilidade) ficam em `regras.mjs`, puras.
 */
import { dentroDoRaio, alvoElegivel } from './regras.mjs';

/** Nome da disposição do token ('FRIENDLY', 'HOSTILE', 'NEUTRAL', 'SECRET'). */
function nomeDaDisposicao(token) {
  const valor = token?.document?.disposition ?? token?.disposition;
  const tabela = CONST.TOKEN_DISPOSITIONS ?? {};
  return Object.keys(tabela).find((chave) => tabela[chave] === valor) ?? null;
}

/**
 * Posição JÁ GRAVADA do token — nunca a que está sendo animada.
 *
 * A animação de movimento escreve as coordenadas interpoladas dentro do
 * próprio documento, quadro a quadro (`mergeObject(this.document, …)` em
 * `Token##animateFrame`). Ou seja: no meio de um passo, `doc.x` ainda é quase
 * a posição ANTERIOR. Só `_source` guarda o destino confirmado.
 *
 * Era exatamente isto que fazia o bônus entrar e sair só no movimento
 * seguinte: o recálculo acontecia durante a animação e media a posição velha.
 * O pf2e lê `_source` pelo mesmo motivo ("coordinates are changed in real time
 * over the course of movement animation").
 */
function posicaoGravada(doc) {
  const fonte = doc?._source ?? doc ?? {};
  return {
    x: fonte.x ?? doc?.x ?? 0,
    y: fonte.y ?? doc?.y ?? 0,
    elevation: fonte.elevation ?? doc?.elevation ?? 0,
    width: fonte.width ?? doc?.width ?? 1,
    height: fonte.height ?? doc?.height ?? 1
  };
}

/** Centro do token na posição gravada, com elevação (para teste de parede). */
export function centroGravado(token) {
  const doc = token?.document;
  const posicao = posicaoGravada(doc);
  const centro = doc?.getCenterPoint?.(posicao) ?? { x: posicao.x, y: posicao.y };
  return { x: centro.x, y: centro.y, elevation: posicao.elevation };
}

/**
 * Pontos de medição de um token: o centro de cada quadrado que ele ocupa.
 *
 * Uma criatura Grande "a 9 m" está na aura se QUALQUER quadrado dela estiver —
 * medir só pelo centro deixaria de fora criaturas encostadas na borda. Fora de
 * grade (`getOccupiedGridSpaceOffsets` devolve []) sobra o centro mesmo.
 */
function pontosDoToken(token) {
  const doc = token?.document;
  const grade = canvas?.grid;
  const posicao = posicaoGravada(doc);
  const centro = doc?.getCenterPoint?.(posicao) ?? { x: posicao.x, y: posicao.y };

  const offsets = doc?.getOccupiedGridSpaceOffsets?.(posicao) ?? [];
  if (!offsets.length || !grade?.getCenterPoint) return [centro];

  return offsets.map((offset) => grade.getCenterPoint(offset));
}

/**
 * Distância entre dois pontos pela régua padrão do próprio Tormenta20: a
 * grade REAL da cena, sem espelhar nada. É a mesma conta que qualquer alcance
 * de poder ou magia do sistema usa — inclusive a diagonal dobrada, que é o
 * que faz a área de verdade ser um losango, não um círculo (visível em
 * qualquer template nativo do Foundry sobre uma cena do T20).
 *
 * Não é `scripts/grade.mjs` (esse espelha a grade SEM diagonal dobrada, regra
 * que vale só para a régua opcional) nem distância reta em pixels (essa
 * ignora a diagonal dobrada por completo) — as duas davam área maior do que
 * os 9 m reais em várias direções.
 */
function distanciaReal(a, b) {
  const grade = canvas?.grid;
  if (!grade?.measurePath) return null;
  return grade.measurePath([a, b])?.distance ?? null;
}

/**
 * Menor distância entre dois tokens.
 *
 * Compara todos os pares de quadrados ocupados: é o mesmo critério do "quadrado
 * mais próximo" que a mesa usa para alcance.
 */
export function distanciaEntre(origem, alvo) {
  const de = pontosDoToken(origem);
  const para = pontosDoToken(alvo);

  let menor = Infinity;
  for (const a of de) {
    for (const b of para) {
      const d = distanciaReal(a, b);
      if (d !== null && d < menor) menor = d;
    }
  }
  return Number.isFinite(menor) ? menor : null;
}

/**
 * Existe parede entre dois pontos?
 *
 * Usa o mesmo teste de linha de visão do Foundry — é o que faz o efeito sair
 * quando alguém fecha uma porta entre a fonte e o aliado.
 */
export function pontoBloqueado(de, para) {
  const backend = CONFIG?.Canvas?.polygonBackends?.sight;
  if (!backend?.testCollision) return false;
  try {
    return backend.testCollision(de, para, { type: 'sight', mode: 'any' });
  } catch {
    // Cena sem paredes carregadas: não bloquear é o comportamento seguro.
    return false;
  }
}

/** Existe parede entre os dois tokens? */
export function paredeBloqueia(origem, alvo) {
  return pontoBloqueado(centroGravado(origem), centroGravado(alvo));
}

/**
 * Quadrados da grade cobertos pela aura — a área que a prévia pinta.
 *
 * Usa exatamente o mesmo critério do efeito (mesma régua, mesma parede), então
 * o que aparece pintado é o que de fato recebe o bônus. Quadrado atrás de
 * parede fica de fora.
 *
 * @returns {{x: number, y: number}[]} cantos superiores esquerdos dos quadrados
 */
export function quadradosNaAura(fonte, spec, raio) {
  const grade = canvas?.grid;
  if (!fonte || !grade || grade.isGridless || !(raio > 0)) return [];
  if (!grade.getOffset || !grade.getCenterPoint || !grade.getTopLeftPoint) return [];

  const origem = pontosDoToken(fonte);
  const deOnde = centroGravado(fonte);
  const centro = grade.getOffset(deOnde);
  // +1 de folga: a caixa é medida em quadrados, o raio não precisa fechar neles
  const alcance = Math.ceil(raio / (grade.distance || 1)) + 1;

  const saida = [];
  for (let i = centro.i - alcance; i <= centro.i + alcance; i += 1) {
    for (let j = centro.j - alcance; j <= centro.j + alcance; j += 1) {
      const ponto = grade.getCenterPoint({ i, j });

      let menor = Infinity;
      for (const a of origem) {
        const d = distanciaReal(a, ponto);
        if (d !== null && d < menor) menor = d;
      }
      if (!dentroDoRaio(menor, raio)) continue;
      if (spec?.bloqueavel && pontoBloqueado(deOnde, { ...ponto, elevation: deOnde.elevation })) continue;

      saida.push(grade.getTopLeftPoint({ i, j }));
    }
  }
  return saida;
}

/**
 * Tokens da cena que estão dentro da aura.
 *
 * @param {Token}  fonte   Token de quem emana a aura
 * @param {object} spec    Bloco `aura` do catálogo (disposições, bloqueável…)
 * @param {number} raio    Raio efetivo em metros, já com os modificadores
 * @returns {Token[]}
 */
export function tokensNaAura(fonte, spec, raio) {
  if (!fonte || !canvas?.tokens) return [];

  const saida = [];
  for (const token of canvas.tokens.placeables) {
    if (!token?.actor) continue;

    const ehFonte = token.id === fonte.id;
    const elegivel = alvoElegivel({
      disposicao: nomeDaDisposicao(token),
      oculto: !!token.document?.hidden,
      ehFonte
    }, spec);
    if (!elegivel) continue;

    // A fonte não precisa de medição nem de linha de visão consigo mesma.
    if (!ehFonte) {
      const distancia = distanciaEntre(fonte, token);
      if (distancia === null || !dentroDoRaio(distancia, raio)) continue;
      if (spec.bloqueavel && paredeBloqueia(fonte, token)) continue;
    }

    saida.push(token);
  }
  return saida;
}
