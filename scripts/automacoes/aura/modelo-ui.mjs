/**
 * Modelo de Aura — janelas.
 *
 * `configurarModelo` abre ao escolher a automação "Modelo de Aura" (e de novo
 * ao escolhê-la outra vez, que é como se edita); grava a flag `auraModelo` do
 * item, que `modelo.mjs` transforma no bloco `aura` do motor.
 * `escolherAprimoramentos` abre ao ativar uma aura que tenha aprimoramentos.
 *
 * Os campos de cada efeito usam `data-campo`, não `name`: há vários efeitos
 * na mesma janela e `form.elements` misturaria os de um com os de outro.
 */
import { MODULE_ID } from '../runtime.mjs';
import {
  FLAG_MODELO, MODOS, USOS, CAMPOS_SUGERIDOS, TESTES, ATRIBUTOS, MOMENTOS, MOMENTOS_DANO, SUCESSOS_DANO,
  modeloPadrao, efeitoPadrao, danoPadrao, normalizarModelo, modeloValido, normalizarEscolhas, custoDasEscolhas
} from './modelo.mjs';

const { DialogV2 } = foundry.applications.api;

const t = (chave, dados) => (dados
  ? game.i18n.format(`T20HaydGMTools.${chave}`, dados)
  : game.i18n.localize(`T20HaydGMTools.${chave}`));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));

/** Atalhos de fórmula: clicar insere no último campo de valor focado. */
const ATALHOS = [
  ['@car', 'AuraModeloAtalhoAtributoFonte'],
  ['@alvo.car', 'AuraModeloAtalhoAtributoAlvo'],
  ['@nivel', 'AuraModeloAtalhoNivel'],
  ['@meionivel', 'AuraModeloAtalhoMeioNivel'],
  ['floor(@nivel/4)', 'AuraModeloAtalhoQuarto']
];

const PUBLICO = [
  ['aliados', 'AuraModeloAliados'],
  ['neutros', 'AuraModeloNeutros'],
  ['inimigos', 'AuraModeloInimigos'],
  ['fonte', 'AuraModeloFonte']
];

function rotuloUso(uso) {
  const chaves = {
    attack: 'T20.Attack', skill: 'T20.Skill', ability: 'T20.Ability', power: 'T20.Power',
    spell: 'T20.Spell', equipment: 'T20.Equipment', consumable: 'T20.Consumable'
  };
  return game.i18n.localize(chaves[uso]);
}

const opcoesDeModo = (atual) => MODOS
  .map((x) => `<option value="${x.id}" ${x.id === atual ? 'selected' : ''}>${x.rotulo}</option>`)
  .join('');

/** Checkbox de um efeito (sem `name`, ver cabeçalho). */
function marca(campo, marcado, rotulo, dica = '') {
  return `<label class="t20g-aura-modelo-check" ${dica ? `data-tooltip="${esc(dica)}"` : ''}>
      <input type="checkbox" data-campo="${campo}" ${marcado ? 'checked' : ''}> <span>${rotulo}</span>
    </label>`;
}

/** Checkbox geral da aura (um só na janela, pode usar `name`). */
function marcador(nome, marcado, rotulo, dica = '') {
  return `<label class="t20g-aura-modelo-check" ${dica ? `data-tooltip="${esc(dica)}"` : ''}>
      <input type="checkbox" name="${nome}" ${marcado ? 'checked' : ''}> <span>${rotulo}</span>
    </label>`;
}

function linhaDeMudanca(m = { key: '', mode: 2, valor: '' }) {
  return `<div class="t20g-aura-modelo-mudanca">
      <input type="text" data-campo="key" value="${esc(m.key)}" list="t20g-aura-modelo-campos"
        placeholder="${t('AuraModeloCampo')}" autocomplete="off">
      <select data-campo="mode">${opcoesDeModo(m.mode)}</select>
      <input type="text" data-campo="valor" value="${esc(m.valor)}" placeholder="@car" autocomplete="off">
      <button type="button" class="t20g-aura-modelo-remover" data-tooltip="${t('AuraModeloRemover')}">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>`;
}

function blocoDeEfeito(e, item) {
  const ehUso = e.tipo === 'uso';
  const condicoes = (CONFIG.statusEffects ?? []).filter((s) => s.id && s.id !== 'dead' && s.id !== 'morto');
  return `<div class="t20g-aura-modelo-efeito t20g-aura-modelo-efeito--${e.tipo}"
      data-id="${esc(e.id || foundry.utils.randomID())}" data-tipo="${e.tipo}">
    <div class="t20g-aura-modelo-efeito-topo">
      <span class="t20g-aura-modelo-tipo">
        <i class="fa-solid ${ehUso ? 'fa-dice-d20' : 'fa-shield-heart'}"></i>
        ${t(ehUso ? 'AuraModeloUso' : 'AuraModeloPassivo')}
      </span>
      <input type="text" data-campo="nome" value="${esc(e.nome || item.name)}"
        data-tooltip="${t('AuraModeloNome')}">
      <button type="button" class="t20g-aura-modelo-remover-efeito" data-tooltip="${t('AuraModeloRemoverEfeito')}">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>
    <div class="t20g-aura-modelo-checks">
      <span class="notes">${t('AuraModeloAfeta')}</span>
      ${PUBLICO.map(([k, r]) => marca(`alvos.${k}`, e.alvos[k], t(r))).join('')}
    </div>
    ${ehUso ? `<div class="t20g-aura-modelo-checks">
        <span class="notes" data-tooltip="${t('AuraModeloUsoDica')}">${t('AuraModeloUsoOnde')}</span>
        ${USOS.map((u) => marca(`usos.${u}`, e.usos[u], rotuloUso(u))).join('')}
      </div>` : ''}
    <div class="t20g-aura-modelo-mudancas">
      ${(e.mudancas.length ? e.mudancas : [undefined]).map(linhaDeMudanca).join('')}
    </div>
    <button type="button" class="t20g-aura-modelo-adicionar">
      <i class="fa-solid fa-plus"></i> ${t('AuraModeloAdicionar')}
    </button>
    ${ehUso ? '' : `<details class="t20g-aura-modelo-condicoes-caixa" ${e.condicoes.length ? 'open' : ''}>
        <summary>${t('AuraModeloCondicoes')}${e.condicoes.length ? ` (${e.condicoes.length})` : ''}</summary>
        <div class="t20g-aura-modelo-checks t20g-aura-modelo-condicoes">
          ${condicoes.map((s) => `<label class="t20g-aura-modelo-check">
              <input type="checkbox" data-campo="condicao" value="${esc(s.id)}" ${e.condicoes.includes(s.id) ? 'checked' : ''}>
              <img src="${esc(s.img ?? s.icon)}" alt=""> <span>${esc(game.i18n.localize(s.name ?? s.label ?? s.id))}</span>
            </label>`).join('')}
        </div>
      </details>`}
    ${blocoDeResistencia(e.resistencia)}
  </div>`;
}

/** "O alvo pode resistir?" — teste, CD e quando o alvo testa. */
function blocoDeResistencia(r, { dano = false } = {}) {
  const opcoes = (lista, atual, nomeDe) => lista
    .map((x) => `<option value="${x}" ${x === atual ? 'selected' : ''}>${nomeDe(x)}</option>`)
    .join('');
  return `<div class="t20g-aura-modelo-resistencia">
      ${marca('res.ativa', r.ativa, t('AuraModeloResistir'), t('AuraModeloResistirDica'))}
      <div class="t20g-aura-modelo-res-campos" ${r.ativa ? '' : 'hidden'}>
        <label>${t('AuraModeloResTeste')}
          <select data-campo="res.teste">${opcoes(TESTES.map((x) => x.id), r.teste,
            (id) => TESTES.find((x) => x.id === id).rotulo)}</select></label>
        <label>${t('AuraModeloResAtributo')}
          <select data-campo="res.atributo">${opcoes(ATRIBUTOS, r.atributo,
            (a) => game.i18n.localize(CONFIG.T20?.atributos?.[a] ?? a))}</select></label>
        <label data-tooltip="${t('AuraModeloResBonusDica')}">${t('AuraModeloResBonus')}
          <input type="number" data-campo="res.bonus" step="1" value="${r.bonus}"></label>
        ${dano
    // No dano o teste acontece junto com a rolagem; o que muda é o sucesso.
    ? `<label>${t('AuraModeloResSucesso')}
          <select data-campo="res.sucesso">${opcoes(SUCESSOS_DANO, r.sucesso,
            (x) => t(x === 'anula' ? 'AuraDanoAnula' : 'AuraDanoMetade'))}</select></label>`
    : `<label>${t('AuraModeloResQuando')}
          <select data-campo="res.quando">${opcoes(MOMENTOS, r.quando,
            (m) => t(`AuraModeloResQuando_${m}`))}</select></label>`}
      </div>
    </div>`;
}

/** Um dano da aura: fórmula, tipo, quando, quem leva e se dá para resistir. */
function blocoDeDano(d, item) {
  return `<div class="t20g-aura-modelo-dano" data-id="${esc(d.id || foundry.utils.randomID())}">
    <div class="t20g-aura-modelo-dano-topo">
      <input type="text" data-campo="nome" value="${esc(d.nome || item.name)}"
        data-tooltip="${t('AuraModeloNome')}">
      <input type="text" data-campo="formula" value="${esc(d.formula)}" placeholder="2d6+@car"
        data-tooltip="${t('AuraModeloDanoFormulaDica')}" autocomplete="off">
      <input type="text" data-campo="tipo" value="${esc(d.tipo)}" placeholder="${t('AuraModeloDanoTipo')}">
      <select data-campo="quando">${MOMENTOS_DANO.map((m) =>
        `<option value="${m}" ${m === d.quando ? 'selected' : ''}>${t(`AuraModeloDanoQuando_${m}`)}</option>`).join('')}</select>
      <button type="button" class="t20g-aura-modelo-remover-dano" data-tooltip="${t('AuraModeloDanoRemover')}">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>
    <div class="t20g-aura-modelo-checks">
      <span class="notes">${t('AuraModeloAfeta')}</span>
      ${PUBLICO.map(([k, rot]) => marca(`alvos.${k}`, d.alvos[k], t(rot))).join('')}
    </div>
    ${blocoDeResistencia(d.resistencia, { dano: true })}
  </div>`;
}

/** Uma linha do aprimoramento: em qual efeito, qual campo e quanto. */
function linhaDoAprimoramento(l = { acao: 'aumentar', efeito: '', key: '', mode: 2, valor: '' }) {
  return `<div class="t20g-aura-modelo-apr-efeito">
      <select data-campo="acao">
        <option value="aumentar" ${l.acao === 'aumentar' ? 'selected' : ''}>${t('AuraModeloAprAumentar')}</option>
        <option value="novo" ${l.acao === 'novo' ? 'selected' : ''}>${t('AuraModeloAprNovo')}</option>
      </select>
      <select data-campo="efeito" data-atual="${esc(l.efeito)}"></select>
      <input type="text" data-campo="key" value="${esc(l.key)}" list="t20g-aura-modelo-campos"
        placeholder="${t('AuraModeloCampo')}" autocomplete="off">
      <select data-campo="mode" ${l.acao === 'novo' ? '' : 'hidden'}>${opcoesDeModo(l.mode)}</select>
      <input type="text" data-campo="valor" value="${esc(l.valor)}" placeholder="1" autocomplete="off"
        data-tooltip="${t('AuraModeloAprValorDica')}">
      <button type="button" class="t20g-aura-modelo-remover" data-tooltip="${t('AuraModeloRemover')}">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>`;
}

function linhaDeAprimoramento(a = { nome: '', custo: 1, maximo: 1, linhas: [] }) {
  return `<div class="t20g-aura-modelo-apr" data-id="${esc(a.id ?? foundry.utils.randomID())}">
      <div class="t20g-aura-modelo-apr-topo">
        <input type="text" data-campo="nome" value="${esc(a.nome)}" placeholder="${t('AuraModeloAprNome')}">
        <label>${t('AuraModeloAprCusto')} <input type="number" data-campo="custo" min="0" step="1" value="${a.custo}"></label>
        <label data-tooltip="${t('AuraModeloAprMaximoDica')}">${t('AuraModeloAprMaximo')}
          <input type="number" data-campo="maximo" min="1" step="1" value="${a.maximo}"></label>
        <button type="button" class="t20g-aura-modelo-remover-apr" data-tooltip="${t('AuraModeloAprRemover')}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
      <div class="t20g-aura-modelo-apr-linhas">
        ${(a.linhas.length ? a.linhas : [undefined]).map(linhaDoAprimoramento).join('')}
      </div>
      <button type="button" class="t20g-aura-modelo-adicionar-apr-linha">
        <i class="fa-solid fa-plus"></i> ${t('AuraModeloAprAdicionarLinha')}
      </button>
    </div>`;
}

function conteudo(c, item) {
  return `<div class="t20g-auto-dialogo t20g-aura-modelo">
    <p class="notes">${t('AuraModeloAjuda')}</p>
    <datalist id="t20g-aura-modelo-campos">
      ${CAMPOS_SUGERIDOS.map((s) => `<option value="${s.key}">${esc(s.rotulo)}</option>`).join('')}
    </datalist>

    <fieldset>
      <legend><i class="fa-solid fa-ruler"></i> ${t('AuraModeloAlcance')}</legend>
      <div class="t20g-aura-modelo-linha">
        <label>${t('AuraModeloRaio')}
          <input type="number" name="raio" min="0" step="1.5" value="${c.raio}"></label>
      </div>
      <div class="t20g-aura-modelo-checks">
        ${marcador('ignoraDiagonal', c.ignoraDiagonal, t('AuraModeloIgnoraDiagonal'), t('AuraModeloIgnoraDiagonalDica'))}
        ${marcador('ignoraVisao', !c.bloqueavel, t('AuraModeloIgnoraVisao'), t('AuraModeloIgnoraVisaoDica'))}
        ${marcador('ocultos', c.ocultos, t('AuraModeloOcultos'), t('AuraModeloOcultosDica'))}
      </div>
    </fieldset>

    <fieldset>
      <legend><i class="fa-solid fa-wand-sparkles"></i> ${t('AuraModeloEfeitos')}</legend>
      <div class="t20g-aura-modelo-efeitos">${c.efeitos.map((e) => blocoDeEfeito(e, item)).join('')}</div>
      <div class="t20g-aura-modelo-novos">
        <button type="button" class="t20g-aura-modelo-adicionar-efeito" data-tipo="passivo">
          <i class="fa-solid fa-shield-heart"></i> ${t('AuraModeloAddPassivo')}
        </button>
        <button type="button" class="t20g-aura-modelo-adicionar-efeito" data-tipo="uso">
          <i class="fa-solid fa-dice-d20"></i> ${t('AuraModeloAddUso')}
        </button>
      </div>
      <div class="t20g-aura-modelo-atalhos">
        <span class="notes">${t('AuraModeloAtalhos')}</span>
        ${ATALHOS.map(([f, k]) => `<button type="button" class="t20g-aura-modelo-atalho"
          data-formula="${esc(f)}" data-tooltip="${t(k)}">${esc(f)}</button>`).join('')}
      </div>
      <p class="notes">${t('AuraModeloFormulaDica')}</p>
    </fieldset>

    <fieldset>
      <legend><i class="fa-solid fa-burst"></i> ${t('AuraModeloDanos')}</legend>
      <p class="notes">${t('AuraModeloDanosDica')}</p>
      <div class="t20g-aura-modelo-danos">${c.danos.map((d) => blocoDeDano(d, item)).join('')}</div>
      <button type="button" class="t20g-aura-modelo-adicionar-dano">
        <i class="fa-solid fa-plus"></i> ${t('AuraModeloDanoAdicionar')}
      </button>
    </fieldset>

    <fieldset>
      <legend><i class="fa-solid fa-bolt"></i> ${t('AuraModeloAprimoramentos')}</legend>
      <p class="notes">${t('AuraModeloAprimoramentosDica')}</p>
      <div class="t20g-aura-modelo-aprs">${c.aprimoramentos.map(linhaDeAprimoramento).join('')}</div>
      <button type="button" class="t20g-aura-modelo-adicionar-apr">
        <i class="fa-solid fa-plus"></i> ${t('AuraModeloAprAdicionar')}
      </button>
    </fieldset>

    <fieldset>
      <legend><i class="fa-solid fa-hourglass-half"></i> ${t('AuraModeloSustentar')}</legend>
      <div class="t20g-aura-modelo-linha">
        <label>${t('AuraModeloCusto')}
          <input type="number" name="custo" min="0" step="1" value="${c.custo}"></label>
      </div>
      <div class="t20g-aura-modelo-checks">
        ${marcador('lembrete', c.lembrete, t('AuraModeloLembrete'), t('AuraModeloLembreteDica'))}
      </div>
    </fieldset>

    <p class="t20g-veneno-erro" hidden>${t('AuraModeloInvalido')}</p>
  </div>`;
}

const campo = (raiz, nome) => raiz.querySelector(`[data-campo="${nome}"]`);

function lerEfeito(bloco, item) {
  const marcado = (nome) => !!campo(bloco, nome)?.checked;
  const nome = String(campo(bloco, 'nome')?.value ?? '').trim();
  return {
    id: bloco.dataset.id,
    // Igual ao do item não é gravado: renomear o item renomeia o efeito.
    nome: nome === item.name ? '' : nome,
    tipo: bloco.dataset.tipo,
    alvos: Object.fromEntries(PUBLICO.map(([k]) => [k, marcado(`alvos.${k}`)])),
    usos: Object.fromEntries(USOS.map((u) => [u, marcado(`usos.${u}`)])),
    condicoes: [...bloco.querySelectorAll('[data-campo="condicao"]:checked')].map((i) => i.value),
    resistencia: {
      ativa: marcado('res.ativa'),
      teste: campo(bloco, 'res.teste').value,
      atributo: campo(bloco, 'res.atributo').value,
      bonus: campo(bloco, 'res.bonus').value,
      quando: campo(bloco, 'res.quando').value
    },
    mudancas: [...bloco.querySelectorAll('.t20g-aura-modelo-mudanca')].map((linha) => ({
      key: campo(linha, 'key').value,
      mode: campo(linha, 'mode').value,
      valor: campo(linha, 'valor').value
    }))
  };
}

/** Lê a janela de volta para o formato da flag. */
function lerModelo(form, item) {
  const el = form.elements;
  return normalizarModelo({
    raio: el.raio?.value,
    ignoraDiagonal: !!el.ignoraDiagonal?.checked,
    bloqueavel: !el.ignoraVisao?.checked,
    ocultos: !!el.ocultos?.checked,
    custo: el.custo?.value,
    lembrete: !!el.lembrete?.checked,
    efeitos: [...form.querySelectorAll('.t20g-aura-modelo-efeito')].map((b) => lerEfeito(b, item)),
    danos: [...form.querySelectorAll('.t20g-aura-modelo-dano')].map((bloco) => {
      const nome = String(campo(bloco, 'nome').value ?? '').trim();
      return {
        id: bloco.dataset.id,
        nome: nome === item.name ? '' : nome,
        formula: campo(bloco, 'formula').value,
        tipo: campo(bloco, 'tipo').value,
        quando: campo(bloco, 'quando').value,
        alvos: Object.fromEntries(PUBLICO.map(([k]) => [k, !!campo(bloco, `alvos.${k}`)?.checked])),
        resistencia: {
          ativa: !!campo(bloco, 'res.ativa').checked,
          teste: campo(bloco, 'res.teste').value,
          atributo: campo(bloco, 'res.atributo').value,
          bonus: campo(bloco, 'res.bonus').value,
          sucesso: campo(bloco, 'res.sucesso').value
        }
      };
    }),
    aprimoramentos: [...form.querySelectorAll('.t20g-aura-modelo-apr')].map((apr) => {
      const v = (raiz, n) => campo(raiz, n).value;
      return {
        id: apr.dataset.id, nome: v(apr, 'nome'), custo: v(apr, 'custo'), maximo: v(apr, 'maximo'),
        linhas: [...apr.querySelectorAll('.t20g-aura-modelo-apr-efeito')].map((linha) => ({
          acao: v(linha, 'acao'), efeito: v(linha, 'efeito'), key: v(linha, 'key'),
          mode: v(linha, 'mode'), valor: v(linha, 'valor')
        }))
      };
    })
  });
}

/**
 * Abre o montador e grava no item.
 * Devolve false se a janela foi cancelada: nesse caso a automação nem liga.
 */
export async function configurarModelo(item) {
  const atual = normalizarModelo(item.getFlag(MODULE_ID, FLAG_MODELO)) ?? modeloPadrao();

  const config = await DialogV2.wait({
    window: {
      title: t('AuraModeloTitulo', { nome: item.name }),
      icon: 'fa-solid fa-circle-radiation',
      resizable: true
    },
    position: { width: 640 },
    content: conteudo(atual, item),
    buttons: [
      {
        action: 'salvar',
        label: t('AutoSalvar'),
        icon: 'fa-solid fa-check',
        default: true,
        callback: (_ev, botao) => lerModelo(botao.form, item)
      },
      { action: 'cancelar', label: t('AutoCancelar'), icon: 'fa-solid fa-xmark' }
    ],
    render: (_ev, dialogo) => {
      const el = dialogo.element;
      const form = el.querySelector('form') ?? el;
      const salvar = el.querySelector('[data-action="salvar"]');
      const erro = el.querySelector('.t20g-veneno-erro');
      let ultimoValor = null;

      /** Aprimoramentos escolhem um efeito pelo nome: a lista acompanha os efeitos. */
      const atualizarAlvosDosAprimoramentos = () => {
        const efeitos = [...el.querySelectorAll('.t20g-aura-modelo-efeito')].map((b, i) => ({
          id: b.dataset.id,
          rotulo: `${i + 1}. ${campo(b, 'nome').value || item.name} (${t(b.dataset.tipo === 'uso' ? 'AuraModeloUso' : 'AuraModeloPassivo')})`
        }));
        for (const sel of el.querySelectorAll('.t20g-aura-modelo-apr-efeito [data-campo="efeito"]')) {
          const escolhido = sel.value || sel.dataset.atual;
          sel.innerHTML = efeitos
            .map((e) => `<option value="${esc(e.id)}" ${e.id === escolhido ? 'selected' : ''}>${esc(e.rotulo)}</option>`)
            .join('');
        }
      };

      const conferir = () => {
        atualizarAlvosDosAprimoramentos();
        const valido = modeloValido(lerModelo(form, item));
        salvar.disabled = !valido;
        erro.hidden = valido;
        for (const bloco of el.querySelectorAll('.t20g-aura-modelo-resistencia')) {
          bloco.querySelector('.t20g-aura-modelo-res-campos').hidden = !campo(bloco, 'res.ativa').checked;
        }
        // Método só importa quando o aprimoramento cria linha nova
        for (const linha of el.querySelectorAll('.t20g-aura-modelo-apr-efeito')) {
          campo(linha, 'mode').hidden = campo(linha, 'acao').value !== 'novo';
        }
      };

      el.addEventListener('focusin', (ev) => {
        if (ev.target.matches?.('.t20g-aura-modelo-mudanca [data-campo="valor"], .t20g-aura-modelo-dano [data-campo="formula"]')) {
          ultimoValor = ev.target;
        }
      });
      el.addEventListener('click', (ev) => {
        const alvo = ev.target;
        const removerEfeito = alvo.closest('.t20g-aura-modelo-remover-efeito');
        if (removerEfeito) {
          removerEfeito.closest('.t20g-aura-modelo-efeito').remove();
          return conferir();
        }
        const removerDano = alvo.closest('.t20g-aura-modelo-remover-dano');
        if (removerDano) {
          removerDano.closest('.t20g-aura-modelo-dano').remove();
          return conferir();
        }
        if (alvo.closest('.t20g-aura-modelo-adicionar-dano')) {
          const lista = el.querySelector('.t20g-aura-modelo-danos');
          lista.insertAdjacentHTML('beforeend', blocoDeDano(danoPadrao(), item));
          lista.lastElementChild.querySelector('[data-campo="formula"]').focus({ preventScroll: true });
          return conferir();
        }
        const removerApr = alvo.closest('.t20g-aura-modelo-remover-apr');
        if (removerApr) {
          removerApr.closest('.t20g-aura-modelo-apr').remove();
          return conferir();
        }
        const remover = alvo.closest('.t20g-aura-modelo-remover');
        if (remover) {
          const linha = remover.closest('.t20g-aura-modelo-mudanca, .t20g-aura-modelo-apr-efeito');
          const lista = linha.parentElement;
          linha.remove();
          // Efeito e aprimoramento nunca ficam sem linha para digitar
          if (!lista.children.length) {
            lista.insertAdjacentHTML('beforeend', lista.matches('.t20g-aura-modelo-mudancas')
              ? linhaDeMudanca()
              : linhaDoAprimoramento());
          }
          return conferir();
        }
        const novaLinhaApr = alvo.closest('.t20g-aura-modelo-adicionar-apr-linha');
        if (novaLinhaApr) {
          const lista = novaLinhaApr.closest('.t20g-aura-modelo-apr').querySelector('.t20g-aura-modelo-apr-linhas');
          lista.insertAdjacentHTML('beforeend', linhaDoAprimoramento());
          return conferir();
        }
        const adicionar = alvo.closest('.t20g-aura-modelo-adicionar');
        if (adicionar) {
          const lista = adicionar.closest('.t20g-aura-modelo-efeito').querySelector('.t20g-aura-modelo-mudancas');
          lista.insertAdjacentHTML('beforeend', linhaDeMudanca());
          lista.lastElementChild.querySelector('input').focus({ preventScroll: true });
          return conferir();
        }
        const novoEfeito = alvo.closest('.t20g-aura-modelo-adicionar-efeito');
        if (novoEfeito) {
          const lista = el.querySelector('.t20g-aura-modelo-efeitos');
          lista.insertAdjacentHTML('beforeend', blocoDeEfeito(efeitoPadrao(novoEfeito.dataset.tipo), item));
          lista.lastElementChild.querySelector('.t20g-aura-modelo-mudanca input').focus({ preventScroll: true });
          return conferir();
        }
        if (alvo.closest('.t20g-aura-modelo-adicionar-apr')) {
          const lista = el.querySelector('.t20g-aura-modelo-aprs');
          lista.insertAdjacentHTML('beforeend', linhaDeAprimoramento());
          lista.lastElementChild.querySelector('input').focus({ preventScroll: true });
          return conferir();
        }
        const atalho = alvo.closest('.t20g-aura-modelo-atalho');
        if (atalho) {
          const campoValor = ultimoValor?.isConnected
            ? ultimoValor
            : el.querySelector('.t20g-aura-modelo-mudanca [data-campo="valor"]');
          if (!campoValor) return;
          campoValor.value = campoValor.value
            ? `${campoValor.value} + ${atalho.dataset.formula}`
            : atalho.dataset.formula;
          campoValor.focus({ preventScroll: true });
          conferir();
        }
      });
      el.addEventListener('input', conferir);
      el.addEventListener('change', conferir);
      conferir();
    },
    rejectClose: false
  });

  if (!config || typeof config !== 'object') return false;
  // update, não setFlag: as listas têm de ser SUBSTITUÍDAS inteiras.
  await item.update({ [`flags.${MODULE_ID}.${FLAG_MODELO}`]: config });
  return true;
}

/** Tira a configuração do item quando a automação é desligada. */
export async function limparModelo(item) {
  if (item.getFlag(MODULE_ID, FLAG_MODELO) !== undefined) await item.unsetFlag(MODULE_ID, FLAG_MODELO);
}

/**
 * Pergunta quais aprimoramentos usar ao ativar a aura.
 * @returns {object|null} `{ [id]: vezes }`, ou null se a janela foi fechada
 */
export async function escolherAprimoramentos(item, modelo) {
  const linhas = modelo.aprimoramentos.map((a) => `
    <label class="t20g-aura-modelo-escolha">
      <span>${esc(a.nome || a.linhas[0]?.key)} <span class="notes">(+${a.custo} PM${a.maximo > 1 ? ` ${t('AuraModeloAprCada')}` : ''})</span></span>
      ${a.maximo > 1
        ? `<input type="number" name="${esc(a.id)}" min="0" max="${a.maximo}" step="1" value="0">`
        : `<input type="checkbox" name="${esc(a.id)}">`}
    </label>`).join('');

  const ler = (form) => normalizarEscolhas(modelo, Object.fromEntries(modelo.aprimoramentos.map((a) => {
    const entrada = form.elements[a.id];
    return [a.id, entrada?.type === 'checkbox' ? (entrada.checked ? 1 : 0) : Number(entrada?.value) || 0];
  })));

  const escolha = await DialogV2.wait({
    window: { title: t('AuraModeloAprEscolherTitulo', { nome: item.name }), icon: 'fa-solid fa-bolt' },
    position: { width: 380 },
    content: `<div class="t20g-auto-dialogo t20g-aura-modelo">
        <p class="notes">${t('AuraModeloAprEscolherAjuda')}</p>
        ${linhas}
        <p><b>${t('AuraModeloAprTotal')}</b> <span class="t20g-aura-modelo-total">0</span> PM</p>
      </div>`,
    buttons: [
      {
        action: 'ativar',
        label: t('AuraAtivar'),
        icon: 'fa-solid fa-sun',
        default: true,
        callback: (_ev, botao) => ler(botao.form)
      },
      { action: 'cancelar', label: t('AutoCancelar'), icon: 'fa-solid fa-xmark' }
    ],
    render: (_ev, dialogo) => {
      const el = dialogo.element;
      const form = el.querySelector('form') ?? el;
      const total = el.querySelector('.t20g-aura-modelo-total');
      const somar = () => { total.textContent = String(custoDasEscolhas(modelo, ler(form))); };
      el.addEventListener('input', somar);
      el.addEventListener('change', somar);
    },
    rejectClose: false
  });
  return escolha && typeof escolha === 'object' ? escolha : null;
}
