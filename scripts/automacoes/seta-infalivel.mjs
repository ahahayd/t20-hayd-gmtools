import { definicaoDe } from './estado.mjs';

const { DialogV2 } = foundry.applications.api;

export function analisarDano(message) {
  const roll = message.rolls?.find((r) => r.options?.type === 'damage') ?? message.rolls?.[0];
  if (!roll?.terms?.length) return null;

  // Achata os termos em operandos com sinal (ignora os operadores)
  const operandos = [];
  let sinal = 1;
  for (const termo of roll.terms) {
    if (termo.operator !== undefined) {
      if (termo.operator === '-') sinal = -1;
      else if (termo.operator === '+') sinal = 1;
      continue;
    }
    operandos.push({ termo, sinal });
    sinal = 1;
  }

  const ehDado = (t) => Array.isArray(t.results) && !!t.faces;
  const qtdDados = (t) => Number(t.number) || t.results.filter((r) => r.active !== false).length;
  const iPrimeiroDado = operandos.findIndex((o) => ehDado(o.termo));
  if (iPrimeiroDado === -1) return null;

  // 1) Dados da própria magia (primeiro grupo de dados)
  const alvo = operandos[iPrimeiroDado];
  const base = {
    quantidade: qtdDados(alvo.termo),
    faces: alvo.termo.faces,
    tipo: alvo.termo.options?.flavor ?? '',
    sinal: alvo.sinal
  };
  if (!base.quantidade) return null;

  // 2) O fixo da magia, se vier logo em seguida (ex.: o "+2" de 2d4+2)
  let fixoBase = 0;
  let iDepoisDoFixo = iPrimeiroDado + 1;
  const seguinte = operandos[iPrimeiroDado + 1];
  if (seguinte && !ehDado(seguinte.termo)) {
    fixoBase = (Number(seguinte.termo.total) || 0) * seguinte.sinal;
    iDepoisDoFixo = iPrimeiroDado + 2;
  }

  // 3) Todo o resto é bônus de efeito. Dados de bônus guardam a FÓRMULA
  //    (são rolados de novo); bônus fixos guardam o valor.
  const extras = [];
  const registrar = (o) => {
    const tipo = o.termo.options?.flavor ?? '';
    if (ehDado(o.termo)) {
      const n = qtdDados(o.termo);
      if (!n) return;
      extras.push({
        rotulo: `Bônus ${n}d${o.termo.faces}`,
        detalhe: tipo || 'sem tipo',
        dados: { quantidade: n, faces: o.termo.faces, sinal: o.sinal },
        tipo
      });
    } else {
      const valor = (Number(o.termo.total) || 0) * o.sinal;
      if (!valor) return;
      extras.push({
        rotulo: `Bônus ${valor > 0 ? '+' : ''}${valor}`,
        detalhe: tipo || 'sem tipo',
        valor,
        tipo
      });
    }
  };
  operandos.slice(0, iPrimeiroDado).forEach(registrar);   // termos antes dos dados
  operandos.slice(iDepoisDoFixo).forEach(registrar);      // termos depois do fixo

  return { base, fixoBase, extras };
}

/**
 * Monta as linhas do diálogo para uma quantidade de setas.
 *
 * As setas não têm valor aqui — só o formato do dado —, porque só serão
 * roladas depois da distribuição. `numSetas` pode ser reduzido quando algum
 * efeito soma dados ao grupo base: os dados sobrando viram um bônus. O fixo da
 * magia é repartido entre as setas e qualquer sobra vira um bônus avulso, para
 * que nada do dano se perca.
 */
export function montarEntradas(analise, numSetas, def) {
  const porProjetil = Number(def.distribuicao?.porProjetil) || 0;
  const nome = def.distribuicao?.nomeProjetil ?? 'Projétil';
  const { base } = analise;
  const n = Math.min(Math.max(1, numSetas), base.quantidade);

  const setas = Array.from({ length: n }, (_, i) => ({
    rotulo: `${nome} ${i + 1}`,
    detalhe: `1d${base.faces}${porProjetil ? `+${porProjetil}` : ''}`,
    dados: { quantidade: 1, faces: base.faces, sinal: base.sinal },
    fixo: porProjetil * base.sinal,
    tipo: base.tipo
  }));

  const bonus = [];

  // Dados do grupo base que não são setas (efeitos que somaram dados)
  const sobrando = base.quantidade - n;
  if (sobrando > 0) {
    bonus.push({
      rotulo: `Bônus ${sobrando}d${base.faces}`,
      detalhe: base.tipo || 'sem tipo',
      dados: { quantidade: sobrando, faces: base.faces, sinal: base.sinal },
      tipo: base.tipo
    });
  }

  // Sobra do fixo da magia (o que não coube como "+1 por seta")
  const resto = analise.fixoBase - n * porProjetil;
  if (resto) {
    bonus.push({
      rotulo: `Bônus ${resto > 0 ? '+' : ''}${resto}`,
      detalhe: base.tipo || 'sem tipo',
      valor: resto,
      tipo: base.tipo
    });
  }

  bonus.push(...analise.extras);
  return { setas, bonus };
}

/** Fórmula de uma entrada (dados a rolar + parte fixa), já com o tipo de dano. */
export function formulaDaEntrada(entrada) {
  const partes = [];
  const marca = (txt) => (entrada.tipo ? `${txt}[${entrada.tipo}]` : txt);
  if (entrada.dados?.quantidade) {
    const sinal = entrada.dados.sinal < 0 ? '-' : '';
    partes.push(marca(`${sinal}${entrada.dados.quantidade}d${entrada.dados.faces}`));
  }
  const fixo = (entrada.fixo ?? 0) + (entrada.valor ?? 0);
  if (fixo) partes.push(marca(String(fixo)));
  return partes;
}

/** Diálogo de distribuição: cada seta e cada bônus vai para um alvo. */
export async function abrirDistribuicao(item, message) {
  const def = definicaoDe(item);
  const analise = analisarDano(message);
  if (!analise) {
    return ui.notifications.warn(game.i18n.localize('T20HaydGMTools.DistSemDano'));
  }

  const maxSetas = analise.base.quantidade;
  const nomePlural = def.distribuicao?.nomeProjetilPlural ?? 'projéteis';

  const conteudo = `
    <div class="t20g-dist">
      <p class="notes">${game.i18n.localize('T20HaydGMTools.DistAjuda')}</p>
      <div class="form-group">
        <label>${game.i18n.format('T20HaydGMTools.DistQtdSetas', { nome: nomePlural })}</label>
        <input type="number" name="setas" min="1" max="${maxSetas}" value="${maxSetas}" step="1" />
      </div>
      <div class="form-group">
        <label>${game.i18n.localize('T20HaydGMTools.DistQtdAlvos')}</label>
        <input type="number" name="alvos" min="1" max="${maxSetas}" value="1" step="1" />
      </div>
      <table class="t20g-dist-tabela">
        <thead><tr>
          <th>${game.i18n.localize('T20HaydGMTools.DistFonte')}</th>
          <th>${game.i18n.localize('T20HaydGMTools.DistDetalhe')}</th>
          <th>${game.i18n.localize('T20HaydGMTools.DistAlvo')}</th>
        </tr></thead>
        <tbody class="t20g-dist-corpo"></tbody>
      </table>
      <p class="t20g-dist-total"></p>
      <p class="notes">${game.i18n.localize('T20HaydGMTools.DistNotaBonus')}</p>
    </div>`;

  const resultado = await DialogV2.wait({
    window: { title: `${def.nome} — ${def.distribuicao.rotulo}`, icon: def.icone },
    position: { width: 480 },
    content: conteudo,
    buttons: [
      {
        action: 'distribuir',
        label: game.i18n.localize('T20HaydGMTools.DistConfirmar'),
        icon: 'fa-solid fa-bullseye',
        default: true,
        callback: (ev, botao) => {
          const form = botao.form;
          const numSetas = Math.min(Math.max(1, Number(form.elements.setas.value) || 1), maxSetas);
          const { setas, bonus } = montarEntradas(analise, numSetas, def);
          const ler = (grupo, n) =>
            Array.from({ length: n }, (_, i) => Number(form.elements[`${grupo}.${i}`]?.value) || 1);
          return {
            numSetas,
            alvos: Math.max(1, Number(form.elements.alvos.value) || 1),
            setas: ler('s', setas.length),
            bonus: ler('b', bonus.length)
          };
        }
      },
      { action: 'cancelar', label: game.i18n.localize('T20HaydGMTools.AutoCancelar'), icon: 'fa-solid fa-xmark' }
    ],
    render: (ev, dialogo) => {
      const el = dialogo.element;
      const campoSetas = el.querySelector('input[name="setas"]');
      const campoAlvos = el.querySelector('input[name="alvos"]');
      const corpo = el.querySelector('.t20g-dist-corpo');
      const rodape = el.querySelector('.t20g-dist-total');

      // Guarda as escolhas de alvo por rótulo, para não perdê-las ao
      // recalcular a tabela quando o número de setas muda
      const escolhas = new Map();

      const redesenhar = () => {
        const numSetas = Math.min(Math.max(1, Number(campoSetas.value) || 1), maxSetas);
        const numAlvos = Math.min(Math.max(1, Number(campoAlvos.value) || 1), maxSetas);
        const { setas, bonus } = montarEntradas(analise, numSetas, def);

        const opcoes = Array.from({ length: numAlvos }, (_, i) =>
          `<option value="${i + 1}">${game.i18n.format('T20HaydGMTools.DistAlvoN', { n: i + 1 })}</option>`
        ).join('');

        const linhas = (grupo, entradas) =>
          entradas.map((e, i) => `
            <tr>
              <td class="t20g-dist-nome">${e.rotulo}</td>
              <td class="t20g-dist-detalhe">${e.detalhe}</td>
              <td><select name="${grupo}.${i}" class="t20g-dist-alvo"
                    data-chave="${grupo}|${e.rotulo}">${opcoes}</select></td>
            </tr>`).join('');

        corpo.innerHTML = linhas('s', setas) + linhas('b', bonus);

        // Resumo do que cada alvo vai receber — fórmulas, não valores:
        // as setas só são roladas depois de confirmar
        const resumir = () => {
          const resumo = new Map();
          const acumular = (grupo, entradas) => entradas.forEach((e, i) => {
            const select = corpo.querySelector(`select[name="${grupo}.${i}"]`);
            const alvo = Number(select?.value) || 1;
            if (!resumo.has(alvo)) resumo.set(alvo, []);
            resumo.get(alvo).push(...formulaDaEntrada(e).map((f) => f.replace(/\[.*?\]/g, '')));
          });
          acumular('s', setas);
          acumular('b', bonus);
          rodape.innerHTML = [...resumo.keys()].sort((a, b) => a - b)
            .map((alvo) => `<b>${game.i18n.format('T20HaydGMTools.DistAlvoN', { n: alvo })}:</b> `
              + resumo.get(alvo).join(' + '))
            .join('<br>');
        };

        // Restaura escolhas anteriores (padrão: alvo 1)
        for (const select of corpo.querySelectorAll('.t20g-dist-alvo')) {
          const anterior = escolhas.get(select.dataset.chave) ?? 1;
          select.value = String(Math.min(anterior, numAlvos));
          select.addEventListener('change', () => {
            escolhas.set(select.dataset.chave, Number(select.value) || 1);
            resumir();
          });
        }

        resumir();
      };

      for (const campo of [campoSetas, campoAlvos]) {
        campo.addEventListener('change', redesenhar);
        campo.addEventListener('input', redesenhar);
      }
      redesenhar();
    },
    rejectClose: false
  });

  if (!resultado) return;
  const entradas = montarEntradas(analise, resultado.numSetas, def);
  await postarDanoPorAlvo(item, entradas, resultado);
}

/**
 * Rola o dano de cada alvo e posta um cartão por alvo.
 *
 * As setas (e os dados de bônus) são rolados AGORA, depois da distribuição —
 * a rolagem original da magia serve só para saber quantos dados e quais bônus
 * existem, nunca os valores.
 */
async function postarDanoPorAlvo(item, { setas: projeteis, bonus }, escolhas) {
  const def = definicaoDe(item);
  const ator = item.actor;
  const porAlvo = new Map(); // alvo → { partes: string[], setas: number }

  const registrar = (alvo, entrada, ehSeta) => {
    if (!porAlvo.has(alvo)) porAlvo.set(alvo, { partes: [], setas: 0 });
    const dados = porAlvo.get(alvo);
    dados.partes.push(...formulaDaEntrada(entrada));
    if (ehSeta) dados.setas += 1;
  };

  projeteis.forEach((p, i) => registrar(escolhas.setas[i] ?? 1, p, true));
  bonus.forEach((b, i) => registrar(escolhas.bonus[i] ?? 1, b, false));

  const speaker = ChatMessage.getSpeaker({ actor: ator });
  const alvosOrdenados = [...porAlvo.keys()].sort((a, b) => a - b);

  for (const alvo of alvosOrdenados) {
    const { partes, setas } = porAlvo.get(alvo);
    if (!partes.length) continue;
    // Junta cuidando dos termos negativos ("+ -3" não é fórmula válida)
    const formula = partes.reduce((acc, p) =>
      acc ? (p.startsWith('-') ? `${acc} - ${p.slice(1)}` : `${acc} + ${p}`) : p, '');

    const roll = await new Roll(formula).evaluate();
    await roll.toMessage({
      speaker,
      flavor: game.i18n.format('T20HaydGMTools.DistFlavor', {
        magia: item.name,
        alvo,
        setas,
        nome: setas === 1 ? def.distribuicao.nomeProjetil.toLowerCase() : def.distribuicao.nomeProjetilPlural
      })
    });
  }

  ui.notifications.info(
    game.i18n.format('T20HaydGMTools.DistPronto', { alvos: alvosOrdenados.length })
  );
}

/* ─── Golpe Pessoal ──────────────────────────────────────────────────────── */
