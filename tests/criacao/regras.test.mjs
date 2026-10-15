import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIVINDADES, lerPericiasDaClasse, lerAtributosDinamicos, nivelDaHabilidade, lerMagiasIniciais,
  contarEscolhasDaClasse, divindadePorNome, concedidoPelaDivindade, normalizar, textoPlano, regraDaRaca, subtipoDe,
  referenciasDeConcedido, outrasDivindades, categoriaGeral, saldoDoEquipamento, modificadoresAbertos, racialAberto,
  formatarTibares, dividirEmMoedas, formatarMoedas
} from '../../scripts/criacao/regras.mjs';

// Rótulos como o sistema os entrega depois de traduzir (CONFIG.T20.pericias).
const ROTULOS = {
  acro: 'Acrobacia', ades: 'Adestramento', atle: 'Atletismo', atua: 'Atuação', cava: 'Cavalgar',
  conh: 'Conhecimento', cura: 'Cura', dipl: 'Diplomacia', enga: 'Enganação', fort: 'Fortitude',
  furt: 'Furtividade', guer: 'Guerra', inic: 'Iniciativa', inti: 'Intimidação', intu: 'Intuição',
  inve: 'Investigação', joga: 'Jogatina', ladi: 'Ladinagem', luta: 'Luta', mist: 'Misticismo',
  nobr: 'Nobreza', alfa: 'Ofício: Alfaiate', alqu: 'Ofício: Alquimista', arme: 'Ofício: Armeiro',
  arte: 'Ofício: Artesão', cozi: 'Ofício: Cozinheiro', enge: 'Ofício: Engenhoqueiro', perc: 'Percepção',
  pilo: 'Pilotagem', pont: 'Pontaria', refl: 'Reflexos', reli: 'Religião', sobr: 'Sobrevivência', vont: 'Vontade'
};
const OFICIOS = ['alfa', 'alqu', 'arme', 'arte', 'cozi', 'enge'];

test('as vinte divindades do Panteão, cada uma com seu domínio', () => {
  assert.equal(DIVINDADES.length, 20);
  assert.equal(new Set(DIVINDADES.map(d => d.dominio)).size, 20);
  assert.equal(divindadePorNome('lin wu')?.nome, 'Lin-Wu');
  assert.equal(divindadePorNome('TANNA-TOH')?.dominio, 'Conhecimento');
  assert.equal(divindadePorNome('Deus Inventado'), null);
});

test('poder concedido compartilhado aparece para cada divindade do subtipo', () => {
  const valkaria = divindadePorNome('Valkaria');
  const thwor = divindadePorNome('Thwor');
  assert.ok(concedidoPelaDivindade('Ambição, Goblinóides', valkaria));
  assert.ok(concedidoPelaDivindade('Ambição, Goblinóides', thwor));
  assert.ok(concedidoPelaDivindade('Goblinóides e Monstros', thwor));
  assert.ok(!concedidoPelaDivindade('Paz', valkaria));
});

test('perícias da classe: fixas, escolha entre duas e quantidade à escolha', () => {
  const r = lerPericiasDaClasse('Luta (For) ou Pontaria (Des), Fortitude (Con), mais 2 a sua escolha entre Adestramento (Car), Atletismo (For), Ofício (Int) e Reflexos (Des).', ROTULOS, OFICIOS);
  assert.deepEqual(r.fixas, [['luta', 'pont'], ['fort']]);
  assert.equal(r.escolha, 2);
  assert.deepEqual(r.opcoes, ['ades', 'atle', ...OFICIOS, 'refl']);
});

test('perícias da classe: hifenização do PDF e vírgula esquecida não atrapalham', () => {
  const buc = lerPericiasDaClasse('Luta (For) ou Pontaria (Des), Re- flexos (Des), mais 4 a sua escolha entre Acrobacia (Des), Investiga- ção (Int)', ROTULOS, OFICIOS);
  assert.deepEqual(buc.fixas, [['luta', 'pont'], ['refl']]);
  assert.deepEqual(buc.opcoes, ['acro', 'inve']);
  const dru = lerPericiasDaClasse('Sobrevivência (Sab) e Vontade (Sab), mais 4 a sua escolha entre Adestramento (Car) Atletismo (For), Cura (Sab)', ROTULOS, OFICIOS);
  assert.deepEqual(dru.fixas, [['sobr'], ['vont']]);
  assert.deepEqual(dru.opcoes, ['ades', 'atle', 'cura']);
});

test('perícias da classe: "e" sem vírgula antes de "mais" e Ofício fixo', () => {
  const pal = lerPericiasDaClasse('Luta (For) e Vontade (Sab) mais 2 a sua escolha entre Cura (Sab)', ROTULOS, OFICIOS);
  assert.deepEqual(pal.fixas, [['luta'], ['vont']]);
  assert.equal(pal.escolha, 2);
  const inv = lerPericiasDaClasse('Ofício (Int) e Vontade (Sab), mais 4 a sua escolha entre Luta (For)', ROTULOS, OFICIOS);
  assert.deepEqual(inv.fixas, [OFICIOS, ['vont']]);
});

test('perícias da classe: texto vazio ou fora do molde não inventa nada', () => {
  assert.equal(lerPericiasDaClasse('', ROTULOS, OFICIOS), null);
  assert.equal(lerPericiasDaClasse('Escolha com o mestre.', ROTULOS, OFICIOS), null);
});

test('contagem das escolhas da classe desconta uma perícia por grupo fixo', () => {
  const regra = { fixas: [['luta', 'pont'], ['fort']], escolha: 2, opcoes: [] };
  assert.equal(contarEscolhasDaClasse(['luta', 'fort', 'atle'], regra), 1);
  // Marcar Luta E Pontaria: uma cobre o grupo, a outra conta como escolha.
  assert.equal(contarEscolhasDaClasse(['luta', 'pont', 'fort'], regra), 1);
  assert.equal(contarEscolhasDaClasse(['atle', 'refl'], null), 2);
});

test('atributos dinâmicos da raça', () => {
  assert.deepEqual(lerAtributosDinamicos('+1 em Três Atributos Diferentes'), { valor: 1, quantos: 3 });
  assert.deepEqual(lerAtributosDinamicos('+1 em dois atributos, exceto Constituição.'), { valor: 1, quantos: 2 });
  assert.deepEqual(lerAtributosDinamicos('+1 em outro atributo (exceto Carisma)'), { valor: 1, quantos: 1 });
  // Alternativas: o assistente cai na distribuição livre.
  assert.equal(lerAtributosDinamicos('+2 em um atributo a sua escolha ou +1 em dois atributos a sua escolha'), null);
  assert.equal(lerAtributosDinamicos(''), null);
});

test('nível da habilidade de classe pela descrição', () => {
  assert.equal(nivelDaHabilidade('<p>No 20&ordm; n&iacute;vel, seu dom&iacute;nio...</p>'), 20);
  assert.equal(nivelDaHabilidade('Você lança magias através de estudo.'), 1);
  assert.equal(nivelDaHabilidade('A partir do 5º nível, você...'), 5);
});

test('magias iniciais lidas da habilidade "Magias (Classe)"', () => {
  assert.deepEqual(
    lerMagiasIniciais('<p>Voc&ecirc; pode lan&ccedil;ar magias arcanas de 1&ordm; c&iacute;rculo. Voc&ecirc; come&ccedil;a com tr&ecirc;s magias de 1&ordm; c&iacute;rculo.</p>'),
    { tipo: 'arc', iniciais: 3 });
  assert.deepEqual(lerMagiasIniciais('magias divinas de 1º círculo ... Você começa com duas magias de 1º círculo.'), { tipo: 'div', iniciais: 2 });
  assert.deepEqual(lerMagiasIniciais('Sem nada'), { tipo: null, iniciais: null });
});

test('normalização tira acento, caixa e a hifenização de quebra', () => {
  assert.equal(normalizar('  Sobre- vivência  '), 'sobrevivencia');
  assert.equal(textoPlano('<b>Voc&ecirc;</b>&nbsp;ganha'), 'Você ganha');
});

test('raça sem atributo à escolha não ganha regra pela descrição padrão do sistema', () => {
  // O Goblin vem com a descrição "+1 em Três Atributos Diferentes" (o texto
  // inicial do campo) e nenhum atributo permitido: o assistente pedia três
  // escolhas que não existem e a etapa nunca ficava completa.
  assert.equal(regraDaRaca([], '+1 em Três Atributos Diferentes'), null);
  assert.equal(regraDaRaca(undefined, '+1 em Três Atributos Diferentes'), null);
  assert.deepEqual(regraDaRaca(['for', 'des'], '+1 em dois atributos'), { valor: 1, quantos: 2 });
});

test('subtipo do poder aponta para a raça ou classe pelo nome inteiro', () => {
  assert.ok(subtipoDe('Elfo', 'Elfo'));
  assert.ok(!subtipoDe('Meio-Elfo', 'Elfo'), 'Elfo não pega os poderes do Meio-Elfo');
  assert.ok(subtipoDe('Sereia/tritão', 'Sereia/Tritão'));
  assert.ok(subtipoDe('Suraggel (Sulfure)', 'Sulfure'));
  assert.ok(!subtipoDe('Suraggel (Sulfure)', 'Aggelus'));
  assert.ok(subtipoDe('Suraggel', 'Aggelus'), 'poder genérico de suraggel vale para os dois');
  assert.ok(subtipoDe('inventor', 'Inventor'));
  assert.ok(!subtipoDe('', 'Elfo'));
});

test('concedido do suplemento escrito com o nome do deus', () => {
  assert.ok(concedidoPelaDivindade('Arsenal', divindadePorNome('Arsenal')));
  assert.ok(concedidoPelaDivindade('Kallyadranoch, Megalokk, Thwor', divindadePorNome('Megalokk')));
  assert.ok(concedidoPelaDivindade('Tanna-toh', divindadePorNome('Tanna-Toh')));
  assert.ok(concedidoPelaDivindade('Goblinóides e Monstros', divindadePorNome('Megalokk')));
});

test('deus menor que cita o domínio de um maior não vira desse maior', () => {
  // "Benthos, o Dragão-Rei dos Mares" fala de mares, mas não é de Oceano;
  // só "Mares" sozinho é.
  const oceano = divindadePorNome('Oceano');
  assert.ok(!concedidoPelaDivindade('Benthos, o Dragão-Rei dos Mares', oceano));
  assert.ok(concedidoPelaDivindade('Mares', oceano));
  assert.ok(!concedidoPelaDivindade('Paz, Mares do Sul', divindadePorNome('Wynna')));
});

test('subtipo do concedido separado em deuses, com epíteto', () => {
  assert.deepEqual(referenciasDeConcedido('Gratissa,   a Deusa da Hospitalidade'),
    [{ nome: 'Gratissa', epiteto: 'a Deusa da Hospitalidade' }]);
  assert.deepEqual(referenciasDeConcedido('Akok, O Deus dos Lobos'), [{ nome: 'Akok', epiteto: 'O Deus dos Lobos' }]);
  assert.deepEqual(referenciasDeConcedido('O Deus do Medo'), [{ nome: 'O Deus do Medo', epiteto: null }]);
  assert.deepEqual(referenciasDeConcedido('Lena, Thyatis').map(r => r.nome), ['Lena', 'Thyatis']);
  assert.deepEqual(referenciasDeConcedido('system.pericias.perc.bonus'), []);
});

test('outras divindades: só os deuses fora do Panteão, com contagem', () => {
  const outras = outrasDivindades([
    'Neruíte, a Deusa do Sono', 'Neruíte, a Deusa do Sono', 'Benthos, o Dragão-Rei dos Mares',
    'Arsenal', 'Caos, Loucura', 'Guerra', 'O Deus do Medo', 'system.pericias.perc.bonus'
  ]);
  assert.deepEqual(outras.map(o => [o.nome, o.poderes]), [['Benthos', 1], ['Neruíte', 2], ['O Deus do Medo', 1]]);
  assert.equal(outras.find(o => o.nome === 'Neruíte').epiteto, 'a Deusa do Sono');
  assert.ok(concedidoPelaDivindade('Neruíte, a Deusa do Sono', { nome: 'Neruíte' }));
});

test('categoria dos poderes gerais pelo subtipo', () => {
  assert.equal(categoriaGeral('Destino'), 'destino');
  assert.equal(categoriaGeral('combate'), 'combate');
  assert.equal(categoriaGeral('Geupo'), 'grupo');
  assert.equal(categoriaGeral('Montaria'), 'geral');
  assert.equal(categoriaGeral(''), 'geral');
});

test('saldo do equipamento: recebido não custa, comprado custa preço × quantidade', () => {
  const itens = [
    { preco: 20, qtd: 1, gratis: true },
    { preco: 15, qtd: 2, gratis: false },
    { preco: 1, gratis: false }
  ];
  assert.deepEqual(saldoDoEquipamento(itens, 20), { inicial: 20, gasto: 31, sobra: -11 });
  assert.deepEqual(saldoDoEquipamento(itens, 20, false), { inicial: 20, gasto: 0, sobra: 20 });
  assert.deepEqual(saldoDoEquipamento([], ''), { inicial: 0, gasto: 0, sobra: 0 });
});

test('raças abertas: os modificadores viram peças, do maior para o menor', () => {
  assert.deepEqual(modificadoresAbertos({ for: 0, des: -1, con: 2, int: 0, sab: 1, car: 0 }), [2, 1, -1]);
  assert.deepEqual(modificadoresAbertos({ for: 0, des: 0, con: 0, int: 0, sab: 0, car: 0 }), []);
});

test('raças abertas: racial soma as peças colocadas e os dinâmicos', () => {
  const chaves = ['for', 'des', 'con', 'int', 'sab', 'car'];
  // Anão aberto: +2 em Força, +1 em Destreza, −1 ainda sem lugar.
  assert.deepEqual(racialAberto(chaves, [2, 1, -1], ['for', 'des', '']),
    { for: 2, des: 1, con: 0, int: 0, sab: 0, car: 0 });
  // Lefou: −1 aberto e os +1 dinâmicos.
  assert.deepEqual(racialAberto(chaves, [-1], ['car'], { for: 1, des: 1, con: 1 }),
    { for: 1, des: 1, con: 1, int: 0, sab: 0, car: -1 });
});

test('Loucura é domínio de Aharadak, além de Tormenta', () => {
  const aharadak = divindadePorNome('Aharadak');
  assert.ok(concedidoPelaDivindade('Tormenta', aharadak));
  assert.ok(concedidoPelaDivindade('Loucura', aharadak));
  // Poder compartilhado aparece para os dois deuses.
  assert.ok(concedidoPelaDivindade('Caos, Loucura', aharadak));
  assert.ok(concedidoPelaDivindade('Caos, Loucura', divindadePorNome('Nimb')));
  // E "Loucura" deixa de virar uma divindade menor.
  assert.deepEqual(outrasDivindades(['Loucura', 'Caos, Loucura']), []);
});

test('dinheiro sem erro de ponto flutuante', () => {
  // Regressão: T$ 17 − (10 + 0,2) aparecia como "T$ 6.800000000000001".
  const itens = [{ preco: 10, gratis: false }, { preco: 0.2, gratis: false }];
  assert.deepEqual(saldoDoEquipamento(itens, 17), { inicial: 17, gasto: 10.2, sobra: 6.8 });
  assert.equal(saldoDoEquipamento([{ preco: 0.1, qtd: 3, gratis: false }], 1).sobra, 0.7);
  assert.equal(formatarTibares(6.800000000000001), '6,8');
  assert.equal(formatarTibares(1250), '1.250');
  assert.equal(formatarTibares(0.2), '0,2');
});

test('T$ quebrado vira tibares e tibares de cobre na ficha', () => {
  assert.deepEqual(dividirEmMoedas(6.8), { tp: 6, tc: 8 });
  assert.deepEqual(dividirEmMoedas(50), { tp: 50, tc: 0 });
  assert.deepEqual(dividirEmMoedas(0.2), { tp: 0, tc: 2 });
  assert.deepEqual(dividirEmMoedas(-3), { tp: 0, tc: 0 });
});

test('dinheiro mostrado em moedas: tibares e tibares de cobre', () => {
  assert.equal(formatarMoedas(6.8), 'T$ 6 e 8 TC');
  assert.equal(formatarMoedas(50), 'T$ 50');
  assert.equal(formatarMoedas(0.2), '2 TC');
  assert.equal(formatarMoedas(0), 'T$ 0');
  assert.equal(formatarMoedas(1250.5), 'T$ 1.250 e 5 TC');
  assert.equal(formatarMoedas(-3.1), '−T$ 3 e 1 TC');
});
