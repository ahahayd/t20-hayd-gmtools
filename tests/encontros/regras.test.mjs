import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ndNumero, ndRotulo, calcularNDEncontro, acrescimoPorQuantidade, ajusteTamanhoGrupo,
  ndDoGrupo, classificar, ndAlvo, parametros, validarFicha, calcularXP, receitas,
  sugerir, lacaiosParaAlvo, propostaBando, ajustesChefeFinal, avaliarCandidata,
  perfilDeTema, combinaTema, combinaAmbiente, temasDisponiveis
} from '../../scripts/encontros/regras.mjs';

const nds = (...l) => l.map((nd, i) => ({ id: String(i), nd }));

test('ND lido das fichas', () => {
  assert.equal(ndNumero('1/4'), 0.25);
  assert.equal(ndNumero('0,5'), 0.5);
  assert.equal(ndNumero(' 7 '), 7);
  assert.equal(ndNumero('S+'), 22);
  assert.equal(ndNumero(''), null);
  assert.equal(ndRotulo(0.5), '1/2');
  assert.equal(ndRotulo(8.5), '8');
});

test('mesmo ND: frações multiplicam, ND ≥ 1 soma +2 por dobra', () => {
  assert.equal(calcularNDEncontro([{ nd: 0.25, qtd: 4 }]).nd, 1);
  assert.equal(calcularNDEncontro([{ nd: 0.5, qtd: 2 }]).nd, 1);
  assert.equal(calcularNDEncontro([{ nd: 1, qtd: 2 }]).nd, 3);
  assert.equal(calcularNDEncontro([{ nd: 5, qtd: 4 }]).nd, 9);
  assert.deepEqual([3, 5, 6, 8].map(acrescimoPorQuantidade), [3, 4, 5, 6]);
});

test('exemplo oficial de NDs diferentes: 7 + 6 + 5 + 3 = ND 8', () => {
  const r = calcularNDEncontro(nds(7, 6, 5, 3));
  assert.equal(r.bruto, 8.5);
  assert.equal(r.nd, 8);
  assert.ok(r.ignorados.has('3'));
});

test('grupos que empatam se agrupam de novo', () => {
  // 2 × ND 1 = 3, e mais um ND 3 → dois grupos de 3 → 5.
  assert.equal(calcularNDEncontro([{ id: 'a', nd: 1, qtd: 2 }, { id: 'b', nd: 3, qtd: 1 }]).nd, 5);
});

test('lacaios do livro: grupo de 5º nível contra 4 lacaios ND 1 é ND 5', () => {
  assert.equal(calcularNDEncontro([{ nd: 1, qtd: 4 }]).nd, 5);
});

test('ND do grupo com tamanho, ritmo e perfil', () => {
  assert.deepEqual([2, 3, 4, 5, 6, 8].map(ajusteTamanhoGrupo), [-2, -1, 0, 1, 1, 2]);
  assert.equal(ndDoGrupo({ niveis: [5, 5, 5, 5] }).nd, 5);
  assert.equal(ndDoGrupo({ niveis: [5, 5, 5, 5, 5, 5] }).nd, 6);
  assert.equal(ndDoGrupo({ niveis: [5, 5, 5, 5], ritmo: 'muitos' }).nd, 3);
  assert.equal(ndDoGrupo({ niveis: [1, 1] }).nd, 0.25);
});

test('faixas de dificuldade', () => {
  assert.equal(classificar(5, 5).id, 'justo');
  assert.equal(classificar(7, 5).id, 'desafiador');
  assert.equal(classificar(3, 5).id, 'facil');
  assert.equal(classificar(10, 15).id, 'irrelevante');
  assert.equal(classificar(10, 5).id, 'massacre');
  assert.equal(ndAlvo(5, 'mortal'), 9);
  assert.equal(ndAlvo(1, 'facil'), 0.25);
});

test('Tabela 2-3 e validação de ficha (Dejeto Vivo: Defesa do ND 5, PV do ND 7)', () => {
  assert.deepEqual(parametros('solo', 4), { ataque: 16, dano: 24, defesa: 23, resForte: 16, resMedia: 10, resFraca: 4, pv: 140, cd: 18 });
  assert.equal(parametros('lackey', 2).ataque, 14);
  // Desvio de 1 ND é normal — não acusa.
  assert.deepEqual(validarFicha({ papel: 'solo', nd: 6, pv: 280, defesa: 24 }), []);
  const v = validarFicha({ papel: 'solo', nd: 6, pv: 400, defesa: 24 });
  assert.equal(v[0].coluna, 'pv');
  assert.equal(v[0].ndEquivalente, '10');
});

test('XP: por ameaça, irrelevante, chefe final e unificado', () => {
  const xp = calcularXP({ ameacas: [{ id: 'o', nd: 5, qtd: 1 }], ndEncontro: 5, nivelGrupo: 5, nPJs: 4 });
  assert.equal(xp.porAmeaca, 5000);
  assert.equal(xp.porAmeacaPJ, 1250);
  assert.equal(calcularXP({ ameacas: [{ nd: 1, qtd: 1 }], ndEncontro: 1, nivelGrupo: 6, nPJs: 4 }).porAmeaca, 0);
  assert.equal(calcularXP({ ameacas: [{ nd: 5, qtd: 1, chefe: true }], ndEncontro: 5, nivelGrupo: 5, nPJs: 4 }).porAmeaca, 7000);
  assert.equal(calcularXP({ ameacas: [{ nd: 8, qtd: 2 }], ndEncontro: 10, nivelGrupo: 8, nPJs: 4 }).unificado, 10000);
});

test('receitas fecham o ND alvo', () => {
  for (const alvo of [1, 3, 5, 9, 15]) {
    const rs = receitas(alvo);
    assert.ok(rs.length >= 2, `receitas para ND ${alvo}`);
    for (const r of rs) {
      assert.equal(calcularNDEncontro(r.partes.map((p, i) => ({ id: String(i), ...p }))).nd, alvo, r.titulo);
    }
  }
});

test('solo sozinho: sugere lacaios que mantêm o alvo', () => {
  const lac = lacaiosParaAlvo([{ id: 's', nd: 5, qtd: 1 }], 6, { ndMax: 5 });
  assert.ok(lac.length);
  assert.equal(calcularNDEncontro([{ id: 's', nd: 5 }, { id: 'l', nd: lac[0].nd, qtd: lac[0].qtd }]).nd, 6);

  const cartoes = sugerir({ ameacas: [{ id: 's', nome: 'Ogro', nd: 5, papel: 'solo', papelFicha: 'solo', qtd: 1 }], alvo: 5, ndGrupo: 5, nivelGrupo: 5, nPJs: 4 });
  assert.ok(cartoes.some(c => c.titulo.startsWith('Um inimigo')));
});

test('acima do alvo: propõe reduzir', () => {
  const ameacas = [{ id: 'g', nome: 'Goblin', nd: 1, papel: 'lackey', papelFicha: 'lackey', qtd: 8 }];
  const c = sugerir({ ameacas, alvo: 3, ndGrupo: 3, nivelGrupo: 3, nPJs: 4 });
  const acao = c[0].acoes.find(a => a.tipo === 'qtd');
  assert.equal(acao.qtd, 2);
});

test('Bando e Chefe Final', () => {
  const b = propostaBando(2, 10);
  assert.equal(b.ndBando, 5);
  assert.equal(b.multDano, 2);
  assert.deepEqual(ajustesChefeFinal(12, 600), { pv: 1200, rd: 10, pmPorND: 2, ndRecompensa: 14, recursos: 6 });
});

test('candidata de compêndio: melhor quantidade para o alvo', () => {
  const r = avaliarCandidata([{ id: 's', nd: 5, qtd: 1 }], 7, { nd: 3, papel: 'lackey' }, 'lackey');
  assert.equal(r.dist, 0);
});

test('estruturas do "monte pra mim" fecham o alvo a partir do patamar veterano', async () => {
  // Em ND baixo algumas (horda) são inviáveis: a janela as marca como indisponíveis.
  const { ESTRUTURAS, montarEstrutura } = await import('../../scripts/encontros/regras.mjs');
  for (const alvo of [8, 12, 17]) {
    for (const e of ESTRUTURAS) {
      const r = montarEstrutura(e, alvo);
      assert.ok(r && r.dist === 0, `${e.id} ND ${alvo} (dist ${r?.dist})`);
    }
  }
});

test('Bando: fórmula, tamanho, ND e desvios (exemplo do Cardume de Aquin\'ne)', async () => {
  const { multiplicarFormula, calcularBando, ndsDoBando, tamanhoDoBando } = await import('../../scripts/encontros/dados-bando.mjs');
  assert.equal(multiplicarFormula('1d12+18', 2), '2d12+36');
  assert.equal(multiplicarFormula('2d4+6', 2), '4d4+12');
  assert.equal(multiplicarFormula('1d8', 4), '4d8');
  assert.deepEqual(ndsDoBando(2, 'dezena'), [4, 5, 6]);
  assert.equal(tamanhoDoBando('peq', 'dezena'), 'med');
  assert.equal(tamanhoDoBando('gra', 'centena'), 'col');
  // Aquin'ne: lacaio ND 2, ataque +13 (1 abaixo da tabela) → bando ND 5: +19, dano ×2.
  const c = calcularBando({ papel: 'lackey', nd: 2, ndBando: 5, pv: 14, defesa: 18, resistencias: [12, 7, 3], tamanho: 'peq' });
  assert.equal(13 + c.deltaAtaque, 19);
  assert.equal(c.multDano, 2);
  assert.equal(c.pv, 40);
  assert.equal(c.deltaPericias, 1);
});

test('montador: estruturas de bando e de chefe final fecham o alvo', async () => {
  const { ESTRUTURAS, montarEstrutura } = await import('../../scripts/encontros/regras.mjs');
  for (const id of ['bando-so', 'bando-solo', 'bando-especial', 'chefe-so', 'chefe-bando', 'chefe-especial']) {
    const r = montarEstrutura(ESTRUTURAS.find(e => e.id === id), 10);
    assert.equal(r.dist, 0, id);
  }
  // Bando não tem ND da criatura-base abaixo de 1.
  const r = montarEstrutura(ESTRUTURAS.find(e => e.id === 'bando-enorme'), 10);
  assert.ok(r.partes[0].nd - 7 >= 1);
});

test('chance de acerto e Defesa recomendada (um cartão só, mesmo com várias criaturas)', async () => {
  const { chanceDeAcerto, defesaRecomendada } = await import('../../scripts/encontros/regras.mjs');
  assert.equal(chanceDeAcerto(10, 21), 0.5);
  assert.equal(chanceDeAcerto(40, 20), 0.95);
  assert.equal(chanceDeAcerto(0, 40), 0.05);
  assert.equal(defesaRecomendada(30), 36);
  assert.equal(chanceDeAcerto(30, defesaRecomendada(30)), 0.75);

  const base = { alvo: 12, ndGrupo: 8, nivelGrupo: 8, nPJs: 4 };
  const dois = [
    { id: 'a', nome: 'Dragão', nd: 12, papel: 'solo', papelFicha: 'solo', qtd: 1 },
    { id: 'b', nome: 'Serpe', nd: 11, papel: 'solo', papelFicha: 'solo', qtd: 1 }
  ];
  const baixa = sugerir({ ...base, ameacas: dois, defesaMediaPJ: 22 }).filter(c => c.titulo.startsWith('Defesa recomendada'));
  assert.equal(baixa.length, 1);
  assert.equal(baixa[0].titulo, 'Defesa recomendada: 42 (grupo: 22)');
  assert.match(baixa[0].texto, /Dragão \(ataque \+36\)/);
  assert.match(baixa[0].texto, /Serpe/);
  assert.match(baixa[0].texto, /buffs/);

  // Até 4 abaixo da recomendada ainda não é "muito abaixo".
  assert.ok(!sugerir({ ...base, ameacas: dois.slice(0, 1), defesaMediaPJ: 38 }).some(c => c.titulo.startsWith('Defesa recomendada')));
  assert.ok(sugerir({ ...base, ameacas: dois.slice(0, 1), defesaMediaPJ: 37 }).some(c => c.titulo.startsWith('Defesa recomendada')));

  const fraco = sugerir({ ameacas: [
    { id: 'a', nome: 'Cultista', nd: 2, papel: 'special', papelFicha: 'special', qtd: 1 },
    { id: 'b', nome: 'Acólito', nd: 2, papel: 'special', papelFicha: 'special', qtd: 1 }
  ], alvo: 2, ndGrupo: 2, nivelGrupo: 2, nPJs: 4, defesaMediaPJ: 25 });
  const raras = fraco.filter(c => c.titulo.startsWith('Difícil acertar'));
  assert.equal(raras.length, 1);
  assert.match(raras[0].titulo, /Cultista, Acólito/);
});

test('avisos iguais viram um cartão só', () => {
  const r = sugerir({ ameacas: [
    { id: 'a', nome: 'Hidra', nd: 10, papel: 'solo', papelFicha: 'solo', qtd: 1 },
    { id: 'b', nome: 'Rato', nd: 1, papel: 'lackey', papelFicha: '', qtd: 1 },
    { id: 'c', nome: 'Morcego', nd: 2, papel: 'lackey', papelFicha: '', qtd: 1 }
  ], alvo: 10, ndGrupo: 10, nivelGrupo: 10, nPJs: 4 });
  assert.equal(r.filter(c => c.titulo.startsWith('Papel não definido')).length, 1);
  const leves = r.filter(c => c.titulo.startsWith('Não soma ao ND'));
  assert.equal(leves.length, 1);
  assert.deepEqual(leves[0].acoes.map(a => a.id), ['b', 'c']);
});

test('perfil de tema normaliza subtipo livre e lê os dois formatos de deslocamento', () => {
  const dragao = perfilDeTema({ tipo: 'mon', raca: 'Dragão', movement: { fly: 18, swim: 0 } });
  assert.deepEqual(dragao, { tipos: ['mon'], subtipos: [{ chave: 'dragao', nome: 'dragão' }], swim: false, fly: true });
  assert.equal(perfilDeTema({ tipo: 'ani', movement: { swim: { base: 9 } } }).swim, true);

  // "Humanoide (morto-vivo)" entra no tema Morto-vivo; "bando" não é subtipo.
  const esqueleto = perfilDeTema({ tipo: 'hum', raca: 'Morto-vivo' });
  assert.deepEqual(esqueleto.tipos, ['hum', 'mor']);
  assert.deepEqual(esqueleto.subtipos, []);
  assert.deepEqual(perfilDeTema({ tipo: 'hum', raca: 'bando' }).subtipos, []);

  assert.ok(combinaTema(esqueleto, 'tipo:mor'));
  assert.ok(combinaTema(dragao, 'sub:dragao'));
  assert.ok(!combinaTema(dragao, 'tipo:mor'));
  assert.ok(combinaAmbiente(dragao, 'aereo'));
  assert.ok(!combinaAmbiente(dragao, 'aquatico'));
  assert.ok(combinaAmbiente(dragao, ''));
});

test('temas disponíveis: subtipo raro some e cada subtipo fica no tipo mais comum', () => {
  const ficha = (tipo, raca) => perfilDeTema({ tipo, raca });
  const indice = [
    ficha('mon', 'dragão'), ficha('mon', 'Dragão'), ficha('hum', 'dragão'),
    ficha('hum', 'minauro'), ficha('mor', '')
  ];
  const grupos = temasDisponiveis(indice, { mon: 'Monstro', hum: 'Humanoide', mor: 'Morto-vivo' });
  assert.deepEqual(grupos.map(g => g.nome), ['Humanoide', 'Monstro', 'Morto-vivo']);
  assert.deepEqual(grupos[0].temas.map(t => t.id), ['tipo:hum']);
  assert.deepEqual(grupos[1].temas, [
    { id: 'tipo:mon', rotulo: 'Monstro' },
    { id: 'sub:dragao', rotulo: 'Monstro (dragão)' }
  ]);
});
