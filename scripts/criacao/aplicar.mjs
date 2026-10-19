/**
 * Assistente de Criação — gravar na ficha.
 *
 * Tudo o que o assistente juntou vira dado do sistema, na ordem em que o
 * próprio sistema espera:
 *
 *  1. raça e classe antigas saem (a raça leva junto os poderes que concedeu);
 *  2. o ator recebe nome, retrato, atributos base, perícias treinadas,
 *     origem, divindade e dinheiro;
 *  3. a raça entra. O sistema, ao receber uma raça, abre o diálogo de
 *     atributos dinâmicos e importa TODOS os poderes concedidos — mas isso o
 *     assistente já resolveu com o jogador. Então a cópia entra com os
 *     dinâmicos já somados e sem concessões, e logo depois os dados originais
 *     voltam para o item (ficha da raça fica igual à do compêndio);
 *  4. a classe entra como classe inicial de 1º nível;
 *  5. poderes, magias e itens entram de uma vez. Os da raça ficam anotados na
 *     raça (`grantedItems`), como o sistema faz — apagar a raça os apaga.
 *
 * Com o T20 Hayd UI ativo, cada poder e magia leva também a anotação de
 * origem (raça, origem, devoção ou 1º nível) que a Ficha Hayd organiza.
 */
import { MODULE_ID } from './fontes.mjs';
import { dividirEmMoedas } from './regras.mjs';
import { apagarChave } from '../versao.mjs';

const UI_ID = 't20-hayd-ui';
export const FLAG_RASCUNHO = 'criacaoRascunho';
export const FLAG_CONCLUIDA = 'criacaoConcluida';

/** Categoria da Ficha Hayd por zona do assistente. */
const CATEGORIA_POR_ZONA = {
  racaPoderes: 'raca',
  racaMagias: 'raca',
  classePoderes: 'nivel',
  classeMagias: 'nivel',
  origemPoderes: 'origem',
  origemMagias: 'origem',
  divindadePoderes: 'devocao',
  divindadeMagias: 'devocao',
  complicacaoPoderes: 'complicacao',
  complicacaoTroca: 'complicacao'
};

/**
 * Cria a raça sem o diálogo de atributos do sistema. Com "Raças Abertas"
 * ligada, o sistema abre esse diálogo para TODA raça que entra na ficha —
 * mas o jogador já distribuiu os modificadores no assistente. Durante a
 * criação (e só nela), a leitura dessa opção responde "desligada".
 */
async function criarRacaSemDialogo(actor, dados) {
  const settings = game.settings;
  const proprio = Object.hasOwn(settings, 'get');
  const original = settings.get;
  settings.get = function (namespace, chave, ...resto) {
    if (namespace === 'tormenta20' && chave === 'openRaces') return false;
    return original.call(this, namespace, chave, ...resto);
  };
  try {
    return (await actor.createEmbeddedDocuments('Item', [dados]))[0];
  } finally {
    // Volta exatamente ao que era: sem propriedade própria, o método do
    // protótipo reaparece sozinho.
    if (proprio) settings.get = original;
    else delete settings.get;
  }
}

/**
 * Proficiências que o jogador marca no equipamento. `campo`/`valor` são os
 * do sistema: `system.tracos.profArmas.value` e `profArmaduras.value`.
 */
export const PROFICIENCIAS = [
  { id: 'simples', campo: 'profArmas', valor: 'simples', rotulo: 'Armas simples' },
  { id: 'marcial', campo: 'profArmas', valor: 'marcial', rotulo: 'Armas marciais' },
  { id: 'exotica', campo: 'profArmas', valor: 'exotica', rotulo: 'Armas exóticas' },
  { id: 'fogo', campo: 'profArmas', valor: 'fogo', rotulo: 'Armas de fogo' },
  { id: 'leve', campo: 'profArmaduras', valor: 'lev', rotulo: 'Armaduras leves' },
  { id: 'pesada', campo: 'profArmaduras', valor: 'pes', rotulo: 'Armaduras pesadas' },
  { id: 'escudo', campo: 'profArmaduras', valor: 'esc', rotulo: 'Escudos' }
];

async function dadosDoItem(ref) {
  const doc = await fromUuid(ref.uuid);
  if (!doc) return null;
  // fromCompendium limpa pasta, dono e ordenação e anota a origem do item.
  const dados = game.items.fromCompendium(doc, { keepId: false });
  delete dados._id;
  return dados;
}

const NOME_DESARMADO = 'ataque desarmado';
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/**
 * O "Ataque desarmado" do sistema, pronto para criar — ou `null` se a ficha
 * (ou o que já vai ser criado) já tem um. Procura no compêndio de
 * equipamentos do sistema, independente das fontes do assistente; sem ele,
 * num item do mundo com esse nome.
 */
async function dadosDoAtaqueDesarmado(actor, lote) {
  const jaTem = (nome) => semAcento(nome) === NOME_DESARMADO;
  if (actor.items.some(i => i.type === 'arma' && jaTem(i.name))) return null;
  if (lote.some(d => d.type === 'arma' && jaTem(d.name))) return null;
  let doc = null;
  const pack = game.packs.get('tormenta20.equipamentos');
  if (pack) {
    const entrada = (await pack.getIndex()).find(e => e.type === 'arma' && jaTem(e.name));
    if (entrada) doc = await pack.getDocument(entrada._id);
  }
  doc ??= game.items.find(i => i.type === 'arma' && jaTem(i.name)) ?? null;
  if (!doc) return null;
  const dados = game.items.fromCompendium(doc, { keepId: false });
  delete dados._id;
  return dados;
}

/**
 * @param {Actor} actor
 * @param {object} est      estado do assistente
 * @param {object} calculo  { racial: {for..}, pericias: Set, zonas: [[zona, refs]], dinheiro: number }
 *                          (`dinheiro` já descontadas as compras)
 * @returns {Promise<{faltando: string[]}>} nomes de itens que não foram achados
 */
export async function aplicarCriacao(actor, est, calculo) {
  const faltando = [];
  const uiAtivo = !!game.modules.get(UI_ID)?.active;

  // 1. Raça e classe antigas
  const sairao = actor.items.filter(i =>
    (est.raca.sel && i.type === 'race') || (est.classe.sel && i.type === 'classe'));
  if (sairao.length) await actor.deleteEmbeddedDocuments('Item', sairao.map(i => i.id));

  // 2. O próprio ator
  const upd = {
    name: est.ficha.nome?.trim() || actor.name,
    'system.detalhes.origem': est.origem.nome?.trim() ?? '',
    'system.detalhes.divindade': est.divindade.nome?.trim() ?? '',
    [`flags.${MODULE_ID}.${FLAG_CONCLUIDA}`]: true,
    ...apagarChave(`flags.${MODULE_ID}.${FLAG_RASCUNHO}`)
  };
  if (est.ficha.img) upd.img = est.ficha.img;
  if (est.raca.sel) upd['system.detalhes.raca'] = est.raca.sel.nome;
  if (est.atributos.bases) {
    for (const [k, v] of Object.entries(est.atributos.bases)) upd[`system.atributos.${k}.base`] = v;
  }
  for (const k of calculo.pericias) {
    if (actor.system.pericias?.[k]) upd[`system.pericias.${k}.treinado`] = true;
  }
  const dinheiro = Number(calculo.dinheiro);
  if (Number.isFinite(dinheiro) && dinheiro > 0) {
    // T$ quebrado (6,8) vira 6 tibares e 8 tibares de cobre — a ficha não
    // guarda fração de tibar.
    const { tp, tc } = dividirEmMoedas(dinheiro);
    upd['system.dinheiro.tp'] = (Number(actor.system.dinheiro?.tp) || 0) + tp;
    if (tc) upd['system.dinheiro.tc'] = (Number(actor.system.dinheiro?.tc) || 0) + tc;
  }
  // Proficiências: somam às que a ficha já tem, nunca tiram.
  const prof = est.equipamento.prof ?? {};
  for (const campo of ['profArmas', 'profArmaduras']) {
    const atuais = new Set(actor.system.tracos?.[campo]?.value ?? []);
    for (const p of PROFICIENCIAS) if (p.campo === campo && prof[p.id]) atuais.add(p.valor);
    if (actor.system.tracos?.[campo]) upd[`system.tracos.${campo}.value`] = [...atuais];
  }
  await actor.update(upd);
  // O token protótipo acompanha nome e retrato, se ainda eram os padrões.
  const token = {};
  if (upd.name !== actor.prototypeToken.name) token['prototypeToken.name'] = upd.name;
  if (upd.img && actor.prototypeToken.texture.src === CONST.DEFAULT_TOKEN) token['prototypeToken.texture.src'] = upd.img;
  if (!foundry.utils.isEmpty(token)) await actor.update(token);

  // 3. Raça
  let raca = null;
  if (est.raca.sel) {
    const dados = await dadosDoItem(est.raca.sel);
    if (!dados) faltando.push(est.raca.sel.nome);
    else {
      const original = foundry.utils.deepClone({
        atributos: dados.system.atributos,
        atributosDinamicos: dados.system.atributosDinamicos,
        grants: dados.system.grants
      });
      dados.system.atributos = { ...calculo.racial };
      dados.system.atributosDinamicos = { ...(dados.system.atributosDinamicos ?? {}), value: [] };
      dados.system.grants = [];
      raca = await criarRacaSemDialogo(actor, dados);
      // Explícito: o valor do assistente é o que vale, qualquer que seja a
      // conta que o sistema fez ao receber a raça.
      const racial = {};
      for (const [k, v] of Object.entries(calculo.racial)) racial[`system.atributos.${k}.racial`] = v;
      await actor.update(racial);
      await raca.update({ system: original });
    }
  }

  // 4. Classe
  if (est.classe.sel) {
    const dados = await dadosDoItem(est.classe.sel);
    if (!dados) faltando.push(est.classe.sel.nome);
    else {
      dados.system.niveis = 1;
      dados.system.inicial = true;
      await actor.createEmbeddedDocuments('Item', [dados]);
    }
  }

  // 5. Poderes, magias e itens
  const lote = [];
  const zonaDe = [];
  const conjuracao = actor.system.attributes?.conjuracao;
  for (const [zona, refs] of calculo.zonas) {
    for (const ref of refs) {
      const dados = await dadosDoItem(ref);
      if (!dados) { faltando.push(ref.nome); continue; }
      if (dados.type === 'magia' && conjuracao && dados.system?.resistencia) {
        dados.system.resistencia.atributo = conjuracao;
      }
      if (ref.qtd > 1 && dados.system && 'qtd' in dados.system) dados.system.qtd = ref.qtd;
      const categoria = CATEGORIA_POR_ZONA[zona];
      if (uiAtivo && categoria && ['poder', 'magia'].includes(dados.type)) {
        foundry.utils.setProperty(dados, `flags.${UI_ID}.origemPoder`, { categoria, nivel: 1 });
      }
      lote.push(dados);
      zonaDe.push(zona);
    }
  }
  // Todo personagem luta desarmado: a arma entra sozinha, se ainda não houver.
  const desarmado = await dadosDoAtaqueDesarmado(actor, lote);
  if (desarmado) lote.push(desarmado);
  const criados = lote.length ? await actor.createEmbeddedDocuments('Item', lote) : [];
  if (raca) {
    const daRaca = criados.filter((_, i) => zonaDe[i] === 'racaPoderes').map(d => d.id);
    if (daRaca.length) await raca.setFlag('tormenta20', 'grantedItems', daRaca);
  }

  // 6. Nível e recursos cheios (PV/PM máximos só existem depois da classe).
  // O máximo depende dos efeitos dos itens recém-criados (a habilidade
  // "Magias" soma o atributo-chave nos PM): recalcula antes de ler.
  actor.reset();
  const fim = { 'system.attributes.nivel.value': Math.max(1, Number(actor.system.attributes?.nivel?.value) || 0) };
  const pv = actor.system.attributes?.pv;
  const pm = actor.system.attributes?.pm;
  if (Number.isFinite(pv?.max) && pv.max > 0) fim['system.attributes.pv.value'] = pv.max;
  if (Number.isFinite(pm?.max) && pm.max > 0) fim['system.attributes.pm.value'] = pm.max;
  await actor.update(fim);

  return { faltando };
}

/** Card de chat curto anunciando o personagem. */
export async function anunciarPersonagem(actor, est) {
  const partes = [est.raca.sel?.nome, est.classe.sel?.nome].filter(Boolean).join(' ');
  const extras = [
    est.origem.nome?.trim() ? `${foundry.utils.escapeHTML(est.origem.nome.trim())}` : null,
    est.divindade.nome?.trim() ? `devoto de ${foundry.utils.escapeHTML(est.divindade.nome.trim())}` : null
  ].filter(Boolean).join(' · ');
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="t20g-cc-chat">
      <img src="${actor.img}" alt="">
      <div><b>${foundry.utils.escapeHTML(actor.name)}</b> entra na aventura!
      ${partes ? `<br>${foundry.utils.escapeHTML(partes)}` : ''}
      ${extras ? `<br><em>${extras}</em>` : ''}</div>
    </div>`
  });
}
