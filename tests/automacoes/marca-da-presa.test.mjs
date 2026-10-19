import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROGRESSAO_MARCA,
  TABELA_CACADOR,
  nivelDaMarca,
  aumentosDisponiveis,
  normalizarConfig,
  normalizarMarca,
  subirFaces,
  subirPassosDeDano,
  multiplicarDados,
  dadoDaMarca,
  formulaDaMarca,
  aplicarPassosNasPartes,
  indiceDaMarca
} from '../../scripts/automacoes/marca-da-presa.mjs';
import { AUTOMACOES } from '../../scripts/automacoes/catalogo.mjs';

test('progressão da marca é a pedida, com teto em 4d12', () => {
  assert.deepEqual(PROGRESSAO_MARCA,
    ['1d4', '1d6', '1d8', '1d10', '1d12', '3d6', '4d6', '4d8', '4d10', '4d12']);
  assert.equal(subirPassosDeDano('1d12', 1), '3d6');
  assert.equal(subirPassosDeDano('4d10', 5), '4d12');
});

test('passos de arma seguem o sistema, inclusive as equivalências', () => {
  assert.equal(subirPassosDeDano('1d8', 2), '1d12');
  // 2d6 equivale a 1d12 para subir passos
  assert.equal(subirPassosDeDano('2d6', 1), '3d6');
  // dados que só existem nas outras linhas do sistema (tabela do Caçador)
  assert.equal(subirPassosDeDano('2d8', 1), '3d8');
  assert.equal(subirPassosDeDano('2d10', 1), '3d10');
  assert.equal(subirPassosDeDano('1d8', 0), '1d8');
});

test('outros dados só trocam de faces, até d12', () => {
  assert.equal(subirFaces('1d4', 2), '1d8');
  assert.equal(subirFaces('2d6', 1), '2d8');
  assert.equal(subirFaces('1d12', 2), '1d12');
  assert.equal(subirFaces('1d20', 2), '1d20');
});

test('nível da marca soma as classes que a concedem', () => {
  const { nivel } = nivelDaMarca([
    { nome: 'Caçador', nivel: 6 }, { nome: 'Guerreiro', nivel: 3 }, { nome: 'Seteiro', nivel: 3 }
  ]);
  assert.equal(nivel, 9);
  assert.equal(nivelDaMarca([{ nome: 'Arcanista', nivel: 5 }]).nivel, 0);
});

test('aumentos seguem a tabela: 5º, 9º, 13º e 17º níveis', () => {
  assert.equal(aumentosDisponiveis(1), 0);
  assert.equal(aumentosDisponiveis(4), 0);
  assert.equal(aumentosDisponiveis(5), 1);
  assert.equal(aumentosDisponiveis(9), 2);
  assert.equal(aumentosDisponiveis(13), 3);
  assert.equal(aumentosDisponiveis(20), 4);
  // Nível desconhecido conta como 1º
  assert.equal(aumentosDisponiveis(0), 0);
});

test('com a configuração padrão o dado é a tabela da classe', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((aumentos) => dadoDaMarca({ aumentos })),
    TABELA_CACADOR.map((l) => l.dado));
});

test('base e passos da configuração deslocam a tabela inteira', () => {
  // Base 1d6 = um passo acima do padrão
  assert.equal(dadoDaMarca({ aumentos: 0, config: { base: '1d6' } }), '1d6');
  assert.equal(dadoDaMarca({ aumentos: 2, config: { base: '1d6' } }), '3d6');
  // Passos extras somam com a base
  assert.equal(dadoDaMarca({ aumentos: 1, config: { base: '1d6', passos: 1 } }), '1d12');
  assert.equal(dadoDaMarca({ aumentos: 3, config: { passos: 1 } }), '3d8');
});

test('configuração e registro inválidos viram valores seguros', () => {
  assert.deepEqual(normalizarConfig({ base: '2d6', passos: -3, nivel: 'x' }),
    { base: '1d4', passos: 0, nivel: 0 });
  assert.equal(normalizarMarca(null), null);
  assert.deepEqual(normalizarMarca({ item: 'a', aumentos: '2', dobrado: 1 }),
    { item: 'a', aumentos: 2, dobrado: true });
});

test('fórmula da marca: passos, depois dobro, depois crítico', () => {
  assert.equal(formulaDaMarca('1d4'), '1d4');
  assert.equal(formulaDaMarca('1d4', { dobrado: true }), '2d4');
  assert.equal(formulaDaMarca('1d4', { passos: 2, dobrado: true }), '2d8');
  assert.equal(formulaDaMarca('1d8', { dobrado: true, multiplicador: 3 }), '6d8');
  assert.equal(formulaDaMarca('1d12', { passos: 2 }), '4d6');
  assert.equal(multiplicarDados('2d10', 2), '4d10');
});

test('Primeiro Sangue sobe arma, marca e efeitos, mas não perda de PV', () => {
  const parts = [
    ['1d8', 'perfuracao'], ['@des', ''], ['1d6', 'fogo'], ['1d4', 'perfuracao'], ['1d6', 'perda']
  ];
  const indice = indiceDaMarca(parts, '1d4');
  assert.equal(indice, 3);
  const novas = aplicarPassosNasPartes(parts, {
    passos: 2, ehArma: true, indiceMarca: indice,
    formulaMarca: formulaDaMarca('1d4', { passos: 2 })
  });
  assert.deepEqual(novas.map((p) => p[0]), ['1d12', '@des', '1d10', '1d8', '1d6']);
  // A lista original não muda
  assert.equal(parts[0][0], '1d8');
});

test('sem passos só a marca é reescrita (crítico do Tiro de Abate)', () => {
  const parts = [['1d8', 'perfuracao'], ['1d8', 'perfuracao']];
  const novas = aplicarPassosNasPartes(parts, { indiceMarca: 1, formulaMarca: '3d8' });
  assert.deepEqual(novas.map((p) => p[0]), ['1d8', '3d8']);
});

test('dano de arma com mais de um termo sobe todos os dados', () => {
  const novas = aplicarPassosNasPartes([['2d6', 'corte'], ['1d4+1', 'fogo']], { passos: 1, ehArma: true });
  assert.deepEqual(novas.map((p) => p[0]), ['3d6', '1d6+1']);
  // Magia: a primeira parte só troca de faces
  const magia = aplicarPassosNasPartes([['2d6', 'fogo']], { passos: 2 });
  assert.equal(magia[0][0], '2d10');
});

test('catálogo: as quatro automações do Caçador existem e oferecem apagar os efeitos originais', () => {
  for (const id of ['marca-da-presa', 'inimigo-de', 'tiro-de-abate', 'primeiro-sangue']) {
    const def = AUTOMACOES[id];
    assert.ok(def, `${id} ausente do catálogo`);
    assert.equal(def.categoria, 'cacador');
    assert.equal(def.apagarEfeitos, true, `${id} sem apagarEfeitos`);
  }
  assert.equal(AUTOMACOES['primeiro-sangue'].usoSuspenso.passosDano, 2);
  assert.equal(AUTOMACOES['tiro-de-abate'].usoSuspenso.multiplicaMarca, true);
  const tiro = AUTOMACOES['tiro-de-abate'].usoSuspenso.changes();
  assert.deepEqual(tiro.map((c) => [c.key, c.value]), [['ataque', '2'], ['criticoM', '-2']]);
});

/*
 * Tabela 3-2: Dano de Armas (Livro Básico), colunas Normal → +1 → +2 → +3.
 * Passando de +3, segue na linha seguinte (1d6 com 4 passos = 3d6).
 */
const TABELA_3_2 = [
  ['1d3', '1d4', '1d6', '1d8'],
  ['1d4', '1d6', '1d8', '1d10'],
  ['1d6', '1d8', '1d10', '1d12'],
  ['1d8', '1d10', '1d12', '3d6'],
  ['1d10', '1d12', '3d6', '4d6'],
  ['1d12', '3d6', '4d6', '4d8'],
  ['2d8', '3d8', '4d8', '4d10'],
  ['2d10', '3d10', '4d10', '4d12']
];

test('passos seguem a Tabela 3-2 linha a linha', () => {
  for (const [normal, ...acima] of TABELA_3_2) {
    acima.forEach((esperado, i) => {
      assert.equal(subirPassosDeDano(normal, i + 1), esperado, `${normal} +${i + 1}`);
    });
  }
  // Equivalências da coluna Normal
  assert.equal(subirPassosDeDano('2d4', 1), '1d10');
  assert.equal(subirPassosDeDano('2d6', 1), '3d6');
  assert.equal(subirPassosDeDano('3d4', 3), '4d8');
});

test('além de +3 passos a progressão continua na linha seguinte', () => {
  assert.equal(subirPassosDeDano('1d6', 4), '3d6');
  assert.equal(subirPassosDeDano('1d8', 4), '4d6');
  assert.equal(subirPassosDeDano('1d8', 5), '4d8');
  assert.equal(subirPassosDeDano('2d8', 4), '4d12');
  assert.equal(subirPassosDeDano('1d4', 20), '4d12');
});

test('cada degrau da marca do Caçador sobe pela Tabela 3-2', () => {
  // [degrau da classe, +1, +2, +3]
  const esperado = {
    '1d4': ['1d6', '1d8', '1d10'],
    '1d8': ['1d10', '1d12', '3d6'],
    '1d12': ['3d6', '4d6', '4d8'],
    '2d8': ['3d8', '4d8', '4d10'],
    '2d10': ['3d10', '4d10', '4d12']
  };
  TABELA_CACADOR.forEach(({ dado }, aumentos) => {
    esperado[dado].forEach((alvo, i) => {
      assert.equal(dadoDaMarca({ aumentos, config: { passos: i + 1 } }), alvo, `${dado} +${i + 1}`);
    });
  });
});
