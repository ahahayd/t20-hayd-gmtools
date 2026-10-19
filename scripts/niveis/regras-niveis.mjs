/**
 * Planejador de Níveis — regras puras (sem Foundry), testadas em Node.
 *
 * O sistema guarda o nível de cada classe no item da classe (`niveis`) e não
 * tem campo para "em que nível isto escala". O que dá para saber vem do
 * texto das habilidades ("A cada dois níveis, esse dano extra aumenta em
 * +1d6"), então é daqui que sai a escala.
 */
import { normalizar, textoPlano } from '../criacao/regras.mjs';

export const NIVEL_MAXIMO = 20;

/**
 * Patamares de jogo (Livro Básico): a escala de poder do personagem, que
 * algumas habilidades usam. A lateral do planejador separa os níveis por eles.
 */
export const PATAMARES = [
  { id: 'iniciante', nome: 'Iniciante', de: 1, ate: 4, icone: 'fa-shield',
    texto: 'Aventureiro novato, envolvido em missões locais, como proteger vilas do ataque de bandidos e escoltar caravanas.' },
  { id: 'veterano', nome: 'Veterano', de: 5, ate: 10, icone: 'fa-shield-halved',
    texto: 'O herói presta serviços importantes a nobres e líderes de guildas.' },
  { id: 'campeao', nome: 'Campeão', de: 11, ate: 16, icone: 'fa-crown',
    texto: 'Já famoso por suas façanhas, o aventureiro trabalha para monarcas e enfrenta grandes vilões e monstros terríveis.' },
  { id: 'lenda', nome: 'Lenda', de: 17, ate: 20, icone: 'fa-dragon',
    texto: 'Entre os mais poderosos de Arton, o herói lida com perigos que ameaçam todo o mundo… Ou mesmo toda a realidade.' }
];

/** O patamar de um nível de personagem. */
export function patamarDe(nivel) {
  return PATAMARES.find(p => nivel >= p.de && nivel <= p.ate) ?? PATAMARES.at(nivel < 1 ? 0 : -1);
}

const NUMEROS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
const numero = (t) => (/^\d+$/.test(t) ? Number(t) : NUMEROS[t]);

/**
 * Lê a escala de uma habilidade: "a cada N níveis" e, se houver, o dado que
 * cresce ("aumenta em +1d6"). Sem a frase "a cada", devolve null.
 *
 * @returns {{passo: number, incremento: {n: number, faces: number}|null,
 *            base: {n: number, faces: number}|null, trecho: string}|null}
 */
export function escalonamento(descricao) {
  const plano = textoPlano(descricao);
  const t = normalizar(plano);
  const m = t.match(/a cada (\d+|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez) niveis/);
  if (!m) return null;
  const passo = numero(m[1]);
  if (!passo) return null;
  const inc = t.match(/aumenta(?:m)? em \+?(\d+)d(\d+)/);
  const incremento = inc ? { n: Number(inc[1]), faces: Number(inc[2]) } : null;
  let base = null;
  if (incremento) {
    const b = t.match(new RegExp(`(\\d+)d${incremento.faces}\\b`));
    if (b) base = { n: Number(b[1]), faces: incremento.faces };
  }
  // O trecho do texto com a frase, para o aviso ao jogador.
  const frases = plano.split(/(?<=[.!?])\s+/);
  const trecho = frases.find(f => /a cada/i.test(normalizar(f))) ?? '';
  return { passo, incremento, base, trecho: trecho.trim() };
}

/**
 * Quantos dados a habilidade tem num nível de classe. Ganha no nível
 * `nivelGanho` com `base`; a cada `passo` níveis, soma `incremento`.
 * Ataque Furtivo (1d6, +1d6 a cada dois, ganho no 1º): 1º→1, 3º→2, 5º→3.
 */
export function dadosNoNivel(escala, nivelGanho, nivelClasse) {
  if (!escala?.incremento || !escala.base) return null;
  const passos = Math.max(0, Math.floor((nivelClasse - nivelGanho) / escala.passo));
  return escala.base.n + passos * escala.incremento.n;
}

/**
 * Troca a quantidade de um dado nas partes de rolagem do sistema
 * (`rolls[].parts[][0]`, como "1d6"). Só mexe em partes que são exatamente
 * "NdF" com as faces pedidas; devolve as rolagens novas e se mudou algo.
 */
export function ajustarDadosNasRolagens(rolls, faces, quantidade) {
  let mudou = false;
  const novas = (rolls ?? []).map(r => ({
    ...r,
    parts: (r.parts ?? []).map(p => {
      const formula = String(p?.[0] ?? '').trim();
      const m = formula.match(/^(\d+)d(\d+)$/);
      if (!m || Number(m[2]) !== faces || Number(m[1]) === quantidade) return p;
      mudou = true;
      return [`${quantidade}d${faces}`, ...p.slice(1)];
    })
  }));
  return { rolls: novas, mudou };
}

/**
 * Os níveis de cada classe em cada nível de personagem, juntando o que a
 * ficha tem hoje com o que está planejado adiante.
 *
 * @param {Record<string, number>} atuais   { "Ladino": 3, ... } (chave = nome)
 * @param {number} nivelAtual               nível do personagem hoje
 * @param {Record<number, {classe?: {nome: string}}>} planos  por nível de personagem
 * @param {number} ate                      até que nível projetar
 * @returns {Record<number, {classe: string|null, nivelClasse: number|null, classes: Record<string, number>}>}
 */
export function projetarNiveis(atuais, nivelAtual, planos, ate) {
  const classes = { ...atuais };
  const out = {};
  for (let n = nivelAtual + 1; n <= ate; n++) {
    const nome = planos?.[n]?.classe?.nome ?? null;
    if (nome) classes[nome] = (classes[nome] ?? 0) + 1;
    out[n] = { classe: nome, nivelClasse: nome ? classes[nome] : null, classes: { ...classes } };
  }
  return out;
}

/**
 * Até que círculo a classe lança num nível de classe, lido da habilidade
 * "Magias (Classe)". Dois jeitos no livro: "(2º círculo no 5º nível, 3º
 * círculo no 9º nível e assim por diante)" — o passo vem do "a cada quatro
 * níveis" e vai até o 5º círculo — ou a lista fechada "(2º círculo no 6º
 * nível, 3º círculo no 10º nível e 4º círculo no 14º nível)".
 * Sem "magias de 1º círculo" no texto, devolve null.
 */
export function circuloMaximo(descricao, nivelClasse) {
  const t = normalizar(textoPlano(descricao));
  if (!/lancar magias (arcanas |divinas )?de 1º circulo/.test(t)) return null;
  const marcos = [[1, 1], ...[...t.matchAll(/(\d)º circulo no (\d+)º nivel/g)].map(m => [Number(m[1]), Number(m[2])])];
  const passo = t.match(/a cada (\d+|dois|tres|quatro|cinco|seis) niveis, pode lancar magias de um circulo maior/);
  if (passo && /assim por diante/.test(t)) {
    const p = numero(passo[1]);
    while (marcos.at(-1)[0] < 5) {
      const [c, n] = marcos.at(-1);
      marcos.push([c + 1, n + p]);
    }
  }
  return marcos.filter(([, n]) => n <= nivelClasse).reduce((max, [c]) => Math.max(max, c), 1);
}

/**
 * Quantas magias a classe aprende ao chegar neste nível de classe: "A cada
 * nível, aprende uma magia" (1 por nível) ou "A cada nível par" (só nos
 * pares). No 1º nível vale "Você começa com…", que é da criação. Sem a
 * frase, devolve null.
 */
export function magiasNoNivel(descricao, nivelClasse) {
  const t = normalizar(textoPlano(descricao));
  if (nivelClasse <= 1) return null;
  if (/a cada nivel par\b.{0,30}?aprende (uma|1) magia/.test(t)) return nivelClasse % 2 === 0 ? 1 : 0;
  if (/a cada nivel, aprende (uma|1) magia/.test(t)) return 1;
  return null;
}

/** Bônus de treino das perícias treinadas no nível de personagem: +2, +4 a partir do 7º, +6 a partir do 15º. */
export function bonusTreino(nivel) {
  return nivel > 14 ? 6 : nivel > 6 ? 4 : 2;
}

/**
 * Se uma habilidade que escala melhora exatamente neste nível de classe:
 * ganha no `nivelGanho` e sobe a cada `passo` (Ataque Furtivo: 3º, 5º, 7º…).
 */
export function escalaSobe(escala, nivelGanho, nivelClasse) {
  if (!escala?.passo) return false;
  return nivelClasse > nivelGanho && (nivelClasse - nivelGanho) % escala.passo === 0;
}

/**
 * O que um nível de personagem dá pela regra, sem contar as escolhas — a
 * mesma conta do sistema: PV = PV da classe por nível + bônus por nível +
 * Constituição (mínimo 1); PM = PM da classe por nível + bônus por nível.
 * Nos níveis pares a metade do nível sobe: +1 nas perícias, na CD e, com a
 * Defesa Progressiva, na Defesa. O treino muda no 7º e no 15º.
 *
 * @param {object} o
 * @param {number} o.nivel                nível de personagem alcançado
 * @param {{pv: number, pm: number}|null} o.porNivel  da classe; null = sem conta (PV/PM manuais ou classe desconhecida)
 * @param {number} [o.con]                valor do atributo que soma nos PV
 * @param {{pv?: object, pm?: object}} [o.bonus]  { nivel, par, impar } já somados
 * @param {boolean} [o.defesaProgressiva]
 */
export function ganhosDoNivel({ nivel, porNivel, con = 0, bonus = {}, defesaProgressiva = false }) {
  const par = nivel % 2 === 0;
  const extra = (b) => (Number(b?.nivel) || 0) + (Number(par ? b?.par : b?.impar) || 0);
  const treinoAntes = bonusTreino(nivel - 1);
  const treino = bonusTreino(nivel);
  return {
    pv: porNivel ? Math.max(1, (Number(porNivel.pv) || 0) + extra(bonus.pv) + (Number(con) || 0)) : null,
    pm: porNivel ? (Number(porNivel.pm) || 0) + extra(bonus.pm) : null,
    pericias: par ? 1 : 0,
    cd: par ? 1 : 0,
    defesa: par && defesaProgressiva ? 1 : 0,
    treino: treino !== treinoAntes ? { de: treinoAntes, para: treino } : null
  };
}
