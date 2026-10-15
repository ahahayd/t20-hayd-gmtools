/**
 * Planejador de Níveis — gravar um nível na ficha.
 *
 *  1. a classe: soma 1 em `niveis` se o personagem já a tem, ou entra como
 *     classe nova (multiclasse) de 1º nível;
 *  2. habilidades, poderes e magias do nível entram de uma vez, com a anotação
 *     de origem da Ficha Hayd (categoria "nivel", nível N) quando o T20 Hayd UI
 *     está ativo;
 *  3. perícias treinadas e proficiências do nível;
 *  4. habilidades que escalam em dados (Ataque Furtivo) têm o dado ajustado;
 *  5. PV e PM sobem junto com o máximo novo (o personagem não "perde" o
 *     ganho do nível por estar ferido).
 */
import { MODULE_ID } from '../criacao/fontes.mjs';
import { nivelDaHabilidade, subtipoDe } from '../criacao/regras.mjs';
import { PROFICIENCIAS } from '../criacao/aplicar.mjs';
import { escalonamento, dadosNoNivel, ajustarDadosNasRolagens } from './regras-niveis.mjs';

export const UI_ID = 't20-hayd-ui';
export const FLAG_PLANO = 'planoNiveis';

/** Categoria da Ficha Hayd sugerida pelo tipo do poder no sistema. */
export const CATEGORIA_POR_TIPO = { racial: 'raca', origem: 'origem', complicacao: 'complicacao', concedido: 'devocao' };

export function uiAtivo() {
  return !!game.modules.get(UI_ID)?.active;
}

async function dadosDoItem(ref) {
  const doc = await fromUuid(ref.uuid).catch(() => null);
  if (!doc) return null;
  const dados = game.items.fromCompendium(doc, { keepId: false });
  delete dados._id;
  return dados;
}

/**
 * As habilidades da classe (já na ficha) que escalam, no nível de classe
 * `nivelClasse`: { item, escala, alvo } — `alvo` é a quantidade de dados nova
 * quando dá para ajustar sozinho, ou null quando só cabe o aviso.
 */
export function escalasDaClasse(actor, nomeClasse, nivelClasse) {
  const out = [];
  for (const item of actor.items) {
    if (item.type !== 'poder' || item.system?.tipo !== 'ability' || !subtipoDe(item.system?.subtipo, nomeClasse)) continue;
    const desc = item.system?.description?.value ?? '';
    const escala = escalonamento(desc);
    if (!escala) continue;
    const alvo = dadosNoNivel(escala, nivelDaHabilidade(desc), nivelClasse);
    const atual = alvo === null ? null
      : (item.system.rolls ?? []).flatMap(r => r.parts ?? []).map(p => String(p?.[0] ?? '').match(/^(\d+)d(\d+)$/))
        .find(m => m && Number(m[2]) === escala.incremento.faces);
    out.push({ item, escala, alvo: atual ? alvo : null, atual: atual ? Number(atual[1]) : null });
  }
  return out;
}

/**
 * @param {Actor} actor
 * @param {number} nivel        o nível de personagem que está sendo aplicado
 * @param {object} plano        { classe: {uuid, nome, img}, habilidades, poderes, magias, pericias, prof }
 * @returns {Promise<{faltando: string[], criados: string[], ajustados: string[], nivelClasse: number}>}
 */
export async function aplicarNivel(actor, nivel, plano) {
  const faltando = [];
  const ajustados = [];
  const pvAntes = Number(actor.system.attributes?.pv?.max) || 0;
  const pmAntes = Number(actor.system.attributes?.pm?.max) || 0;

  // 1. Classe
  const existente = actor.items.find(i => i.type === 'classe' && subtipoDe(i.name, plano.classe.nome));
  let nivelClasse;
  if (existente) {
    nivelClasse = (Number(existente.system.niveis) || 0) + 1;
    await existente.update({ 'system.niveis': nivelClasse });
  } else {
    const dados = await dadosDoItem(plano.classe);
    if (!dados) throw new Error(`Classe não encontrada: ${plano.classe.nome}`);
    dados.system.niveis = 1;
    dados.system.inicial = !actor.items.some(i => i.type === 'classe');
    await actor.createEmbeddedDocuments('Item', [dados]);
    nivelClasse = 1;
  }

  // 2. Habilidades, poderes e magias
  const lote = [];
  const conjuracao = actor.system.attributes?.conjuracao;
  for (const ref of [...(plano.habilidades ?? []), ...(plano.poderes ?? []), ...(plano.magias ?? [])]) {
    const dados = await dadosDoItem(ref);
    if (!dados) { faltando.push(ref.nome); continue; }
    if (dados.type === 'magia' && conjuracao && dados.system?.resistencia) dados.system.resistencia.atributo = conjuracao;
    if (uiAtivo() && ['poder', 'magia'].includes(dados.type)) {
      const categoria = CATEGORIA_POR_TIPO[dados.system?.tipo] ?? 'nivel';
      foundry.utils.setProperty(dados, `flags.${UI_ID}.origemPoder`, { categoria, nivel });
    }
    lote.push(dados);
  }
  const criados = lote.length ? await actor.createEmbeddedDocuments('Item', lote) : [];

  // 3. Perícias e proficiências
  const upd = {};
  for (const k of plano.pericias ?? []) if (actor.system.pericias?.[k]) upd[`system.pericias.${k}.treinado`] = true;
  for (const campo of ['profArmas', 'profArmaduras']) {
    const atuais = new Set(actor.system.tracos?.[campo]?.value ?? []);
    let mudou = false;
    for (const p of PROFICIENCIAS) if (p.campo === campo && plano.prof?.[p.id] && !atuais.has(p.valor)) { atuais.add(p.valor); mudou = true; }
    if (mudou) upd[`system.tracos.${campo}.value`] = [...atuais];
  }
  if (!foundry.utils.isEmpty(upd)) await actor.update(upd);

  // 4. Dados que escalam
  for (const { item, escala, alvo } of escalasDaClasse(actor, plano.classe.nome, nivelClasse)) {
    if (alvo === null) continue;
    const { rolls, mudou } = ajustarDadosNasRolagens(item.system.rolls, escala.incremento.faces, alvo);
    if (mudou) { await item.update({ 'system.rolls': rolls }); ajustados.push(`${item.name} (${alvo}d${escala.incremento.faces})`); }
  }

  // 5. Nível do personagem e recursos
  actor.reset();
  const fim = { 'system.attributes.nivel.value': nivel };
  const pv = actor.system.attributes?.pv, pm = actor.system.attributes?.pm;
  if (Number.isFinite(pv?.max) && pv.max > pvAntes) fim['system.attributes.pv.value'] = (Number(pv.value) || 0) + (pv.max - pvAntes);
  if (Number.isFinite(pm?.max) && pm.max > pmAntes) fim['system.attributes.pm.value'] = (Number(pm.value) || 0) + (pm.max - pmAntes);
  await actor.update(fim);

  return { faltando, criados: criados.map(i => i.id), ajustados, nivelClasse };
}

/** Card de chat do nível novo. */
export async function anunciarNiveis(actor, passos, novoPatamar = null) {
  const esc = foundry.utils.escapeHTML;
  const ultimo = passos.at(-1);
  const ajustados = [...new Set(passos.flatMap(p => p.ajustados))];
  const classes = passos.length > 1
    ? `Subiu ${passos.length} níveis: ${passos.map(p => `${esc(p.classe.nome)} ${p.classe.nivel}`).join(', ')}`
    : esc(ultimo.classe.nome);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="t20g-cc-chat ${novoPatamar ? `t20g-nv-chat--${novoPatamar.id}` : ''}">
      <img src="${actor.img}" alt="">
      <div><b>${esc(actor.name)}</b> chegou ao <b>${ultimo.nivel}º nível</b>!
      <br>${classes}${ajustados.length ? `<br><em>Atualizado: ${esc(ajustados.join(', '))}</em>` : ''}
      ${novoPatamar ? `<div class="t20g-nv-chat-patamar"><i class="fa-solid ${novoPatamar.icone}"></i> Agora é <b>${esc(novoPatamar.nome)}</b> — ${esc(novoPatamar.texto)}</div>` : ''}</div>
    </div>`
  });
}
