/**
 * Auras — efeitos nos aliados e cura.
 *
 * Só roda no cliente do Mestre ativo: escrever em ficha de outro jogador exige
 * permissão que o dono da aura não tem.
 */
import { MODULE_ID } from '../runtime.mjs';
import { efeitoEmDia } from '../efeitos.mjs';
import { ehV14, paraOSistema } from '../../versao.mjs';
import { tokensNaAura, nomeDaDisposicao } from './alcance.mjs';
import { efeitoAfeta } from './modelo.mjs';
import { testar, registroDe, situacaoDoAlvo, gravarResistencias } from './resistencia.mjs';
import {
  aurasDoAtor, raioDaAura, modificadorDeCura
} from './estado.mjs';
import { diferencaDeAlvos, curaDaAura, clampCura, desfazerCura } from './regras.mjs';

/** Flag no EFEITO do aliado: de qual aura ele veio. */
export const FLAG_AURA_EFEITO = 'auraEfeito';

/** Todos os atores que podem carregar efeito de aura, inclusive sintéticos. */
function atoresAlcancaveis() {
  const lista = new Set(game.actors ?? []);
  for (const token of canvas?.scene?.tokens ?? []) {
    if (token.actor) lista.add(token.actor);
  }
  return [...lista];
}

/**
 * Token da fonte, sempre buscado na cena viva.
 *
 * O índice de atores guarda INSTÂNCIAS de ator, e para token não vinculado
 * essa instância é sintética: depois de um movimento ela pode ficar velha, e
 * aí a área toda seria medida em volta da posição ANTERIOR — que é exatamente
 * o sintoma de "andei uma vez e não valeu, andei de novo e valeu". Buscar
 * pelo id do token na cena garante posição e atributos do momento.
 */
function tokenVivoDaFonte(fonte, estado) {
  const porId = estado?.token ? canvas?.tokens?.get(estado.token) : null;
  if (porId?.actor) return porId;

  const uuid = fonte?.uuid;
  return canvas?.tokens?.placeables?.find((t) => t.actor?.uuid === uuid) ?? null;
}

/**
 * Efeitos de uma aura específica espalhados pela mesa — no máximo um por
 * ator e por parte (um Modelo de Aura pode dar um passivo E um de uso).
 *
 * Duas sincronizações sobrepostas (token arrastado por mais tempo que o
 * debounce, com a rodada anterior ainda gravando) podem cada uma decidir
 * "este aliado ainda não tem o efeito" antes de qualquer uma das duas
 * terminar de criar o dela, e o aliado acaba com dois. Aqui é onde isso se
 * corrige: se um ator tiver mais de um efeito desta aura na mesma parte,
 * mantém só o mais antigo e apaga o resto.
 */
async function efeitosDaAura(fonteId, itemId) {
  const porChave = new Map();
  for (const ator of atoresAlcancaveis()) {
    for (const efeito of ator.effects ?? []) {
      const marca = efeito.getFlag(MODULE_ID, FLAG_AURA_EFEITO);
      if (marca?.fonte !== fonteId || marca?.item !== itemId) continue;
      // Efeito gravado antes das partes existirem é o passivo
      const chave = chaveDe(ator, marca.parte ?? 'passivo');
      if (!porChave.has(chave)) porChave.set(chave, []);
      porChave.get(chave).push({ ator, efeito, chave });
    }
  }

  const achados = [];
  for (const lista of porChave.values()) {
    const [primeiro, ...duplicatas] = lista;
    achados.push(primeiro);
    for (const { efeito } of duplicatas) await efeito.delete().catch(() => null);
  }
  return achados;
}

const chaveDe = (ator, parte) => `${ator.uuid}|${parte}`;

/**
 * Partes que a aura dá a um alvo. As auras do catálogo dão uma só, passiva,
 * a partir de `valor`/`changes`; o Modelo de Aura monta as suas.
 */
function partesDaAura(def, vivo, alvo, estado) {
  if (def.aura.partes) return def.aura.partes(vivo, alvo, estado?.aprimoramentos ?? {});
  const valor = def.aura.valor(vivo);
  return [{
    parte: 'passivo',
    rotulo: def.aura.rotuloValor?.(valor) ?? `+${valor}`,
    changes: def.aura.changes(valor),
    statuses: [],
    flagsT20: { onuse: false, custo: '0' }
  }];
}

/** Dados do efeito que o aliado deve ter neste instante. */
function dadosDoEfeito(item, def, parte, fonteId) {
  const base = parte.nome ?? item.name;
  return {
    name: parte.rotulo ? `${base} (${parte.rotulo})` : base,
    img: item.img,
    // Modelo de Aura com condição: o token mostra o ícone dela também.
    statuses: [...(parte.statuses ?? [])],
    disabled: false,
    // Ícone no token. Quem tira o efeito é sempre a geometria (sincronizarAura,
    // ao sair da área ou perder linha de visão).
    // v14: o ícone vem de `showIcon`; uma duração fictícia entraria no
    // registro de expiração do núcleo.
    // v13: sem `duration` o T20 trata o efeito como passivo e não mostra
    // ícone; o número só precisa ser grande o bastante para nunca zerar
    // sozinho numa sessão real.
    ...(ehV14()
      ? { showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS, duration: { value: null, expiry: null } }
      : { duration: { rounds: 999 } }),
    changes: parte.changes,
    flags: {
      // Parte de uso: entra na janela de rolagem de quem está na área.
      tormenta20: parte.flagsT20,
      [MODULE_ID]: {
        [FLAG_AURA_EFEITO]: { fonte: fonteId, item: item.id, aura: def.id, parte: parte.parte }
      }
    }
  };
}

/**
 * Testes de resistência pendentes da sincronização: rola para quem acabou de
 * entrar (efeitos "ao entrar") e esquece o teste de quem saiu, para que
 * voltar à área teste de novo. Os testes por turno são rolados em
 * `testarNoTurno`; aqui só são lidos.
 *
 * @returns {object} registros já atualizados, { [parte]: { [tokenId]: { passou } } }
 */
async function resolverResistencias(fonte, item, def, estado, candidatos) {
  const registros = JSON.parse(JSON.stringify(estado?.resistencias ?? {}));
  const resistiveis = candidatos.filter((c) => c.resiste);

  const pendentes = resistiveis.filter(({ token, parte }) =>
    situacaoDoAlvo(parte.resistencia, registroDe(estado, parte.parte, token.id)) === 'rolar');
  for (const m of await testar(fonte, item, pendentes)) {
    (registros[m.parte] ??= {})[m.token] = { passou: m.passou };
  }

  // Saiu da área (ou o efeito sumiu do modelo): o teste "ao entrar" é esquecido
  const presentes = new Set(resistiveis.map(({ token, parte }) => `${parte.parte}|${token.id}`));
  const efeitos = def.aura.modelo?.efeitos ?? [];
  const esquecer = [];
  for (const [parte, porToken] of Object.entries(registros)) {
    const quando = efeitos.find((e) => e.id === parte)?.resistencia;
    const porEntrada = !quando?.ativa || quando.quando === 'entrar';
    for (const [token, reg] of Object.entries(porToken ?? {})) {
      if (!reg || !porEntrada || presentes.has(`${parte}|${token}`)) continue;
      esquecer.push({ parte, token, passou: null });
      porToken[token] = null;
    }
  }
  await gravarResistencias(fonte, item.id, esquecer);
  return registros;
}

/** `efeitoEmDia` não olha condições; trocar a do modelo precisa regravar. */
function mesmasCondicoes(efeito, dados) {
  const atuais = [...(efeito.statuses ?? [])].sort().join(',');
  return atuais === [...(dados.statuses ?? [])].sort().join(',');
}

/**
 * Põe uma aura em dia: cria nos que entraram, atualiza quem mudou de valor,
 * remove de quem saiu do alcance ou ficou atrás de parede.
 *
 * @returns {number} quantos aliados estão sob a aura agora
 */
export async function sincronizarAura(fonte, { item, def, estado }) {
  const tokenFonte = tokenVivoDaFonte(fonte, estado);
  if (!tokenFonte) return 0;

  // O ator do token vivo, não o do índice: aquele pode ser uma cópia antiga,
  // com posição e Carisma de antes.
  const vivo = tokenFonte.actor ?? fonte;
  const raio = raioDaAura(vivo, def);

  // O valor costuma ser o mesmo para todos (atributo da fonte). Só o Modelo
  // de Aura com fórmula do alvo (`@alvo.car`) calcula um por aliado.
  const comuns = def.aura.porAlvo ? null : partesDaAura(def, vivo, null, estado);
  const partesPara = (ator) => (comuns ?? partesDaAura(def, vivo, ator, estado))
    // Sem bônus nenhum não há efeito a manter (evita efeito vazio na ficha).
    .filter((p) => p.changes.length || p.statuses?.length);

  const candidatos = [];
  for (const token of tokensNaAura(tokenFonte, def.aura, raio)) {
    if (!token.actor) continue;
    // Cada efeito do Modelo de Aura tem o seu público (bônus aos aliados,
    // penalidade aos inimigos…); os do catálogo não trazem `alvos`.
    const quem = { disposicao: nomeDaDisposicao(token), ehFonte: token.id === tokenFonte.id };
    for (const parte of partesPara(token.actor)) {
      if (parte.alvos && !efeitoAfeta(parte.alvos, quem)) continue;
      candidatos.push({ token, parte, resiste: !!parte.resistencia && !quem.ehFonte });
    }
  }

  const registros = await resolverResistencias(fonte, item, def, estado, candidatos);

  const desejado = new Map();
  for (const { token, parte, resiste } of candidatos) {
    // Efeito resistível só entra em quem falhou no último teste
    if (resiste && situacaoDoAlvo(parte.resistencia, registros[parte.parte]?.[token.id]) !== 'aplicar') continue;
    desejado.set(chaveDe(token.actor, parte.parte), {
      ator: token.actor, dados: dadosDoEfeito(item, def, parte, fonte.id)
    });
  }

  const existentes = await efeitosDaAura(fonte.id, item.id);
  const { criar, remover } = diferencaDeAlvos(existentes.map((e) => e.chave), [...desejado.keys()]);

  // Sai de quem não está mais na área (ou da parte que deixou de existir)
  for (const { efeito, chave } of existentes) {
    if (remover.includes(chave)) await efeito.delete();
  }

  // Entra em quem chegou
  for (const chave of criar) {
    const { ator, dados } = desejado.get(chave);
    await ator.createEmbeddedDocuments('ActiveEffect', [paraOSistema({ ...dados, origin: item.uuid })]);
  }

  // Acompanha o valor de quem já tinha (o Carisma da fonte pode ter mudado)
  for (const { efeito, chave } of existentes) {
    if (remover.includes(chave)) continue;
    const { dados } = desejado.get(chave);
    if (!efeitoEmDia(efeito, dados) || !mesmasCondicoes(efeito, dados)) {
      await efeito.update(paraOSistema(dados));
    }
  }

  return new Set([...desejado.values()].map((d) => d.ator.uuid)).size;
}

/** Tira uma aura de todo mundo. */
export async function limparAura(fonteId, itemId) {
  const existentes = await efeitosDaAura(fonteId, itemId);
  for (const { efeito } of existentes) await efeito.delete();
  return existentes.length;
}

/**
 * Remove efeitos de auras que não estão mais ligadas.
 *
 * Rede de segurança para quando a flag foi apagada com o Mestre offline: sem
 * isto o bônus ficaria pendurado nos aliados para sempre.
 */
export async function limparOrfaos() {
  let removidos = 0;
  for (const ator of atoresAlcancaveis()) {
    for (const efeito of [...(ator.effects ?? [])]) {
      const marca = efeito.getFlag(MODULE_ID, FLAG_AURA_EFEITO);
      if (!marca?.fonte) continue;

      const fonte = game.actors.get(marca.fonte)
        ?? atoresAlcancaveis().find((a) => a.id === marca.fonte);
      const ativa = fonte
        ? aurasDoAtor(fonte).some(({ item }) => item.id === marca.item)
        : false;

      if (!ativa) {
        await efeito.delete();
        removidos += 1;
      }
    }
  }
  return removidos;
}

/* ─── Cura ───────────────────────────────────────────────────────────────── */

/**
 * Aplica a cura da aura em todos que estão dentro dela AGORA.
 *
 * A lista é recalculada no instante do clique, não reaproveitada da ativação:
 * quem entrou na área desde então recebe, quem saiu não.
 *
 * @returns {{quanto: number, alvos: object[]}}
 */
export async function aplicarCura(fonte, { item, def, estado }) {
  const tokenFonte = tokenVivoDaFonte(fonte, estado);
  const vivo = tokenFonte?.actor ?? fonte;

  const modificador = modificadorDeCura(vivo);
  if (!modificador) return { quanto: 0, alvos: [] };

  const chave = modificador.cura.atributo ?? 'car';
  const atributo = Number(vivo?.system?.atributos?.[chave]?.value) || 0;
  const quanto = curaDaAura(modificador, atributo);
  if (quanto <= 0) return { quanto: 0, alvos: [] };

  if (!tokenFonte) return { quanto, alvos: [] };

  const raio = raioDaAura(vivo, def);
  const alvos = [];

  for (const token of tokensNaAura(tokenFonte, def.aura, raio)) {
    const ator = token.actor;
    if (!ator) continue;
    if (!ator.isOwner && !game.user.isGM) continue;

    const pv = ator.system?.attributes?.pv ?? {};
    const { novo, ganho } = clampCura(pv.value, pv.max, quanto);
    if (ganho > 0) await ator.update({ 'system.attributes.pv.value': novo });

    alvos.push({ uuid: ator.uuid, nome: token.name ?? ator.name, ganho, desfeito: false });
  }

  return { quanto, alvos };
}

/** Devolve o PV de uma cura já aplicada (morto-vivo, decisão do Mestre…). */
export async function desfazerCuraDe(uuid, ganho) {
  const ator = await fromUuid(uuid);
  if (!ator?.system?.attributes?.pv) return false;
  const atual = ator.system.attributes.pv.value;
  await ator.update({ 'system.attributes.pv.value': desfazerCura(atual, ganho) });
  return true;
}

/**
 * Testes "no início do turno": rola para os alvos na área que testam neste
 * momento. `tokenId` restringe a um alvo (o dono do turno, em `turnoAlvo`).
 * O efeito em si é posto em dia pela sincronização seguinte.
 */
export async function testarNoTurno(fonte, { item, def, estado }, { momento, tokenId = null }) {
  if (!def.aura.partes) return;
  const tokenFonte = tokenVivoDaFonte(fonte, estado);
  if (!tokenFonte) return;
  const vivo = tokenFonte.actor ?? fonte;

  const pares = [];
  for (const token of tokensNaAura(tokenFonte, def.aura, raioDaAura(vivo, def))) {
    if (!token.actor || token.id === tokenFonte.id) continue;
    if (tokenId && token.id !== tokenId) continue;
    const quem = { disposicao: nomeDaDisposicao(token), ehFonte: false };
    for (const parte of def.aura.partes(vivo, token.actor, estado?.aprimoramentos ?? {})) {
      if (parte.resistencia?.quando !== momento) continue;
      if (parte.alvos && !efeitoAfeta(parte.alvos, quem)) continue;
      pares.push({ token, parte });
    }
  }
  await testar(fonte, item, pares);
}
