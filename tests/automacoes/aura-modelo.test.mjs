import test from 'node:test';
import assert from 'node:assert/strict';
import {
  modeloPadrao,
  efeitoPadrao,
  normalizarModelo,
  modeloValido,
  efeitoAfeta,
  dependeDoAlvo,
  resolverFormula,
  mudancasPara,
  rotuloDasMudancas,
  normalizarEscolhas,
  custoDasEscolhas,
  linhasComAprimoramentos,
  specDoModelo
} from '../../scripts/automacoes/aura/modelo.mjs';

const fonte = { car: 4, nivel: 9, pericias: { luta: { value: 12 } } };
const alvo = { car: 2 };
const lerDados = (ator) => ator;

const efeito = (dados) => ({ ...efeitoPadrao(dados.tipo), ...dados });

test('padrão é uma Aura Sagrada válida', () => {
  assert.equal(modeloValido(modeloPadrao()), true);
});

test('primeira versão (um efeito na raiz) vira lista de efeitos', () => {
  const c = normalizarModelo({
    raio: 6, tipo: 'uso', usos: { attack: true },
    alvos: { aliados: true, fonte: false, ocultos: true },
    mudancas: [{ key: 'ataque', mode: 2, valor: '@car' }]
  });
  assert.equal(c.efeitos.length, 1);
  assert.equal(c.efeitos[0].tipo, 'uso');
  assert.equal(c.efeitos[0].alvos.fonte, false);
  assert.equal(c.ocultos, true);
  assert.deepEqual(c.efeitos[0].mudancas, [{ key: 'ataque', mode: 2, valor: '@car' }]);
});

test('normalizar tolera lixo e listas vindas como objeto', () => {
  const c = normalizarModelo({
    raio: '-3', custo: '2.7',
    efeitos: { 0: { tipo: 'x', mudancas: { 0: { key: 'dano', mode: '99', valor: '@car' }, 1: { key: '' } } } }
  });
  assert.equal(c.raio, 0);
  assert.equal(c.custo, 2);
  assert.equal(c.efeitos[0].tipo, 'passivo');
  assert.deepEqual(c.efeitos[0].mudancas, [{ key: 'dano', mode: 2, valor: '@car' }]);
  assert.equal(normalizarModelo(null), null);
});

test('efeito de uso não carrega condição', () => {
  const c = normalizarModelo({ efeitos: [{ tipo: 'uso', condicoes: ['abalado'] }] });
  assert.deepEqual(c.efeitos[0].condicoes, []);
});

test('inválido sem raio, sem efeito útil ou sem público', () => {
  const base = modeloPadrao();
  assert.equal(modeloValido({ ...base, raio: 0 }), false);
  assert.equal(modeloValido({ ...base, efeitos: [] }), false);
  assert.equal(modeloValido({ ...base, efeitos: [efeito({ tipo: 'passivo', condicoes: ['abalado'] })] }), true);
  assert.equal(modeloValido({
    ...base,
    efeitos: [efeito({
      tipo: 'passivo', mudancas: [{ key: 'a', valor: '1' }],
      alvos: { aliados: false, neutros: false, inimigos: false, fonte: false }
    })]
  }), false);
});

test('cada efeito tem o seu público', () => {
  const aliados = { aliados: true, neutros: false, inimigos: false, fonte: false };
  assert.equal(efeitoAfeta(aliados, { disposicao: 'FRIENDLY' }), true);
  assert.equal(efeitoAfeta(aliados, { disposicao: 'HOSTILE' }), false);
  // Não afeta a si mesmo
  assert.equal(efeitoAfeta(aliados, { disposicao: 'FRIENDLY', ehFonte: true }), false);
});

test('fórmula lê a fonte, o alvo e faz conta', () => {
  assert.equal(resolverFormula('@car', fonte), 4);
  assert.equal(resolverFormula('@alvo.car', fonte, alvo), 2);
  assert.equal(resolverFormula('floor(@nivel/4)', fonte), 2);
  assert.equal(resolverFormula('@pericias.luta + 1', fonte), 13);
  assert.equal(resolverFormula('-2', fonte), -2);
  assert.equal(resolverFormula('1d6+@car', fonte), '1d6+4');
  assert.equal(resolverFormula('@alvo.car', fonte, null), null);
});

test('mudanças concretas; bônus 0 somado não entra', () => {
  const linhas = [
    { key: 'a', mode: 2, valor: '@alvo.car' },
    { key: 'b', mode: 2, valor: '@car - 4' },
    { key: 'c', mode: 5, valor: '0' }
  ];
  assert.deepEqual(mudancasPara(linhas, fonte, alvo).map((m) => [m.key, m.value]), [['a', '2'], ['c', '0']]);
});

test('rótulo só quando é um bônus somado', () => {
  assert.equal(rotuloDasMudancas([{ mode: 2, value: '3' }]), '+3');
  assert.equal(rotuloDasMudancas([{ mode: 2, value: '-1' }]), '-1');
  assert.equal(rotuloDasMudancas([{ mode: 5, value: '3' }]), '');
  assert.equal(rotuloDasMudancas([]), '');
});

test('aprimoramentos: escolhas no máximo, custo e linhas', () => {
  const c = normalizarModelo({
    ...modeloPadrao(),
    aprimoramentos: [
      { id: 'mais', custo: 2, maximo: 3, acao: 'aumentar', efeito: 'ef0',
        key: 'system.modificadores.pericias.resistencia', valor: '1' },
      { id: 'def', custo: 1, acao: 'novo', efeito: 'ef0', key: 'system.attributes.defesa.bonus', mode: 2, valor: '2' },
      { id: 'sem-efeito', custo: 1, acao: 'novo', key: 'x', valor: '1' }
    ]
  });
  // Sem efeito escolhido, vai para o primeiro
  assert.equal(c.aprimoramentos[2].linhas[0].efeito, 'ef0');
  assert.deepEqual(normalizarEscolhas(c, { mais: 9, def: 1, fantasma: 2 }), { mais: 3, def: 1 });
  assert.equal(custoDasEscolhas(c, { mais: 2, def: 1 }), 5);

  const linhas = linhasComAprimoramentos(c, c.efeitos[0], { mais: 2, def: 1 });
  assert.deepEqual(mudancasPara(linhas, fonte, null).map((m) => m.value), ['6', '2']);
});

test('um aprimoramento mexe em vários bônus de efeitos diferentes', () => {
  const c = normalizarModelo({
    raio: 9,
    efeitos: [
      efeito({ id: 'uso', tipo: 'uso', mudancas: [{ key: 'ataque', valor: '1' }, { key: 'dano', valor: '1' }] }),
      efeito({ id: 'def', tipo: 'passivo', mudancas: [{ key: 'system.attributes.defesa.bonus', valor: '1' }] })
    ],
    aprimoramentos: [{
      id: 'tudo', custo: 2, maximo: 5,
      linhas: [
        { acao: 'aumentar', efeito: 'uso', key: 'ataque', valor: '1' },
        { acao: 'aumentar', efeito: 'uso', key: 'dano', valor: '1' },
        { acao: 'aumentar', efeito: 'def', key: 'system.attributes.defesa.bonus', valor: '1' }
      ]
    }]
  });
  const escolha = { tudo: 2 };
  assert.equal(custoDasEscolhas(c, escolha), 4);
  const valores = (e) => mudancasPara(linhasComAprimoramentos(c, e, escolha), fonte, null).map((m) => m.value);
  assert.deepEqual(valores(c.efeitos[0]), ['3', '3']);
  assert.deepEqual(valores(c.efeitos[1]), ['3']);
});

test('spec: bônus aos aliados e penalidade de uso aos inimigos', () => {
  const spec = specDoModelo({
    raio: 6, bloqueavel: false, ignoraDiagonal: true,
    efeitos: [
      efeito({ id: 'b', tipo: 'passivo', condicoes: ['abalado'],
        alvos: { aliados: true, fonte: false }, mudancas: [{ key: 'a', mode: 2, valor: '@car' }] }),
      efeito({ id: 'p', tipo: 'uso', usos: { attack: true },
        alvos: { aliados: false, inimigos: true, fonte: false }, mudancas: [{ key: 'ataque', mode: 2, valor: '-2' }] })
    ]
  }, { lerDados, condicao: (id) => ({ id, changes: [{ key: 'x', mode: 2, value: '-2' }] }) });

  assert.equal(spec.raio, 6);
  assert.equal(spec.bloqueavel, false);
  assert.equal(spec.ignoraDiagonal, true);
  assert.equal(spec.aceitaModificadores, false);
  // A geometria procura aliados E inimigos, mas não a fonte
  assert.deepEqual(spec.disposicoes, ['FRIENDLY', 'HOSTILE']);
  assert.equal(spec.incluirFonte, false);

  const [bonus, penalidade] = spec.partes(fonte);
  assert.equal(bonus.rotulo, '+4');
  assert.equal(bonus.changes.length, 2);
  assert.deepEqual(bonus.statuses, ['abalado']);
  assert.deepEqual(bonus.flagsT20, { onuse: false, custo: '0' });
  assert.deepEqual(penalidade.flagsT20, { onuse: true, custo: '0', attack: true });
  assert.equal(spec.resumo(fonte), '+4 / -2');
});

test('efeito de uso sem tipo marcado vale para todas as rolagens', () => {
  const spec = specDoModelo({
    raio: 9,
    efeitos: [efeito({ tipo: 'uso', usos: {}, mudancas: [{ key: 'ataque', valor: '1' }] })]
  }, { lerDados });
  const flags = spec.partes(fonte)[0].flagsT20;
  assert.equal(flags.onuse, true);
  assert.equal(flags.attack, true);
  assert.equal(flags.spell, true);
});

test('fórmula do alvo calcula por alvo', () => {
  const spec = specDoModelo({
    raio: 9, efeitos: [efeito({ tipo: 'passivo', mudancas: [{ key: 'a', valor: '@alvo.car' }] })]
  }, { lerDados });
  assert.equal(dependeDoAlvo(spec.modelo), true);
  assert.equal(spec.porAlvo, true);
  assert.equal(spec.partes(fonte, alvo)[0].changes[0].value, '2');
  assert.equal(spec.resumo(fonte), 'varia por alvo');
});

test('config inválida não vira aura', () => {
  assert.equal(specDoModelo({ ...modeloPadrao(), raio: 0 }), null);
  assert.equal(specDoModelo(undefined), null);
});

test('resistência: CD do T20 e o que fazer com cada alvo', async () => {
  const { cdDaResistencia, situacaoDoAlvo, normalizarResistencia } =
    await import('../../scripts/automacoes/aura/modelo.mjs');
  const res = normalizarResistencia({ ativa: true, teste: 'fort', atributo: 'car', bonus: 2, quando: 'entrar' });
  // 10 + 9/2 (4) + Car 4 + 2
  assert.equal(cdDaResistencia(res, fonte), 20);
  assert.equal(situacaoDoAlvo(res, null), 'rolar');
  assert.equal(situacaoDoAlvo(res, { passou: false }), 'aplicar');
  assert.equal(situacaoDoAlvo(res, { passou: true }), 'poupar');
  // Por turno: quem ainda não testou espera o turno
  assert.equal(situacaoDoAlvo({ ...res, quando: 'turnoFonte' }, null), 'poupar');
  assert.equal(normalizarResistencia({ teste: 'x', quando: 'y' }).teste, 'vont');
});

test('spec leva a CD já calculada só nos efeitos resistíveis', () => {
  const spec = specDoModelo({
    raio: 9,
    efeitos: [
      efeito({ id: 'a', tipo: 'passivo', mudancas: [{ key: 'a', valor: '-2' }],
        resistencia: { ativa: true, teste: 'vont', atributo: 'car', quando: 'turnoAlvo' } }),
      efeito({ id: 'b', tipo: 'passivo', mudancas: [{ key: 'b', valor: '1' }] })
    ]
  }, { lerDados });
  const [a, b] = spec.partes(fonte);
  assert.equal(a.resistencia.cd, 18);
  assert.equal(a.resistencia.quando, 'turnoAlvo');
  assert.equal(b.resistencia, null);
});

test('a conta sai pronta mesmo com o safeEval do Foundry, que depende de this', () => {
  const antes = globalThis.Roll;
  globalThis.Roll = class {
    static MATH_PROXY = Math;
    static safeEval(expr) {
      // eslint-disable-next-line no-new-func
      return Function('m', `with (m) { return ${expr}; }`)(this.MATH_PROXY);
    }
  };
  try {
    assert.equal(resolverFormula('(1) + (1) * 3', fonte), 4);
    assert.equal(resolverFormula('floor(@nivel/4)', fonte), 2);
  } finally {
    globalThis.Roll = antes;
  }
});

test('dano: normaliza, conta como aura válida e resolve fórmula e CD', async () => {
  const { danoFinal } = await import('../../scripts/automacoes/aura/modelo.mjs');
  const bruto = {
    raio: 6,
    efeitos: [],
    danos: [
      { id: 'd', formula: '2d6+@car', tipo: 'fogo', quando: 'ativar',
        resistencia: { ativa: true, teste: 'refl', atributo: 'car', sucesso: 'anula' } },
      { id: 'vazio', formula: '' }
    ]
  };
  assert.equal(modeloValido(bruto), true);
  const spec = specDoModelo(bruto, { lerDados });
  // Só inimigos por padrão: a geometria procura inimigos, não a fonte
  assert.deepEqual(spec.disposicoes, ['HOSTILE']);
  assert.equal(spec.incluirFonte, false);
  const [d] = spec.danos(fonte);
  assert.equal(spec.danos(fonte).length, 1);
  assert.equal(d.formula, '2d6+4');
  assert.equal(d.resistencia.cd, 18);
  assert.equal(spec.resumo(fonte), '1 dano(s)');

  assert.equal(danoFinal(9, { ativa: true, sucesso: 'metade' }, true), 4);
  assert.equal(danoFinal(9, { ativa: true, sucesso: 'anula' }, true), 0);
  assert.equal(danoFinal(9, { ativa: true, sucesso: 'anula' }, false), 9);
  assert.equal(danoFinal(9, null, null), 9);
});

test('itens específicos vão para o efeito de uso como no sistema', () => {
  const so = specDoModelo({
    raio: 9, efeitos: [efeito({ tipo: 'uso', usos: {}, itens: 'Espada Longa', mudancas: [{ key: 'ataque', valor: '1' }] })]
  }, { lerDados });
  // Sem tipo marcado, só os itens nomeados
  assert.deepEqual(so.partes(fonte)[0].flagsT20, { onuse: true, custo: '0', items: 'Espada Longa' });

  const junto = specDoModelo({
    raio: 9, efeitos: [efeito({ tipo: 'uso', usos: { spell: true }, itens: 'Arco', mudancas: [{ key: 'ataque', valor: '1' }] })]
  }, { lerDados });
  assert.deepEqual(junto.partes(fonte)[0].flagsT20, { onuse: true, custo: '0', spell: true, items: 'Arco' });

  // Passivo não carrega o campo
  assert.equal(normalizarModelo({ efeitos: [{ tipo: 'passivo', itens: 'x' }] }).efeitos[0].itens, '');
});

test('aura permanente não se sustenta nem cobra por turno', () => {
  const config = normalizarModelo({ ...modeloPadrao(), permanente: true, custo: 3, lembrete: true });
  assert.equal(config.permanente, true);
  assert.equal(config.lembrete, false);
  const spec = specDoModelo(config, { lerDados });
  assert.equal(spec.permanente, true);
  assert.equal(spec.lembrete, false);
  assert.equal(spec.custo, 0);

  // Sem a marca, continua como antes
  const comum = specDoModelo(normalizarModelo({ ...modeloPadrao(), custo: 2 }), { lerDados });
  assert.equal(comum.permanente, false);
  assert.equal(comum.lembrete, true);
  assert.equal(comum.custo, 2);
});

test('aura permanente não cancela pelo jogador e acompanha a troca de cena', async () => {
  const { readFile } = await import('node:fs/promises');
  const fonteIndex = await readFile(new URL('../../scripts/automacoes/aura/index.mjs', import.meta.url), 'utf8');
  assert.match(fonteIndex, /if \(item && ehPermanente\(item\)\) return;/);
  assert.match(fonteIndex, /ehPermanente\(aura\.item\)\) await mudarDeCena/);
});
