/**
 * Efeitos ativos mantidos pelas automações.
 *
 * Vive fora do motor porque as auras também precisam disso e não podem
 * importar `motor.mjs` — a direção de import é sempre motor → domínio.
 */
import { MODULE_ID } from './runtime.mjs';
import { ehV14, efeitoV14, usoDe } from '../versao.mjs';

/** Flag no EFEITO: chave da automação que o originou. */
export const FLAG_ORIGEM = 'automacaoOrigem';

/*
 * Onde moram os efeitos de uso das automações:
 *  - v13 (Tormenta20 1.5): soltos na ficha do ator.
 *  - v14 (Tormenta20 1.6): dentro do próprio poder — no 1.6 os efeitos de
 *    uso de um item aparecem na janela de uso mesmo morando nele.
 * A chave é item.id ou item.id:sufixo — o item sai da própria chave.
 */

/** O poder dono de uma chave de automação. */
function itemDaChave(ator, chave) {
  return ator?.items?.get(String(chave ?? '').split(':')[0]) ?? null;
}

/** Onde procurar os efeitos de uma chave nesta versão. */
function efeitosDaChave(ator, chave) {
  return (ehV14() ? itemDaChave(ator, chave)?.effects : ator?.effects) ?? [];
}

/** Efeito mantido pelo módulo sob uma chave (item.id, ou item.id:sufixo). */
export function efeitoPorChave(ator, chave) {
  return efeitosDaChave(ator, chave).find((ef) => ef.getFlag(MODULE_ID, FLAG_ORIGEM) === chave);
}

/** Todos os efeitos que usam exatamente a mesma chave de automação. */
export function efeitosPorChave(ator, chave) {
  return efeitosDaChave(ator, chave).filter((ef) => ef.getFlag(MODULE_ID, FLAG_ORIGEM) === chave);
}

/** v14: efeitos das automações ainda soltos na ficha do ator (formato do v13). */
export function efeitosLegadosNoAtor(ator) {
  return (ator?.effects ?? []).filter((ef) => ef.getFlag(MODULE_ID, FLAG_ORIGEM));
}

/**
 * Cria o efeito de uso de uma automação: dentro do poder (v14, já no formato
 * do Tormenta20 1.6) ou na ficha do ator (v13).
 */
export async function criarEfeitoDoPoder(item, dados) {
  if (ehV14()) return item.createEmbeddedDocuments('ActiveEffect', [efeitoV14({ ...dados, origin: item.uuid })]);
  return item.actor.createEmbeddedDocuments('ActiveEffect', [{ ...dados, origin: item.uuid }]);
}

/**
 * O efeito já está exatamente como o módulo quer?
 *
 * Mirar um token dispara duas sincronizações (desmarcar o antigo, marcar o
 * novo) e a mesa troca de alvo o tempo todo. Sem esta comparação, cada clique
 * reescrevia todos os efeitos de Combinação do personagem — e cada escrita é
 * banco de dados, socket para todos os clientes e re-preparo da ficha. Nas
 * auras o efeito é o mesmo: mover um token recalcula todo mundo na área.
 *
 * Compara só o que o módulo define: o sistema pode guardar outras flags no
 * efeito, e elas não são motivo para reescrever.
 */
export function efeitoEmDia(efeito, dados) {
  if (!efeito) return false;
  return ehV14() ? efeitoEmDiaV14(efeito, dados) : efeitoEmDiaV13(efeito, dados);
}

/** v13: `changes` + `mode` e flags tormenta20 no efeito. */
function efeitoEmDiaV13(efeito, dados) {
  if (efeito.name !== dados.name) return false;
  if (efeito.img !== dados.img) return false;
  if (!!efeito.disabled !== !!dados.disabled) return false;

  const atuais = efeito.changes ?? [];
  const novas = dados.changes ?? [];
  if (atuais.length !== novas.length) return false;
  for (let i = 0; i < novas.length; i += 1) {
    const a = atuais[i];
    const n = novas[i];
    if (a?.key !== n?.key || a?.mode !== n?.mode || String(a?.value) !== String(n?.value)) {
      return false;
    }
  }

  const t20 = efeito.flags?.tormenta20 ?? {};
  for (const [chave, valor] of Object.entries(dados.flags?.tormenta20 ?? {})) {
    if (t20[chave] !== valor) return false;
  }
  return true;
}

/**
 * v14: os dados chegam no formato do v13 ou já convertidos; o efeito gravado
 * está sempre no formato do Tormenta20 1.6 (system.changes, system.abilityUse).
 */
function efeitoEmDiaV14(efeito, dados) {
  const novo = efeitoV14(dados);
  if (efeito.name !== novo.name) return false;
  if (efeito.img !== novo.img) return false;
  if (novo.description !== undefined && (efeito.description ?? '') !== (novo.description ?? '')) return false;
  if (!!efeito.disabled !== !!novo.disabled) return false;

  const atuais = efeito.system?.changes ?? [];
  const novas = novo.system?.changes ?? [];
  if (atuais.length !== novas.length) return false;
  for (let i = 0; i < novas.length; i += 1) {
    const a = atuais[i];
    const n = novas[i];
    if (a?.key !== n?.key || a?.type !== n?.type || String(a?.value) !== String(n?.value)) {
      return false;
    }
  }

  if ('onuse' in (novo.system ?? {}) && !!efeito.system?.onuse !== !!novo.system.onuse) return false;
  const uso = novo.system?.abilityUse;
  if (uso) {
    const atual = usoDe(efeito);
    const mesmoConjunto = (a, b) => a.size === b.length && b.every((x) => a.has(x));
    if (atual.automatico !== !!uso.automatic || atual.aumenta !== !!uso.aumenta) return false;
    if ((atual.custo ?? null) !== (uso.custo ?? null)) return false;
    if (!mesmoConjunto(atual.tipos, uso.types ?? []) || !mesmoConjunto(atual.nomes, uso.names ?? [])) return false;
  }
  if (novo.duration?.expiry !== undefined && (efeito.duration?.expiry ?? null) !== (novo.duration.expiry ?? null)) return false;
  return true;
}

/* ─── v14: padrão de efeito de uso do Tormenta20 1.6 ────────────────────── */

const ROTULOS_MUDANCA = {
  ataque: 'no ataque',
  dano: 'no dano',
  roll: 'no teste',
  cd: 'na CD',
  'system.attributes.defesa.bonus': 'na Defesa'
};

/**
 * Texto legível das mudanças de um efeito ("+2 no ataque, +2 no dano"). No
 * 1.6 o título do efeito de uso é curto (o nome do poder) e é a descrição
 * que diz o que ele faz, na janela de uso e no cartão do chat.
 */
export function textoDasMudancas(changes = []) {
  return changes
    .map((c) => {
      const valor = String(c.value ?? '');
      const sinal = /^[-+]/.test(valor) ? valor : `+${valor}`;
      return `${sinal} ${ROTULOS_MUDANCA[c.key] ?? c.key}`;
    })
    .join(', ');
}

/** Descrição de efeito de uso num parágrafo só (o chat do 1.6 exige uma raiz). */
export function descricaoDeUso(...partes) {
  const texto = partes.filter(Boolean).join(' ').trim();
  return texto ? `<p>${texto}</p>` : '';
}
