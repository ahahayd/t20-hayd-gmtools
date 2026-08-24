/**
 * t20-hayd-tesouros | motor.mjs
 * Motor de rolagem/resolução da Tabela 8-1 e das tabelas associadas.
 * Cada célula da Tabela 8-1 (dados-nd.mjs) é resolvida recursivamente em uma
 * árvore de "nós" de resultado, já com o vínculo de item resolvido
 * (vinculo.mjs) — pronta para a UI renderizar ou para materializar em itens
 * reais do Foundry.
 *
 * TODA rolagem passa por uma `SessaoDeRolagem` (sessao.mjs), nunca por
 * `Roll` direto — isso é o que permite (a) reconstruir a trilha completa de
 * dados que levou a cada resultado (pra exibir/postar no chat) e (b) o modo
 * "passo a passo", em que cada dado da cadeia é decidido pela UI antes de
 * seguir pro próximo, em vez de tudo ser rolado de uma vez.
 */
import { TABELA_ND, ORDEM_ND } from './dados-nd.mjs';
import {
  entradasResolvidas, dadoResolvido, entradaPorRolagem,
  dadoResolvidoExemplosRiqueza, exemploRiquezaPorRolagem, idTabelaExemplosRiqueza,
  ESPACOS_RIQUEZA, faixaValorPor
} from './tabelas.mjs';
import { sessaoAutomatica } from './sessao.mjs';
import { resolverReferencia } from './vinculo.mjs';

export { ORDEM_ND };

/** Linha da Tabela 8-1 para um ND (`{ dinheiro: [...faixas], itens: [...faixas] }`). */
export function linhaND(nd) {
  return TABELA_ND[nd] ?? null;
}

const novoId = () => foundry.utils.randomID();

const TABELA_ID_EQUIPAMENTO = { arma: 'armas', 'armadura-escudo': 'armadurasEscudos', esoterico: 'esotericos' };
const TABELA_ID_SUPERIOR = { arma: 'melhoriasArmas', 'armadura-escudo': 'melhoriasArmadurasEscudos', esoterico: 'melhoriasEsotericos' };
const TABELA_ID_MAGICO = { arma: 'encantosArmas', 'armadura-escudo': 'encantosArmadurasEscudos', esoterico: 'encantosEsotericos' };
const TABELA_ID_ACESSORIO = { menor: 'acessoriosMenores', medio: 'acessoriosMedios', maior: 'acessoriosMaiores' };

const ROTULO_CATEGORIA_EQUIPAMENTO = {
  arma: 'Tabela 8-4 — Armas', 'armadura-escudo': 'Tabela 8-4 — Armaduras & Escudos', esoterico: 'Tabela 8-4 — Esotéricos'
};
const ROTULO_SUPERIOR = { arma: 'Melhoria de Arma', 'armadura-escudo': 'Melhoria de Armadura/Escudo', esoterico: 'Melhoria de Esotérico' };
const ROTULO_MAGICO = { arma: 'Encanto de Arma', 'armadura-escudo': 'Encanto de Armadura/Escudo', esoterico: 'Encanto de Esotérico' };
const ROTULO_ESPECIFICO = {
  armaEspecifica: 'Arma Mágica Específica', armaduraEscudoEspecifico: 'Armadura/Escudo Mágico Específico', esotericoEspecifico: 'Esotérico Mágico Específico'
};
const ROTULO_NIVEL = { menor: 'Menor', medio: 'Médio', maior: 'Maior' };

const QTD_ENCANTOS_POR_NIVEL = { menor: 1, medio: 2, maior: 3 };
const MAX_TENTATIVAS_REROLL = 25;

const categoriaEquipamentoPorD6 = d6 => (d6 <= 3 ? 'arma' : d6 <= 5 ? 'armadura-escudo' : 'esoterico');
const categoriaMagicaPorD6 = d6 => (d6 <= 2 ? 'arma' : d6 === 3 ? 'armadura-escudo' : d6 === 4 ? 'esoterico' : 'acessorio');

/**
 * Regra "2D": rola 2d6 separados. Sem a flag, resolve direto (rola 1d6
 * normal). Com a flag, o Mestre escolhe qual dos dois valores usar ANTES de
 * saber o que cada um resultaria (`sessao.escolha2D` já devolve só o valor
 * ESCOLHIDO) — só então esse valor é resolvido, então o item final nunca
 * carrega as "duas opções": é sempre um resultado normal e único.
 */
async function comEscolha2D(sessao, duasEscolhas, rotulo, resolver) {
  const d6 = duasEscolhas ? await sessao.escolha2D(rotulo) : (await sessao.d(6, rotulo)).total;
  return resolver(sessao, d6);
}

/* ─── Rolagem genérica numa tabela do registry (com homebrew já mesclado) ── */
async function resolverEntradaTabela(sessao, tabelaId, rotulo) {
  const dado = dadoResolvido(tabelaId);
  const { total } = await sessao.d(dado, rotulo);
  const entrada = entradaPorRolagem(tabelaId, total);
  return entrada;
}

async function nodeItemDeEntrada(tabelaId, entrada) {
  const vinculo = await resolverReferencia(tabelaId, entrada.chave, entrada.nome, { riqueza: false });
  return {
    id: novoId(), tipo: 'item', tabela: tabelaId, chave: entrada.chave,
    nome: entrada.nome, livro: entrada.livro ?? null, pagina: entrada.pagina ?? null,
    preco: entrada.preco ?? null, vinculo
  };
}

/* ─── Item diverso (Tabela 8-3) ─────────────────────────────────────────── */
async function resolverItemDiverso(sessao) {
  const entrada = await resolverEntradaTabela(sessao, 'itensDiversos', 'Tabela 8-3 — Item Diverso');
  return nodeItemDeEntrada('itensDiversos', entrada);
}

/* ─── Equipamento mundano — Tabela 8-4 (base de "Equipamento"/"Superior"/"Mágico") ── */
async function resolverEquipamentoBase(sessao, categoria) {
  const tabelaId = TABELA_ID_EQUIPAMENTO[categoria];
  const entrada = await resolverEntradaTabela(sessao, tabelaId, ROTULO_CATEGORIA_EQUIPAMENTO[categoria]);
  const node = await nodeItemDeEntrada(tabelaId, entrada);
  node.categoria = categoria;
  node.ehEscudo = /escudo/i.test(entrada.nome);
  return node;
}

async function resolverEquipamento(sessao, duasEscolhas) {
  return comEscolha2D(
    sessao, duasEscolhas,
    'Tipo de Equipamento (Tabela 8-4: 1d6 — 1-3 arma, 4-5 armadura/escudo, 6 esotérico)',
    (s, d6) => resolverEquipamentoBase(s, categoriaEquipamentoPorD6(d6))
  );
}

/* ─── Material especial (1d6, usado por melhorias "Material especial") ──── */
async function resolverMaterial(sessao) {
  const entrada = await resolverEntradaTabela(sessao, 'materiaisEspeciais', 'Material Especial (1d6)');
  return nodeItemDeEntrada('materiaisEspeciais', entrada);
}

/* ─── Superior (Tabela 8-5): item base (Tabela 8-4) + N melhorias ──────────
 * - melhoria exclusiva de armadura/escudo que não bate com o item → reroll
 * - melhoria que "conta como duas" sem espaço sobrando no orçamento → reroll
 * - "Material especial" dispara uma segunda rolagem (1d6) ─────────────── */
async function rolarMelhoriaValida(sessao, categoria, itemBase, numero) {
  const rotulo = `Tabela 8-5 — ${ROTULO_SUPERIOR[categoria]} #${numero}`;
  for (let t = 0; t < MAX_TENTATIVAS_REROLL; t++) {
    const entrada = await resolverEntradaTabela(sessao, TABELA_ID_SUPERIOR[categoria], rotulo);
    if (entrada.apenasArmadura && itemBase.ehEscudo) continue;
    if (entrada.apenasEscudo && !itemBase.ehEscudo) continue;
    return entrada;
  }
  return resolverEntradaTabela(sessao, TABELA_ID_SUPERIOR[categoria], rotulo);
}

async function resolverSuperior(sessao, qtdMelhorias, categoria, itemBase) {
  const melhorias = [];
  let restantes = qtdMelhorias;
  let numero = 1;
  let guarda = 0;
  while (restantes > 0 && guarda++ < qtdMelhorias + MAX_TENTATIVAS_REROLL) {
    const entrada = await rolarMelhoriaValida(sessao, categoria, itemBase, numero);
    const custa2 = !!entrada.conta2;
    if (custa2 && restantes < 2) continue; // não cabe no orçamento restante — role de novo

    if (entrada.materialEspecial) {
      const material = await resolverMaterial(sessao);
      melhorias.push({
        id: novoId(), tipo: 'melhoria', chave: entrada.chave, nome: entrada.nome,
        livro: entrada.livro, pagina: entrada.pagina, materialEspecial: true, material
      });
    } else {
      melhorias.push({
        id: novoId(), tipo: 'melhoria', chave: entrada.chave, nome: entrada.nome,
        livro: entrada.livro, pagina: entrada.pagina, conta2: custa2
      });
    }
    restantes -= custa2 ? 2 : 1;
    numero++;
  }
  return melhorias;
}

async function resolverResultadoSuperior(sessao, celula) {
  return comEscolha2D(
    sessao, celula.duasEscolhas,
    'Tipo de Equipamento — Item Superior (Tabela 8-4: 1d6 — 1-3 arma, 4-5 armadura/escudo, 6 esotérico)',
    async (s, d6) => {
      const categoria = categoriaEquipamentoPorD6(d6);
      const item = await resolverEquipamentoBase(s, categoria);
      const melhorias = await resolverSuperior(s, celula.melhorias, categoria, item);
      return { id: novoId(), tipo: 'itemSuperior', item, melhorias };
    }
  );
}

/* ─── Mágico: item base (Tabela 8-4) + N encantos, ou item específico ─────
 * (um encanto "Item específico" substitui a build acumulada) ──────────── */
async function rolarEncantoOuRedirect(sessao, categoria, itemBase, numero) {
  const rotulo = `${ROTULO_MAGICO[categoria]} #${numero}`;
  for (let t = 0; t < MAX_TENTATIVAS_REROLL; t++) {
    const entrada = await resolverEntradaTabela(sessao, TABELA_ID_MAGICO[categoria], rotulo);
    if (entrada.tipo === 'redirect') return { redirect: entrada.tabela };
    if (entrada.apenasArmadura && itemBase.ehEscudo) continue;
    if (entrada.apenasEscudo && !itemBase.ehEscudo) continue;
    return { entrada };
  }
  const entrada = await resolverEntradaTabela(sessao, TABELA_ID_MAGICO[categoria], rotulo);
  return entrada.tipo === 'redirect' ? { redirect: entrada.tabela } : { entrada };
}

/** Item mágico ESPECÍFICO (Vingadora Sagrada, Cajado da Destruição...) — resultado terminal. */
async function resolverEspecifico(sessao, tabelaEspecificaId) {
  const entrada = await resolverEntradaTabela(sessao, tabelaEspecificaId, ROTULO_ESPECIFICO[tabelaEspecificaId]);
  const node = await nodeItemDeEntrada(tabelaEspecificaId, entrada);
  node.especifico = true;
  return node;
}

async function resolverMagicoBuild(sessao, nivel, categoria) {
  const item = await resolverEquipamentoBase(sessao, categoria);
  const encantos = [];
  let restantes = QTD_ENCANTOS_POR_NIVEL[nivel];
  let numero = 1;
  let guarda = 0;
  while (restantes > 0 && guarda++ < restantes + MAX_TENTATIVAS_REROLL) {
    const r = await rolarEncantoOuRedirect(sessao, categoria, item, numero);
    if (r.redirect) {
      // "Item específico": substitui a build acumulada pelo item único (ver dados-magicos.mjs).
      return await resolverEspecifico(sessao, r.redirect);
    }
    const { entrada } = r;
    const custa2 = !!entrada.conta2;
    if (custa2 && restantes < 2) continue;
    encantos.push({
      id: novoId(), tipo: 'encanto', chave: entrada.chave, nome: entrada.nome,
      livro: entrada.livro, pagina: entrada.pagina, conta2: custa2
    });
    restantes -= custa2 ? 2 : 1;
    numero++;
  }
  return { id: novoId(), tipo: 'itemMagico', nivel, item, encantos };
}

async function resolverResultadoMagico(sessao, celula) {
  return comEscolha2D(
    sessao, celula.duasEscolhas,
    'Tipo de Item Mágico (1d6 — 1-2 arma, 3 armadura/escudo, 4 esotérico, 5-6 acessório)',
    async (s, d6) => {
      const categoria = categoriaMagicaPorD6(d6);
      if (categoria === 'acessorio') {
        const tabelaId = TABELA_ID_ACESSORIO[celula.nivel];
        const entrada = await resolverEntradaTabela(s, tabelaId, `Acessório (${ROTULO_NIVEL[celula.nivel]})`);
        const node = await nodeItemDeEntrada(tabelaId, entrada);
        node.nivel = celula.nivel;
        return node;
      }
      return resolverMagicoBuild(s, celula.nivel, categoria);
    }
  );
}

/* ─── Poções ────────────────────────────────────────────────────────────── */
async function resolverPocao(sessao, quantidade, maisPct) {
  const rollQtd = await sessao.formula(quantidade, 'Quantidade de Poções');
  const n = Math.max(0, Math.floor(rollQtd.total));
  const dado = dadoResolvido('pocoes');
  const itens = [];
  for (let i = 1; i <= n; i++) {
    const { total: valor } = await sessao.d(dado, `Poção #${i} (1d${dado})`, maisPct ? { ajustar: t => Math.min(dado, t + 20) } : {});
    const entrada = entradaPorRolagem('pocoes', valor);
    itens.push(await nodeItemDeEntrada('pocoes', entrada));
  }
  return { id: novoId(), tipo: 'grupo', rotulo: 'pocoes', itens };
}

/* ─── Riquezas (Tabela 8-2) ─────────────────────────────────────────────── */
async function resolverRiquezaUnidade(sessao, categoria, maisPct) {
  const { total: valorTipo } = await sessao.d(100, 'Tabela 8-2 — Valor da Riqueza', maisPct ? { ajustar: t => Math.min(100, t + 20) } : {});
  const faixa = faixaValorPor(categoria, valorTipo);
  if (!faixa) return null;

  const rollValor = await sessao.formula(faixa.formula, `Tabela 8-2 — Preço da Riqueza (${faixa.formula})`);
  const dadoExemplos = dadoResolvidoExemplosRiqueza(faixa.id);
  const { total: totalExemplo } = await sessao.d(dadoExemplos, 'Tabela 8-2 — Exemplo de Riqueza');
  const exemplo = exemploRiquezaPorRolagem(faixa.id, totalExemplo);

  let espacos = exemplo?.espacos ?? null;
  if (espacos === null || espacos === undefined) {
    const { total: totalEspacos } = await sessao.d(20, 'Espaços da Riqueza');
    const faixaEspaco = ESPACOS_RIQUEZA.find(e => totalEspacos >= e.min && totalEspacos <= e.max);
    espacos = faixaEspaco?.espacos ?? 1;
  }

  const tabelaId = idTabelaExemplosRiqueza(faixa.id);
  const nome = exemplo?.nome ?? 'Riqueza';
  const vinculo = await resolverReferencia(tabelaId, nome, nome, { riqueza: true });

  return {
    id: novoId(), tipo: 'item', tabela: tabelaId, chave: nome, nome,
    preco: rollValor.total, espacos, categoriaRiqueza: categoria, faixaValor: faixa.id, vinculo
  };
}

async function resolverRiqueza(sessao, quantidade, categoria, maisPct) {
  const rollQtd = await sessao.formula(quantidade, 'Quantidade de Riquezas');
  const n = Math.max(0, Math.floor(rollQtd.total));
  const itens = [];
  for (let i = 0; i < n; i++) {
    const item = await resolverRiquezaUnidade(sessao, categoria, maisPct);
    if (item) itens.push(item);
  }
  return { id: novoId(), tipo: 'grupo', rotulo: 'riquezas', itens };
}

/* ─── Dinheiro ──────────────────────────────────────────────────────────── */
// As linhas do PDF que dizem só "T$" viram 'generico' em dados-nd.mjs. T$ é o
// Tibar padrão, que no Tormenta20 é o Tibar de PRATA — chave `tp` no sistema
// (schemaCurrency: tp = T20.CurrencySilverValue, exchangeRate 1, primary).
// Mapear para 'to' (Ouro) multiplicava por 10 todo tesouro em dinheiro.
// As linhas que dizem TC ou TO explicitamente já vêm com a moeda própria.
async function resolverDinheiro(sessao, formula, moeda) {
  const roll = await sessao.formula(formula, `Dinheiro (${formula})`);
  return {
    id: novoId(), tipo: 'dinheiro', moeda: moeda === 'generico' ? 'tp' : moeda,
    formula, valor: Math.max(0, Math.floor(roll.total))
  };
}

/* ─── Dispatch por tipo de célula (ver dados-nd.mjs) ───────────────────── */
async function resolverCelula(sessao, celula) {
  switch (celula.tipo) {
    case 'nada': return null;
    case 'dinheiro': return resolverDinheiro(sessao, celula.formula, celula.moeda);
    case 'riqueza': return resolverRiqueza(sessao, celula.quantidade, celula.categoria, celula.maisPct);
    case 'itemDiverso': return resolverItemDiverso(sessao);
    case 'equipamento': return resolverEquipamento(sessao, celula.duasEscolhas);
    case 'pocao': return resolverPocao(sessao, celula.quantidade, celula.maisPct);
    case 'superior': return resolverResultadoSuperior(sessao, celula);
    case 'magico': return resolverResultadoMagico(sessao, celula);
    default: throw new Error(`t20-hayd-tesouros | Tipo de célula desconhecido: ${celula.tipo}`);
  }
}

/** Rerola um único resultado já gerado, a partir da célula de origem (botão "rerolar" na UI). */
export async function rerolarResultado(celula, sessao = sessaoAutomatica()) {
  const resultado = await resolverCelula(sessao, celula);
  return { resultado, trilha: sessao.trilha };
}

function achaFaixa(faixas, rolagem) {
  return faixas.find(f => rolagem >= f.min && rolagem <= f.max) ?? null;
}

/**
 * Resolve uma coluna da Tabela 8-1 (a rolagem de d% que decide dinheiro OU
 * itens daquele ND) numa sessão já criada por quem chama (auto ou passo).
 * A trilha final da entrada cobre a cadeia INTEIRA, começando por essa
 * primeira rolagem.
 */
export async function resolverColuna(faixasColuna, sessao, rotuloColuna) {
  const { total } = await sessao.d(100, rotuloColuna);
  const celula = achaFaixa(faixasColuna, total);
  if (!celula) return null;
  // Snapshot do passo que escolheu a célula — fica estável mesmo se a entrada
  // for rerolada depois (rerolarResultado não passa por aqui de novo, então
  // sem isso o "d% que escolheu esta linha do ND" se perderia num reroll).
  const trilhaColuna = [...sessao.trilha];
  const resultado = await resolverCelula(sessao, celula);
  return resultado ? { id: novoId(), celula, resultado, trilha: sessao.trilha, trilhaColuna } : null;
}

/** Divide pela metade (arredondando para baixo) todo valor monetário de um resultado da coluna Dinheiro. */
export function aplicarMetadeResultado(resultado) {
  if (!resultado) return;
  if (resultado.tipo === 'dinheiro') {
    resultado.valor = Math.floor(resultado.valor / 2);
    resultado.metadeAplicada = true;
  } else if (resultado.tipo === 'grupo') {
    for (const item of resultado.itens) {
      if (typeof item.preco === 'number') { item.preco = Math.floor(item.preco / 2); item.metadeAplicada = true; }
    }
  } else if (resultado.tipo === 'item' && typeof resultado.preco === 'number') {
    resultado.preco = Math.floor(resultado.preco / 2);
    resultado.metadeAplicada = true;
  }
}

/**
 * Gera um tesouro para um ND: rola cada coluna da Tabela 8-1 uma vez.
 *
 * Não há mais "modificador". Tesouro dobrado é o Mestre rolar duas vezes (o
 * botão de rolar coluna já acumula entradas), e "metade" virou uma ação por
 * entrada — `aplicarMetadeResultado`, ligada ao botão de cortar valor —, que
 * é mais útil por permitir cortar só o que o Mestre quiser.
 *
 * `criarSessao()` é chamada uma vez POR COLUNA rolada (cada coluna tem sua
 * própria trilha) — o padrão é `sessaoAutomatica`; passe uma fábrica que
 * devolva sessões em modo "passo" para o modo interativo.
 */
export async function gerarTesouro(nd, criarSessao = sessaoAutomatica) {
  const linha = TABELA_ND[nd];
  if (!linha) throw new Error(`t20-hayd-tesouros | ND inválido: ${nd}`);

  const dinheiro = [];
  const itens = [];
  const colDinheiro = await resolverColuna(linha.dinheiro, criarSessao(), `Tabela 8-1 — ND ${nd} — Dinheiro`);
  if (colDinheiro) dinheiro.push(colDinheiro);
  const colItens = await resolverColuna(linha.itens, criarSessao(), `Tabela 8-1 — ND ${nd} — Itens`);
  if (colItens) itens.push(colItens);

  return { nd, dinheiro, itens };
}
