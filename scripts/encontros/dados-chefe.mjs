/**
 * t20-hayd-gmtools | encontros/dados-chefe.mjs
 * Chefe Final e Rei da Arena (Ameaças de Arton, pp. 368–371): ajustes,
 * arenas e recursos, com os valores já resolvidos para o patamar do chefe.
 * Textos resumidos com palavras próprias. Sem dependência do Foundry.
 */
import { patamar } from './regras.mjs';

/** Índice do patamar para os valores a/b/c/d do livro (L+ usa os de lenda). */
export function indicePatamar(nd) {
  return Math.min(3, patamar(nd).ordem - 1);
}

const v = (t, ...vals) => vals[t];

/** Ajustes do Chefe Final sobre os valores atuais da ficha. */
export function ajustesChefe({ nd, pvMax = 0, pmMax = 0 }) {
  const t = indicePatamar(nd);
  const rd = [0, 5, 10, 20][t];
  const pmExtra = pmMax > 0 ? Math.ceil(2 * Math.max(1, Math.min(nd, 20))) : 0;
  return {
    t, rd, pmExtra,
    pvNovo: pvMax * 2,
    pmNovo: pmMax + pmExtra,
    ndRecompensa: nd < 1 ? 2 : Math.min(nd, 20) + 2,
    recursos: 2 * (t + 1)
  };
}

/** Arenas: efeito básico em toda a área, contra criaturas à escolha do chefe. */
export const ARENAS = [
  { id: 'anfiteatro', nome: 'Anfiteatro', icone: 'fa-masks-theater',
    texto: (t) => `O chefe recebe +${v(t, 1, 2, 5, 10)} em perícias. Um PJ pode gastar uma ação padrão e passar em Atuação ou Diplomacia para tomar esse bônus para si por 1 rodada.` },
  { id: 'cemiterio', nome: 'Cemitério', icone: 'fa-cross',
    texto: (t) => `A área tem o efeito de Profanar. Mortos-vivos e devotos de energia negativa recebem +${v(t, 0, 1, 2, 5)} em Defesa e perícias. Consagrar anula a arena por 1d6 rodadas.` },
  { id: 'embarcacao', nome: 'Embarcação Instável', icone: 'fa-sailboat',
    texto: () => 'Terreno difícil. No fim de cada rodada, cada PJ faz um teste de Acrobacia ou Reflexos (CD do chefe) ou fica caído; falhando por 5 ou mais, também fica enjoado por 1 rodada.' },
  { id: 'lodacal', nome: 'Lodaçal Contaminado', icone: 'fa-biohazard',
    texto: (t) => `Terreno difícil e camuflagem leve além de 6 m. No início do turno de cada PJ, ele perde ${v(t, '1d6', '2d6', '4d6', '8d6')} PV e fica enjoado (Fortitude reduz à metade e evita a condição).` },
  { id: 'ringue', nome: 'Ringue Brutal', icone: 'fa-hand-fist',
    texto: (t) => `Os ataques com arma do chefe causam +2 dados de dano. Um PJ que erra um ataque por 5 ou mais, ou falha num teste de movimento, sofre ${v(t, '2d8', '4d8', '6d8', '8d8')} de corte (Reflexos evita; falha por 10+ dobra o dano).` },
  { id: 'salao', nome: 'Salão Assombrado', icone: 'fa-ghost',
    texto: (t) => `PJs sofrem −5 contra medo e habilidades de luz custam +1 PM. No fim do turno, cada PJ faz Reflexos ou fica agarrado e imóvel, sofrendo ${v(t, '1d8', '2d8', '3d8', '5d8')} de frio por turno (escapa com ação padrão e Atletismo).` },
  { id: 'santuario', nome: 'Santuário Verdejante', icone: 'fa-tree',
    texto: (t) => `Camuflagem leve além de 6 m, sem penalidade de Furtividade por se mover ou agir de forma chamativa; terreno difícil. PJ que se move sofre ${v(t, '1d6', '2d6', '3d6', '5d6')} de perfuração (Reflexos evita).` },
  { id: 'templo', nome: 'Templo', icone: 'fa-place-of-worship',
    texto: (t) => `A área tem o efeito de Consagrar. Devotos da divindade do templo recebem +${v(t, 1, 2, 5, 10)} em Defesa e perícias. Profanar anula a arena por 1d6 rodadas.` },
  { id: 'vortice', nome: 'Vórtice Místico', icone: 'fa-hurricane',
    texto: (t) => `No início do turno do chefe, ${t + 2} criaturas perdem ${v(t, '1d4', '2d4', '3d4', '5d4')} PM (Vontade reduz à metade). Cada resultado 4 nos dados cura 5 PV do chefe.` },
  { id: 'vulcao', nome: 'Vulcão', icone: 'fa-volcano',
    texto: (t) => `No fim da 2ª rodada e a cada 2 rodadas, todos sofrem 1d6 de fogo por rodada transcorrida (2d6 na 2ª, 4d6 na 4ª...), até ${2 * (t + 1)}d6. No fim da 10ª rodada a área vira lava (imersão total).` }
];

/** Recursos: 2 por patamar. Os que viram criaturas não contam para recompensas. */
export const RECURSOS = [
  { id: 'armadilha', nome: 'Armadilha Oculta', icone: 'fa-burst',
    texto: (t) => `Objeto Médio escondido. Ao ativar, uma criatura em alcance médio sofre ${v(t, '1d6', '2d6', '4d6', '8d6')} de perfuração e fica imóvel (Reflexos evita; escapar exige ação padrão e Atletismo ou Ladinagem).` },
  { id: 'arsenal', nome: 'Arsenal Escondido', icone: 'fa-box-open',
    texto: (t) => `O chefe tem ${t + 1} item(ns) mágico(s) menor(es) escondido(s) (2 menores podem virar 1 médio; 3 menores, 1 maior) e empunha um com ação de movimento. Um PJ pode achar um com ação padrão e Investigação ou Percepção.` },
  { id: 'campeao', nome: 'Campeão Secreto', icone: 'fa-user-ninja', criatura: true,
    texto: () => 'Um lacaio de ND igual ao do chefe, escondido. Liberado com ação de movimento, age na rodada seguinte com +2 em ataque e dano por rodada transcorrida antes de ser solto; PJs ficam desprevenidos contra ele no primeiro turno.' },
  { id: 'coracao', nome: 'Coração de Gigante', icone: 'fa-heart',
    texto: (t) => `Objeto Pequeno visível: o chefe recebe +2 em Força e seus ataques com arma causam +${v(t, 1, 2, 3, 5)} dado(s) de dano. Um PJ pode devorá-lo (ação completa e Fortitude) para ganhar os benefícios na cena; falhando, perde ${v(t, '1d6', '2d6', '3d6', '5d6')} PV e fica enjoado por 1d4 rodadas.` },
  { id: 'fonte', nome: 'Fonte Curativa', icone: 'fa-droplet',
    texto: (t) => `O chefe tem cura acelerada ${v(t, 5, 10, 20, 50)}. Um PJ que gaste 2 ações completas e passe em Religião dispara um pulso que cura todos os PJs nesse valor e desativa a fonte.` },
  { id: 'lacaios', nome: 'Lacaios', icone: 'fa-people-group', criatura: true,
    texto: () => '2 a 4 lacaios cujo ND somado vai até o ND do chefe −2. Quando sofre dano, o chefe pode transferi-lo para um lacaio.' },
  { id: 'mana', nome: 'Linhas de Mana', icone: 'fa-wand-sparkles',
    texto: (t) => `O chefe recebe +${v(t, 1, 2, 3, 5)} na CD e recupera ${v(t, 1, 2, 3, 5)} PM por turno. Um PJ pode tomar o benefício por 1 rodada (ação padrão e Misticismo; uma vez por cena por PJ).` },
  { id: 'orbe', nome: 'Orbe Elemental', icone: 'fa-circle-radiation',
    texto: (t) => `O chefe ignora ${v(t, 25, 50, 75, 100)}% do dano de um elemento. O orbe tem Defesa e PV de um lacaio de mesmo ND do chefe, é imune ao elemento e vulnerável a outro.` },
  { id: 'passagens', nome: 'Passagens Secretas', icone: 'fa-door-open',
    texto: () => '3 passagens; o chefe se desloca entre elas com ação de movimento, e se atacar na mesma rodada a vítima fica desprevenida. Um PJ desativa uma com ação completa e Ladinagem.' },
  { id: 'selo', nome: 'Selo Místico', icone: 'fa-star-of-david',
    texto: (t) => `O chefe lança o efeito básico de uma magia de ${t + 1}º círculo sem gastar PM, com ação de movimento. Um PJ desativa o selo com ação completa e Misticismo.` },
  { id: 'sorvedouro', nome: 'Sorvedouro de Magia', icone: 'fa-tornado',
    texto: (t) => `No fim de cada rodada, criaturas escolhidas perdem ${v(t, '1', '1d4', '1d6', '2d4')} PM (Vontade evita). Um PJ desativa com ação completa e Misticismo.` },
  { id: 'torreta', nome: 'Torreta', icone: 'fa-crosshairs',
    texto: () => 'Com ação de movimento, o chefe faz um ataque à distância contra uma criatura em alcance médio, com as mesmas características de ataque, dano e crítico de um ataque dele. Um PJ desativa com ação completa e Ladinagem.' }
];

/** Texto da condução do combate contra um Rei da Arena. */
export function textoConducao(nd, cd) {
  return `<p><b>Chefe Final.</b> PV dobrados, Maior que a Morte`
    + `${ajustesChefe({ nd }).rd ? `, RD ${ajustesChefe({ nd }).rd}` : ''}. Conta como ND +2 apenas para XP e tesouro.</p>`
    + `<p><b>Rei da Arena.</b> Ao fim do turno de cada PJ, o chefe ganha uma ação de movimento usada só para ativar um recurso `
    + `(o mesmo recurso no máximo uma vez por rodada; funciona mesmo se ele estiver incapacitado).</p>`
    + `<p>CD dos efeitos da arena e dos recursos: <b>${cd}</b>. Identificar um recurso: CD <b>${15 + Math.min(Math.floor(nd), 20)}</b> (Misticismo ou perícia ligada ao recurso).</p>`;
}
