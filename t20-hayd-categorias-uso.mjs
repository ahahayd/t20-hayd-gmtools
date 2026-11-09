/**
 * T20 Hayd GMTools | Categorias na janela de uso
 *
 * Com muitos aprimoramentos a lista vira uma sopa. Quando há efeitos da
 * própria arma (melhorias e encantos) e também de outras fontes (poderes,
 * habilidades), a lista ganha dois títulos discretos:
 *
 *   Manobra / Flanqueando     ← sempre no topo, sem título
 *   Melhorias e encantos      ← efeitos cujo dono é o próprio item
 *   Outros                    ← o resto
 *
 * Só reordena linhas que o sistema e os outros scripts já desenharam; nada
 * muda no formulário enviado. Este arquivo carrega por último no module.json
 * para rodar depois da Manobra e do Flanqueando.
 */

import { ID_EFEITO_FLANCO } from './scripts/flanco.mjs';

const t = (chave) => game.i18n.localize(`T20HaydGMTools.${chave}`);

function idDaLinha(linha) {
  return linha.querySelector('input[name$=".aplica"]')?.name.match(/^aprs\.([^.]+)\.aplica$/)?.[1];
}

function ehDoItem(efeito, item) {
  const dono = efeito?.parent;
  if (!dono || dono.documentName !== 'Item') return false;
  return dono.id === item.id || (!!dono.uuid && dono.uuid === item.uuid);
}

function titulo(texto) {
  const li = document.createElement('li');
  li.className = 't20g-categoria';
  li.textContent = texto;
  return li;
}

Hooks.on('renderAbilityUseDialog', (app, html) => {
  const item = app?.item;
  // Armas: "Melhorias e encantos"; magias: "Aprimoramentos" (os da própria magia).
  const rotulo = { arma: 'CategoriaMelhorias', magia: 'CategoriaAprimoramentos' }[item?.type];
  if (!rotulo) return;
  const raiz = html?.[0] ?? html;
  const form = raiz?.querySelector?.('#ability-use-form') ?? raiz;
  const lista = form?.querySelector?.('.aprimoramentos-list');
  if (!lista || lista.querySelector('.t20g-categoria')) return;

  const efeitos = new Map((item.applicableOnUseEffects ?? item.validOnUseEffects ?? []).map((ef) => [ef.id, ef]));
  const melhorias = [];
  const outros = [];
  for (const linha of lista.children) {
    if (linha.matches('.items-header, .t20g-manobra, .t20g-manobra-filha')) continue;
    const id = idDaLinha(linha);
    if (id === ID_EFEITO_FLANCO) continue;
    (ehDoItem(efeitos.get(id), item) ? melhorias : outros).push(linha);
  }
  if (!melhorias.length || !outros.length) return;

  lista.append(titulo(t(rotulo)), ...melhorias, titulo(t('CategoriaOutros')), ...outros);
});
