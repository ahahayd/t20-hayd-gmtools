import test from 'node:test';
import assert from 'node:assert/strict';
import {
  distribuir, fecharDetalhes, fontePorTermo, linhasDaTabela, reindexar, rotularExtras, termosComSinal, textoDaFonte,
  zerosRemoviveis
} from '../scripts/fontes.mjs';

// 1d20 + 8 + 6 - 1 + 0
const termosDoTeste = () => termosComSinal([
  { expressao: '1d20', total: 14, resultados: [14], dado: true },
  { operador: '+' }, { expressao: '8', total: 8 },
  { operador: '+' }, { expressao: '6', total: 6 },
  { operador: '-' }, { expressao: '1', total: 1 },
  { operador: '+' }, { expressao: '0', total: 0 }
]);

test('os operadores viram o sinal do termo seguinte', () => {
  const termos = termosDoTeste();
  assert.deepEqual(termos.map((t) => t.valor), [14, 8, 6, -1, 0]);
  assert.deepEqual(termos.map((t) => t.indice), [0, 2, 4, 6, 8]);
});

test('"+ -1" (parcela negativa) também fica negativo', () => {
  const termos = termosComSinal([{ expressao: '5', total: 5 }, { operador: '+' }, { operador: '-' }, { expressao: '1', total: 1 }]);
  assert.deepEqual(termos.map((t) => t.valor), [5, -1]);
});

test('cada parcela pega os termos seguintes, e a conta precisa fechar', () => {
  const parcelas = [{ fonte: 'Dado', termos: 1 }, { fonte: 'Perícia', termos: 1 }, { fonte: 'Poder', termos: 2 }, { fonte: 'Bônus', termos: 1 }];
  const faixas = distribuir(parcelas, 5);
  assert.deepEqual(faixas.map((f) => [f.ini, f.fim]), [[0, 1], [1, 2], [2, 4], [4, 5]]);
  assert.equal(distribuir(parcelas, 6), null);
  assert.equal(distribuir(parcelas, 4), null);
});

test('a tabela some com a parcela que somou zero sem dado', () => {
  const termos = termosDoTeste();
  const faixas = distribuir([
    { fonte: 'Dado', termos: 1 },
    { fonte: 'Perícia Luta', termos: 1, detalhes: [{ fonte: 'Metade do nível', valor: 3 }, { fonte: 'Força', valor: 5 }] },
    { fonte: 'Engenhosidade', termos: 1 },
    { fonte: 'Fadiga', termos: 1 },
    { fonte: 'Bônus da rolagem', termos: 1 }
  ], termos.length);
  const linhas = linhasDaTabela(faixas, termos);
  assert.deepEqual(linhas.map((l) => [l.fonte, l.valor]), [['Dado', 14], ['Perícia Luta', 8], ['Engenhosidade', 6], ['Fadiga', -1]]);
  assert.deepEqual(linhas[0].resultados, [14]);
  assert.equal(linhas[1].detalhes.length, 2);
});

test('sem faixas, cada termo vira uma linha sem origem', () => {
  const linhas = linhasDaTabela(null, termosDoTeste(), { semOrigem: 'Sem origem' });
  assert.equal(linhas.length, 5);
  assert.ok(linhas.every((l) => l.semOrigem && l.fonte === 'Sem origem'));
});

test('detalhes que não fecham ganham a linha da diferença', () => {
  const d = fecharDetalhes([{ fonte: 'Metade do nível', valor: 2 }, { fonte: 'Força', valor: 3 }, { fonte: 'Zero', valor: 0 }], 7, 'Sem origem');
  assert.deepEqual(d.map((x) => [x.fonte, x.valor]), [['Metade do nível', 2], ['Força', 3], ['Sem origem', 2]]);
  assert.equal(fecharDetalhes([{ fonte: 'A', valor: 5 }], 5, 'x').length, 1);
});

test('tooltip da prévia: parcela e as contas dela', () => {
  const faixa = { fonte: 'Perícia Luta', detalhes: [{ fonte: 'Metade do nível', valor: 3 }, { fonte: 'Força', valor: 5 }, { fonte: 'Armadura', valor: -1 }] };
  assert.equal(textoDaFonte(faixa, 7), 'Perícia Luta: Metade do nível 3 + Força 5 − Armadura 1');
  assert.equal(textoDaFonte({ fonte: 'Engenhosidade' }, 6), 'Engenhosidade');
});

test('fontePorTermo indexa pela posição original do termo', () => {
  const termos = termosDoTeste();
  const faixas = distribuir([{ fonte: 'A', termos: 2 }, { fonte: 'B', termos: 3 }], 5);
  const mapa = fontePorTermo(faixas, termos);
  assert.equal(mapa.get(0).fonte, 'A');
  assert.equal(mapa.get(2).fonte, 'A');
  assert.equal(mapa.get(4).fonte, 'B');
  assert.equal(mapa.get(8).fonte, 'B');
});

test('parcelas extras: efeito pelo valor, campo da janela por último', () => {
  const r = rotularExtras(['6', '2', '1d6'], [{ fonte: 'Engenhosidade', valor: 6 }, { fonte: 'Fúria', valor: '1d6' }],
    { bonusJanela: '1d6', rotuloJanela: 'Janela', rotuloEfeito: 'Efeito' });
  assert.deepEqual(r.map((x) => x.fonte), ['Engenhosidade', 'Efeito', 'Janela']);
  assert.ok(r[1].semOrigem);
});

test('cada efeito dá nome a uma parcela só', () => {
  const r = rotularExtras(['2', '2'], [{ fonte: 'Bênção', valor: 2 }], { rotuloJanela: 'J', rotuloEfeito: 'E' });
  assert.deepEqual(r.map((x) => x.fonte), ['Bênção', 'E']);
});

test('zeros: sai o 0 e o operador antes dele, nunca o primeiro termo', () => {
  // 1d20 + 13 + 0 + 4 + 0
  const termos = [
    { expressao: '1d20', total: 12, dado: true }, { operador: '+' },
    { expressao: '13', total: 13, numerico: true }, { operador: '+' },
    { expressao: '0', total: 0, numerico: true }, { operador: '+' },
    { expressao: '4', total: 4, numerico: true }, { operador: '+' },
    { expressao: '0', total: 0, numerico: true }
  ];
  assert.deepEqual(zerosRemoviveis(termos), [3, 4, 7, 8]);
  // "0" sozinho (Escolher 0) fica: é o resultado do dado.
  assert.deepEqual(zerosRemoviveis([{ expressao: '0', total: 0, numerico: true }, { operador: '+' }, { expressao: '5', total: 5, numerico: true }]), []);
  // Dado que rolou 0 não é constante: fica.
  assert.deepEqual(zerosRemoviveis([{ expressao: '1d4', total: 3, dado: true }, { operador: '+' }, { expressao: '(1d1-1)', total: 0 }]), []);
});

test('zeros: as faixas de fonte andam junto', () => {
  // termos sem operador: d20, 13, 0, 4, 0 → apagados os de posição 2 e 4
  const faixas = [
    { fonte: 'Dado', ini: 0, fim: 1 }, { fonte: 'Perícia', ini: 1, fim: 2 }, { fonte: 'Arma', ini: 2, fim: 3 },
    { fonte: 'Poder', ini: 3, fim: 4 }, { fonte: 'Bônus', ini: 4, fim: 5 }
  ];
  const novas = reindexar(faixas, [2, 4]);
  assert.deepEqual(novas.map((f) => [f.fonte, f.ini, f.fim]),
    [['Dado', 0, 1], ['Perícia', 1, 2], ['Arma', 2, 2], ['Poder', 2, 3], ['Bônus', 3, 3]]);
});

test('efeito com tipo de dano entre colchetes casa com a parte sem ele', () => {
  // Arma Mágica: "2d6[fogo]" no efeito vira "2d6" (tipo fogo) na rolagem
  const r = rotularExtras(['1', '2d6'],
    [{ fonte: 'Arma Mágica', valor: 1 }, { fonte: 'Arma Mágica', valor: '2d6[fogo]' }],
    { rotuloJanela: 'J', rotuloEfeito: 'E' });
  assert.deepEqual(r.map((x) => x.fonte), ['Arma Mágica', 'Arma Mágica']);
  assert.ok(!r.some((x) => x.semOrigem));
});
