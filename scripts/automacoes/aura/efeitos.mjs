/**
 * Auras — efeitos nos aliados e cura.
 *
 * Só roda no cliente do Mestre ativo: escrever em ficha de outro jogador exige
 * permissão que o dono da aura não tem.
 */
import { MODULE_ID } from '../runtime.mjs';
import { efeitoEmDia } from '../efeitos.mjs';
import { tokensNaAura } from './alcance.mjs';
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

/** Efeitos de uma aura específica espalhados pela mesa. */
function efeitosDaAura(fonteId, itemId) {
  const achados = [];
  for (const ator of atoresAlcancaveis()) {
    for (const efeito of ator.effects ?? []) {
      const marca = efeito.getFlag(MODULE_ID, FLAG_AURA_EFEITO);
      if (marca?.fonte === fonteId && marca?.item === itemId) {
        achados.push({ ator, efeito });
      }
    }
  }
  return achados;
}

/** Dados do efeito que o aliado deve ter neste instante. */
function dadosDoEfeito(item, def, valor, fonteId) {
  return {
    name: `${item.name} (${def.aura.rotuloValor?.(valor) ?? `+${valor}`})`,
    img: item.img,
    disabled: false,
    // Sem `duration` o T20 trata o efeito como passivo e não mostra ícone no
    // token. O número não conta nada: quem tira o efeito é a geometria
    // (sincronizarAura, ao sair da área ou perder linha de visão) — é só
    // grande o bastante para nunca zerar sozinho numa sessão real.
    duration: { rounds: 999 },
    changes: def.aura.changes(valor),
    flags: {
      tormenta20: { onuse: false, custo: '0' },
      [MODULE_ID]: { [FLAG_AURA_EFEITO]: { fonte: fonteId, item: item.id, aura: def.id } }
    }
  };
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
  const valor = def.aura.valor(vivo);
  const dados = dadosDoEfeito(item, def, valor, fonte.id);

  // Sem bônus nenhum não há efeito a manter (evita efeito vazio na ficha).
  const alvos = def.aura.changes(valor).length
    ? tokensNaAura(tokenFonte, def.aura, raio)
    : [];

  const desejados = alvos.map((t) => t.actor?.uuid).filter(Boolean);
  const existentes = efeitosDaAura(fonte.id, item.id);
  const atuais = existentes.map(({ ator }) => ator.uuid);

  const { criar, remover } = diferencaDeAlvos(atuais, desejados);

  // Sai de quem não está mais na área
  for (const { ator, efeito } of existentes) {
    if (remover.includes(ator.uuid)) await efeito.delete();
  }

  // Entra em quem chegou
  for (const uuid of criar) {
    const ator = alvos.find((t) => t.actor?.uuid === uuid)?.actor;
    if (!ator) continue;
    await ator.createEmbeddedDocuments('ActiveEffect', [{ ...dados, origin: item.uuid }]);
  }

  // Acompanha o valor de quem já tinha (o Carisma da fonte pode ter mudado)
  for (const { ator, efeito } of existentes) {
    if (remover.includes(ator.uuid)) continue;
    if (!efeitoEmDia(efeito, dados)) await efeito.update(dados);
  }

  return desejados.length;
}

/** Tira uma aura de todo mundo. */
export async function limparAura(fonteId, itemId) {
  const existentes = efeitosDaAura(fonteId, itemId);
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
