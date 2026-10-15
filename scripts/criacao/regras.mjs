/**
 * Assistente de Criação — regras puras.
 *
 * Nada aqui toca em `game`, `CONFIG` ou no DOM: são as leituras de texto que
 * o sistema guarda sem estrutura (as perícias da classe, os atributos
 * dinâmicos da raça, o nível de uma habilidade) e as tabelas do livro que o
 * sistema não tem (as divindades). Ficam isoladas para serem testadas em Node.
 */

/** As vinte divindades do Panteão (T20 cap. 1) e o domínio que o sistema
 *  escreve no `subtipo` dos poderes concedidos de cada uma. Um poder
 *  compartilhado traz os domínios separados por vírgula ("Ambição,
 *  Goblinóides"), então a busca é por pedaço do texto. */
export const DIVINDADES = [
  // "Loucura" também é de Aharadak nos compêndios ("Caos, Loucura").
  { nome: 'Aharadak', dominio: 'Tormenta', outros: ['Loucura'] },
  { nome: 'Allihanna', dominio: 'Natureza' },
  { nome: 'Arsenal', dominio: 'Guerra' },
  { nome: 'Azgher', dominio: 'Sol' },
  { nome: 'Hyninn', dominio: 'Trapaça' },
  { nome: 'Kallyadranoch', dominio: 'Dragões' },
  { nome: 'Khalmyr', dominio: 'Justiça' },
  { nome: 'Lena', dominio: 'Vida' },
  { nome: 'Lin-Wu', dominio: 'Honra' },
  { nome: 'Marah', dominio: 'Paz' },
  { nome: 'Megalokk', dominio: 'Monstros' },
  { nome: 'Nimb', dominio: 'Caos' },
  { nome: 'Oceano', dominio: 'Mares' },
  { nome: 'Sszzaas', dominio: 'Traição' },
  { nome: 'Tanna-Toh', dominio: 'Conhecimento' },
  { nome: 'Tenebra', dominio: 'Trevas' },
  { nome: 'Thwor', dominio: 'Goblinóides' },
  { nome: 'Thyatis', dominio: 'Ressurreição' },
  { nome: 'Valkaria', dominio: 'Ambição' },
  { nome: 'Wynna', dominio: 'Magia' }
];

/** HTML de descrição do sistema → texto corrido (tags fora, entidades
 *  comuns decodificadas). Basta para ler números e palavras-chave. */
export function textoPlano(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&([a-z]+);/gi, (c, nome) => ENTIDADES[nome.toLowerCase()] ?? ' ')
    .replace(/&#(\d+);/g, (c, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}
const ENTIDADES = {
  nbsp: ' ', ordm: 'º', deg: '°', mdash: '—', ndash: '–', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', agrave: 'à', acirc: 'â', ecirc: 'ê',
  ocirc: 'ô', atilde: 'ã', otilde: 'õ', ccedil: 'ç', Aacute: 'Á', Eacute: 'É', Agrave: 'À'
};

/**
 * Da habilidade "Magias (Classe)": o tipo de magia e quantas a classe
 * conhece no 1º nível ("Você começa com três magias de 1º círculo").
 * O sistema não guarda isso em campo; o texto é a fonte.
 */
export function lerMagiasIniciais(descricao) {
  const t = normalizar(textoPlano(descricao));
  const tipo = /magias arcanas/.test(t) ? 'arc' : /magias divinas/.test(t) ? 'div' : null;
  const m = t.match(/comeca com (\d+|uma|duas|tres|quatro|cinco|seis) magias?/);
  const iniciais = m ? (/^\d+$/.test(m[1]) ? Number(m[1]) : NUMEROS[m[1]]) : null;
  return { tipo, iniciais };
}

/**
 * Magias a mais no 1º nível que uma habilidade escolhida dá — o Caminho do
 * Arcanista: Mago "começa com uma magia adicional (para um total de 4)". A
 * habilidade "Magias" diz a base; o caminho, o que soma. Sem a frase, 0.
 */
export function magiasAdicionaisIniciais(descricao) {
  const t = normalizar(textoPlano(descricao));
  const m = t.match(/comeca com (\d+|uma|duas|tres|quatro) magias? adiciona(?:l|is)/);
  if (!m) return 0;
  return /^\d+$/.test(m[1]) ? Number(m[1]) : (NUMEROS[m[1]] ?? 0);
}

/** Minúsculas, sem acento e sem a hifenização de quebra de linha do PDF
 *  ("Re- flexos" → "reflexos"). */
export function normalizar(texto) {
  return String(texto ?? '')
    .replace(/(\p{L})-\s+(\p{L})/gu, '$1$2')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Raças cujo poder pode vir com o nome do grupo no subtipo. */
const GRUPOS_DE_RACA = { aggelus: ['suraggel'], sulfure: ['suraggel'] };

/**
 * O `subtipo` de um poder ("Elfo", "Sereia/tritão", "Suraggel (Sulfure)",
 * "Arcanista") aponta para esta raça ou classe? Por nome inteiro — "Elfo"
 * não pega os poderes do "Meio-Elfo".
 */
export function subtipoDe(subtipo, nome) {
  const s = normalizar(subtipo), n = normalizar(nome);
  if (!s || !n) return false;
  if (s === n) return true;
  const partes = s.split(/\s*[,;]\s*|\s+e\s+/).map(p => p.trim());
  if (partes.includes(n)) return true;
  const entreParenteses = [...s.matchAll(/\(([^)]+)\)/g)].map(m => m[1].trim());
  if (entreParenteses.includes(n)) return true;
  return (GRUPOS_DE_RACA[chaveDeNome(nome)] ?? []).includes(s);
}

/** Chave estável de uma classe pelo nome ("Clérigo" → "clerigo"). */
export function chaveDeNome(nome) {
  return normalizar(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function divindadePorNome(nome) {
  const alvo = chaveDeNome(nome);
  if (!alvo) return null;
  return DIVINDADES.find(d => chaveDeNome(d.nome) === alvo) ?? null;
}

/**
 * O `subtipo` de um poder concedido em referências a divindades. Três
 * formas convivem nos compêndios:
 *  - domínio, como o sistema escreve: "Guerra", "Ambição, Goblinóides";
 *  - nome do deus, como os suplementos: "Arsenal", "Kallyadranoch, Megalokk";
 *  - deus menor com epíteto: "Benthos, o Dragão-Rei dos Mares",
 *    "Neruíte, a Deusa do Sono", "O Deus do Medo".
 * A vírgula separa tanto deuses quanto nome e epíteto; o que distingue é o
 * artigo: um pedaço que começa com "o"/"a" depois de uma vírgula é o epíteto
 * do anterior. Lixo de importação ("system.pericias.perc.bonus") é ignorado.
 *
 * @returns {{nome: string, epiteto: string|null}[]}
 */
export function referenciasDeConcedido(subtipo) {
  const texto = String(subtipo ?? '').replace(/\s+/g, ' ').trim();
  if (!texto || /^[\w-]+(\.[\w-]+)+$/.test(texto)) return [];
  const refs = [];
  texto.split(',').map(p => p.trim()).filter(Boolean).forEach((pedaco, i) => {
    if (i > 0 && /^(o|a|os|as) /i.test(pedaco) && refs.length) {
      refs[refs.length - 1].epiteto = pedaco;
      return;
    }
    // "Goblinóides e Monstros": "e" separa domínios, mas nunca dentro de um
    // nome com epíteto (esse caso já foi tratado acima).
    for (const nome of pedaco.split(/ e /)) if (nome.trim()) refs.push({ nome: nome.trim(), epiteto: null });
  });
  return refs;
}

/** A referência aponta para uma das vinte maiores? Pelo nome, ou pelo
 *  domínio quando vem sozinho — "Benthos, o Dragão-Rei dos Mares" fala de
 *  mares mas não é Oceano. */
function referenciaDaMaior(ref, divindade) {
  const n = chaveDeNome(ref.nome);
  if (n === chaveDeNome(divindade.nome)) return true;
  if (ref.epiteto) return false;
  return [divindade.dominio, ...(divindade.outros ?? [])].some(d => d && n === chaveDeNome(d));
}

/**
 * O poder concedido (pelo `subtipo`) pertence à divindade? Vale para as
 * vinte maiores (`{ nome, dominio }`) e para as menores dos suplementos
 * (`{ nome }`, achadas por `outrasDivindades`).
 */
export function concedidoPelaDivindade(subtipo, divindade) {
  if (!divindade) return false;
  return referenciasDeConcedido(subtipo).some(ref => referenciaDaMaior(ref, divindade));
}

/**
 * As divindades que aparecem nos poderes concedidos e não são as vinte do
 * Panteão (os deuses menores dos suplementos). Um subtipo que já cita uma
 * maior não traz menores — "Caos, Loucura" é de Nimb, não um deus "Loucura".
 *
 * @param {string[]} subtipos  um por poder concedido
 * @returns {{nome: string, epiteto: string|null, poderes: number}[]}
 */
export function outrasDivindades(subtipos) {
  const achadas = new Map();
  for (const subtipo of subtipos) {
    const refs = referenciasDeConcedido(subtipo);
    if (!refs.length || refs.some(r => DIVINDADES.some(d => referenciaDaMaior(r, d)))) continue;
    for (const r of refs) {
      const chave = chaveDeNome(r.nome);
      const atual = achadas.get(chave);
      if (atual) { atual.poderes++; atual.epiteto ??= r.epiteto; }
      else achadas.set(chave, { nome: r.nome, epiteto: r.epiteto, poderes: 1 });
    }
  }
  return [...achadas.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/* ─── Poderes gerais ──────────────────────────────────────────────────── */

/** As categorias de poder geral do livro, pelo `subtipo`. */
export const CATEGORIAS_GERAIS = [
  { id: 'destino', rotulo: 'Destino' },
  { id: 'combate', rotulo: 'Combate' },
  { id: 'tormenta', rotulo: 'Tormenta' },
  { id: 'magia', rotulo: 'Magia' },
  { id: 'grupo', rotulo: 'Grupo' },
  { id: 'geral', rotulo: 'Geral' }
];

/** Categoria de um poder geral; o que não for das cinco nomeadas (sem
 *  subtipo, Montaria, Parceiros...) cai em "geral". */
export function categoriaGeral(subtipo) {
  const s = normalizar(subtipo);
  if (s === 'geupo') return 'grupo'; // erro de digitação num compêndio
  return CATEGORIAS_GERAIS.some(c => c.id === s && c.id !== 'geral') ? s : 'geral';
}

/* ─── Equipamento ─────────────────────────────────────────────────────── */

/**
 * O dinheiro depois das compras. Item marcado como recebido (equipamento
 * inicial, `gratis`) não custa; os demais custam preço × quantidade.
 * Sem compras (`comprar` desligado), nada é descontado.
 */
export function saldoDoEquipamento(itens, dinheiro, comprar = true) {
  // Em centavos (inteiros): 17 − 10,2 em ponto flutuante dá 6,8000000000000001.
  const centavos = (v) => Math.round((Number(v) || 0) * 100);
  const inicial = Math.max(0, centavos(dinheiro));
  const gasto = comprar
    ? (itens ?? []).filter(i => !i.gratis).reduce((t, i) => t + centavos(i.preco) * Math.max(1, Math.trunc(Number(i.qtd)) || 1), 0)
    : 0;
  return { inicial: inicial / 100, gasto: gasto / 100, sobra: (inicial - gasto) / 100 };
}

/** Valor em T$ para mostrar: até duas casas, vírgula decimal ("6,8", "1.250"). */
export function formatarTibares(valor) {
  const v = Math.round((Number(valor) || 0) * 100) / 100;
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/**
 * T$ em moedas da ficha: a parte inteira em tibares (tp) e o resto em
 * tibares de cobre (tc) — T$ 1 = 10 TC. Centésimos que sobrem (abaixo de
 * 1 TC) são arredondados.
 */
export function dividirEmMoedas(valor) {
  const tc = Math.max(0, Math.round((Number(valor) || 0) * 10));
  return { tp: Math.floor(tc / 10), tc: tc % 10 };
}

/* ─── Perícias da classe ──────────────────────────────────────────────── */

/**
 * Lê "Luta (For) ou Pontaria (Des), Fortitude (Con), mais 2 a sua escolha
 * entre Adestramento (Car), ..." e devolve:
 *
 *   { fixas: [['luta', 'pont'], ['fort']], escolha: 2, opcoes: ['ades', ...] }
 *
 * Cada entrada de `fixas` é um grupo: com uma chave, a perícia é dada; com
 * várias, o personagem escolhe UMA delas ("Luta ou Pontaria"). Um "Ofício"
 * genérico vira o grupo de todos os ofícios.
 *
 * `rotulos` é { chave: 'Rótulo' } (o CONFIG.T20.pericias já traduzido) e
 * `oficios` é a lista de chaves de ofício. Texto que não segue o molde
 * devolve `null` — quem chama mostra o texto cru e deixa a escolha livre.
 */
export function lerPericiasDaClasse(texto, rotulos, oficios = []) {
  const t = normalizar(texto);
  if (!t) return null;
  const m = t.match(/^(.*?)[,.]?\s*mais (\d+) (?:a|à) sua escolha entre (.*)$/);
  const parteFixa = m ? m[1] : t;
  const escolha = m ? Number(m[2]) : 0;
  const parteOpcoes = m ? m[3] : '';

  const nomes = Object.entries(rotulos)
    .filter(([k]) => !oficios.includes(k))
    .map(([k, r]) => ({ chaves: [k], nome: normalizar(r) }));
  if (oficios.length) nomes.push({ chaves: [...oficios], nome: 'oficio' });
  // Nomes mais longos primeiro, para nenhum nome curto "comer" um maior.
  nomes.sort((a, b) => b.nome.length - a.nome.length);

  const achar = (trecho) => {
    const achados = [];
    const ocupado = new Array(trecho.length).fill(false);
    for (const n of nomes) {
      const re = new RegExp(`\\b${n.nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      let r;
      while ((r = re.exec(trecho))) {
        const fim = r.index + n.nome.length;
        if (ocupado.slice(r.index, fim).some(Boolean)) continue;
        for (let i = r.index; i < fim; i++) ocupado[i] = true;
        achados.push({ chaves: n.chaves, ini: r.index, fim });
      }
    }
    return achados.sort((a, b) => a.ini - b.ini);
  };

  const fixosAchados = achar(parteFixa);
  const fixas = [];
  fixosAchados.forEach((a, i) => {
    const anterior = fixosAchados[i - 1];
    const entre = anterior ? parteFixa.slice(anterior.fim, a.ini) : '';
    if (anterior && /\bou\b/.test(entre)) {
      const grupo = fixas[fixas.length - 1];
      for (const k of a.chaves) if (!grupo.includes(k)) grupo.push(k);
    } else {
      fixas.push([...a.chaves]);
    }
  });

  const opcoes = [];
  for (const a of achar(parteOpcoes)) for (const k of a.chaves) if (!opcoes.includes(k)) opcoes.push(k);

  if (!fixas.length && !opcoes.length) return null;
  return { fixas, escolha, opcoes };
}

/* ─── Atributos dinâmicos da raça ─────────────────────────────────────── */

const NUMEROS = { um: 1, uma: 1, outro: 1, outra: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6 };

/**
 * "+1 em Três Atributos Diferentes" → { valor: 1, quantos: 3 }.
 * Descrição com alternativas ("+2 em um ou +1 em dois") ou fora do molde
 * devolve `null`: o assistente cai na distribuição livre, como o diálogo
 * do próprio sistema.
 */
export function lerAtributosDinamicos(descricao) {
  const t = normalizar(descricao);
  const achados = [...t.matchAll(/\+\s*(\d+)\s+em\s+(\d+|um|uma|outro|outra|dois|duas|tres|quatro|cinco|seis)\s+(?:outros?\s+)?atributos?/g)];
  if (achados.length !== 1) return null;
  const [, valor, qtd] = achados[0];
  const quantos = /^\d+$/.test(qtd) ? Number(qtd) : NUMEROS[qtd];
  if (!quantos) return null;
  return { valor: Number(valor), quantos };
}

/**
 * A regra de atributos dinâmicos de uma raça, ou `null` quando ela não tem.
 * O sistema preenche a descrição com o texto padrão ("+1 em Três Atributos
 * Diferentes") até em raça sem atributo à escolha, então quem manda é a
 * lista de atributos permitidos, não o texto.
 */
export function regraDaRaca(permitidos, descricao) {
  if (!permitidos?.length) return null;
  return lerAtributosDinamicos(descricao);
}

/* ─── Habilidades de classe ───────────────────────────────────────────── */

/**
 * Nível em que uma habilidade de classe chega, lido da descrição ("No 20º
 * nível, ..."). O sistema não guarda isso em campo; sem menção, conta como
 * 1º nível — é o caso das habilidades iniciais.
 */
export function nivelDaHabilidade(descricao) {
  const t = normalizar(textoPlano(descricao));
  const m = t.match(/^(?:a partir do |no |ao atingir o |no seu )?(\d+)\s*(?:º|o|°)?\s*nivel/);
  return m ? Number(m[1]) : 1;
}

/* ─── Contagem de perícias ────────────────────────────────────────────── */

/**
 * Quantas perícias à escolha da classe já foram marcadas: tudo o que foi
 * marcado na etapa da classe, menos o que cobre as fixas (uma por grupo).
 */
export function contarEscolhasDaClasse(marcadas, regra) {
  if (!regra) return marcadas.length;
  const restantes = new Set(marcadas);
  for (const grupo of regra.fixas) {
    const coberta = grupo.find(k => restantes.has(k));
    if (coberta) restantes.delete(coberta);
  }
  return restantes.size;
}

/* ─── Raças Abertas (variante do Heróis de Arton) ─────────────────────── */

/**
 * Os modificadores da raça como peças soltas, do maior para o menor: o anão
 * (Con +2, Sab +1, Des −1) vira [2, 1, −1]. Com a variante, cada peça vai
 * para o atributo que o jogador quiser, uma por atributo.
 */
export function modificadoresAbertos(atributos) {
  return Object.values(atributos ?? {}).map(Number).filter(v => Number.isFinite(v) && v !== 0).sort((a, b) => b - a);
}

/**
 * Racial de uma raça aberta: cada peça no atributo escolhido (`colocados[i]`
 * é a chave do atributo da peça i, ou vazio) mais os atributos dinâmicos,
 * que seguem a própria regra.
 */
export function racialAberto(chaves, pecas, colocados, dinamicos = {}) {
  const out = Object.fromEntries(chaves.map(k => [k, 0]));
  pecas.forEach((v, i) => { const k = colocados?.[i]; if (k && k in out) out[k] += v; });
  for (const [k, v] of Object.entries(dinamicos ?? {})) if (k in out) out[k] += Number(v) || 0;
  return out;
}

/**
 * Valor em moedas para mostrar: "T$ 6 e 8 TC", "T$ 50", "2 TC". Um T$ 6,8
 * não é "seis tibares e oito décimos" — são 6 tibares e 8 tibares de cobre,
 * e é assim que vai para a ficha (ver dividirEmMoedas).
 */
export function formatarMoedas(valor) {
  const negativo = (Number(valor) || 0) < 0;
  const { tp, tc } = dividirEmMoedas(Math.abs(Number(valor) || 0));
  const partes = [];
  if (tp || !tc) partes.push(`T$ ${tp.toLocaleString('pt-BR')}`);
  if (tc) partes.push(`${tc} TC`);
  return (negativo ? '−' : '') + partes.join(' e ');
}
