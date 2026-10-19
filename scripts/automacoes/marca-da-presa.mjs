/**
 * Marca da Presa — dados de bônus e passos de dano.
 *
 * Regras (Caçador, Livro Básico):
 * - A marca dá +1d4 no dano contra a criatura analisada, até o fim da cena.
 *   A cada quatro níveis, +1 PM aumenta o bônus conforme a tabela da classe
 *   (1d4, 1d8, 1d12, 2d8, 2d10).
 * - Inimigo de (Criatura) dobra os dados da marca contra o tipo escolhido.
 * - Tiro de Abate faz os dados da marca serem multiplicados no crítico.
 * - Primeiro Sangue aumenta todos os dados de dano em dois passos.
 *
 * "Passo" depende do que está subindo:
 * - arma e a própria marca seguem a Tabela 3-2 (Dano de Armas): cada linha
 *   vai de Normal a +3 passos e, passando disso, segue na linha seguinte
 *   (1d6 + 4 passos = 3d6). Os degraus 2d8 e 2d10 da marca sobem pelas linhas
 *   deles (2d8 → 3d8 → 4d8…, 2d10 → 3d10 → 4d10 → 4d12);
 * - qualquer outro dado só troca de faces (d4, d6, d8, d10, d12, no máximo).
 * Perda de PV não é dano: partes do tipo "perda" (e as curas) nunca sobem.
 *
 * Funções puras: nada aqui toca em documentos do Foundry.
 */

/** Progressão da marca (e das armas) quando algo aumenta um passo. */
export const PROGRESSAO_MARCA = ['1d4', '1d6', '1d8', '1d10', '1d12', '3d6', '4d6', '4d8', '4d10', '4d12'];

/**
 * Linhas de passos de dano do Tormenta20 (CONFIG.T20.passosDano). A primeira
 * é a progressão acima; as outras cobrem os dados que só aparecem nelas —
 * o 2d8 e o 2d10 da tabela do Caçador, por exemplo.
 */
const LINHAS_DE_PASSOS = [
  ['1', '1d2', '1d3', ...PROGRESSAO_MARCA],
  ['1', '1d2', '1d3', '1d4', '1d6', '1d8', '1d10', '2d6', '2d8', '3d8', '4d8', '4d10', '4d12'],
  ['1', '1d2', '1d3', '1d4', '1d6', '1d8', '1d10', '2d6', '2d8', '2d10', '3d10', '4d10', '4d12']
];

/** Equivalências que o sistema usa antes de subir o dado de uma arma. */
const EQUIVALENTES = { '2d4': '1d8', '2d6': '1d12', '3d4': '1d12' };

/** Faces de um dado comum, na ordem dos passos. */
const FACES = [4, 6, 8, 10, 12];

/** Tipos de parte que não são dano e, portanto, não sobem de passo. */
export const TIPOS_SEM_PASSO = ['perda', 'curapv', 'curapm', 'curatpv', 'curatpm', 'danoCritico'];

/** Tabela da Marca da Presa do Caçador (nível da classe → dado). */
export const TABELA_CACADOR = [
  { nivel: 1, dado: '1d4' },
  { nivel: 5, dado: '1d8' },
  { nivel: 9, dado: '1d12' },
  { nivel: 13, dado: '2d8' },
  { nivel: 17, dado: '2d10' }
];

/**
 * Classes que concedem a Marca da Presa, pelo nome normalizado (sem acento,
 * minúsculo). Uma classe nova com outra progressão entra aqui com a própria
 * tabela; os níveis de todas as classes da lista se somam.
 */
export const CLASSES_DA_MARCA = {
  cacador: TABELA_CACADOR,
  seteiro: TABELA_CACADOR
};

/** Nome sem acento e sem caixa, para comparar nomes de classe. */
export function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Tabela de uma classe pelo nome, ou null quando ela não dá a marca. */
export function tabelaDaClasse(nome) {
  return CLASSES_DA_MARCA[normalizar(nome)] ?? null;
}

/**
 * Nível que conta para a marca: soma dos níveis das classes da lista.
 * `classes`: [{ nome, nivel }]. Devolve a tabela da primeira classe achada.
 */
export function nivelDaMarca(classes = []) {
  let nivel = 0;
  let tabela = null;
  for (const { nome, nivel: n } of classes) {
    const t = tabelaDaClasse(nome);
    if (!t) continue;
    nivel += Math.max(0, Math.trunc(Number(n) || 0));
    tabela ??= t;
  }
  return { nivel, tabela: tabela ?? TABELA_CACADOR };
}

/** Quantos aumentos (+1 PM cada) o nível permite. */
export function aumentosDisponiveis(nivel, tabela = TABELA_CACADOR) {
  const n = Math.max(1, Math.trunc(Number(nivel) || 0));
  return Math.max(0, tabela.filter((linha) => linha.nivel <= n).length - 1);
}

/** Configuração da marca salva no poder, já normalizada. */
export function normalizarConfig(config = {}) {
  const base = PROGRESSAO_MARCA.includes(config?.base) ? config.base : PROGRESSAO_MARCA[0];
  return {
    base,
    passos: Math.max(0, Math.trunc(Number(config?.passos) || 0)),
    nivel: Math.max(0, Math.trunc(Number(config?.nivel) || 0))
  };
}

/** Registro de uma marca contra um oponente, já normalizado. */
export function normalizarMarca(registro) {
  if (!registro || typeof registro !== 'object') return null;
  return {
    item: registro.item ?? null,
    aumentos: Math.max(0, Math.trunc(Number(registro.aumentos) || 0)),
    dobrado: !!registro.dobrado
  };
}

/** "2d8" → { qtd: 2, faces: 8 }; null para o que não é um dado simples. */
function lerDado(dado) {
  const m = String(dado ?? '').trim().match(/^(\d+)d(\d+)$/i);
  return m ? { qtd: Number(m[1]), faces: Number(m[2]) } : null;
}

/** Sobe só as faces (d4 → d6 → … → d12). Dados fora da lista não mudam. */
export function subirFaces(dado, passos) {
  const d = lerDado(dado);
  if (!d) return dado;
  const i = FACES.indexOf(d.faces);
  if (i < 0) return dado;
  const novo = FACES[Math.max(0, Math.min(FACES.length - 1, i + passos))];
  return `${d.qtd}d${novo}`;
}

/**
 * Sobe na tabela de passos de dano (arma e marca). Procura primeiro a linha
 * principal e cai nas outras linhas do sistema só para os dados que só
 * existem nelas. O topo é 4d12.
 */
export function subirPassosDeDano(dado, passos) {
  if (!passos) return dado;
  const base = EQUIVALENTES[dado] ?? dado;
  const linha = LINHAS_DE_PASSOS.find((l) => l.includes(base));
  if (!linha) return subirFaces(dado, passos);
  const i = linha.indexOf(base);
  return linha[Math.max(0, Math.min(linha.length - 1, i + passos))];
}

/** Multiplica a quantidade de dados ("1d8" × 2 → "2d8"). */
export function multiplicarDados(dado, fator) {
  const d = lerDado(dado);
  const f = Math.max(1, Math.trunc(Number(fator) || 1));
  return d ? `${d.qtd * f}d${d.faces}` : dado;
}

/**
 * Dado da marca antes de qualquer efeito da rolagem: o degrau da tabela
 * escolhido pelos PM extras, deslocado pela base e pelos passos da
 * configuração. Com a base padrão (1d4) e sem passos, é exatamente a tabela.
 */
export function dadoDaMarca({ aumentos = 0, config = {}, tabela = TABELA_CACADOR } = {}) {
  const cfg = normalizarConfig(config);
  const degrau = tabela[Math.max(0, Math.min(tabela.length - 1, aumentos))].dado;
  const deslocamento = PROGRESSAO_MARCA.indexOf(cfg.base)
    - Math.max(0, PROGRESSAO_MARCA.indexOf(tabela[0].dado)) + cfg.passos;
  return subirPassosDeDano(degrau, deslocamento);
}

/**
 * Fórmula final da marca numa rolagem, na ordem das regras: passos
 * (Primeiro Sangue) → dobro (Inimigo de) → crítico (Tiro de Abate).
 */
export function formulaDaMarca(dado, { passos = 0, dobrado = false, multiplicador = 1 } = {}) {
  let formula = subirPassosDeDano(dado, passos);
  if (dobrado) formula = multiplicarDados(formula, 2);
  if (multiplicador > 1) formula = multiplicarDados(formula, multiplicador);
  return formula;
}

/** Sobe todos os dados de uma fórmula ("1d6+2" → "1d10+2"), cada um com `subir`. */
function subirDadosDaFormula(formula, subir) {
  return String(formula).replace(/(\d+)d(\d+)/gi, (dado) => subir(dado.toLowerCase()));
}

/**
 * Aplica os passos em todas as partes de uma rolagem de dano.
 *
 * `parts`: [[formula, tipo, ...]] do sistema. A primeira parte de uma arma é
 * o dado da arma e usa a tabela de passos de dano; `indiceMarca` aponta a
 * parte da marca, que é reescrita com `formulaMarca` (já calculada com os
 * passos). O resto só troca de faces. Partes sem dados, de perda de PV ou
 * de cura não mudam. Devolve uma lista nova; a recebida fica intacta.
 */
export function aplicarPassosNasPartes(parts, { passos = 0, ehArma = false, indiceMarca = -1, formulaMarca = null } = {}) {
  return (parts ?? []).map((parte, i) => {
    const nova = [...parte];
    if (i === indiceMarca && formulaMarca) {
      nova[0] = formulaMarca;
      return nova;
    }
    if (!passos || TIPOS_SEM_PASSO.includes(parte[1]) || typeof parte[0] !== 'string') return nova;
    const subir = ehArma && i === 0
      ? (dado) => subirPassosDeDano(dado, passos)
      : (dado) => subirFaces(dado, passos);
    nova[0] = subirDadosDaFormula(parte[0], subir);
    return nova;
  });
}

/**
 * Posição da parte da marca: a última cuja fórmula é exatamente o dado que
 * o efeito da marca colocou. Partes de perda/cura nunca são a marca.
 */
export function indiceDaMarca(parts, formula) {
  if (!formula) return -1;
  for (let i = (parts?.length ?? 0) - 1; i >= 0; i -= 1) {
    const [f, tipo] = parts[i];
    if (TIPOS_SEM_PASSO.includes(tipo)) continue;
    if (String(f).trim() === formula) return i;
  }
  return -1;
}
