import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = { applications: { api: { DialogV2: class {} } } };
const { analisarDano, montarEntradas, formulaDaEntrada } =
  await import('../../scripts/automacoes/seta-infalivel.mjs');

const dado = (number, faces, flavor = 'essencia') => ({
  number, faces, results: Array.from({ length: number }, () => ({ result: 1, active: true })),
  options: { flavor }
});
const numero = (total, flavor = 'essencia') => ({ total, options: { flavor } });
const operador = (operator) => ({ operator });

test('dado adicional permanece bônus e não vira um novo projétil', () => {
  const message = {
    rolls: [{
      options: { type: 'damage' },
      terms: [dado(2, 4), operador('+'), numero(2), operador('+'), dado(1, 6)]
    }]
  };
  const analise = analisarDano(message);
  const def = { distribuicao: { porProjetil: 1, nomeProjetil: 'Seta' } };
  const resultado = montarEntradas(analise, 2, def);

  assert.equal(resultado.setas.length, 2);
  assert.equal(resultado.bonus.length, 1);
  assert.deepEqual(resultado.bonus[0].dados, { quantidade: 1, faces: 6, sinal: 1 });
});

test('fórmulas distribuídas preservam dado e fixo por projétil', () => {
  const partes = formulaDaEntrada({
    dados: { quantidade: 1, faces: 4, sinal: 1 },
    fixo: 1,
    tipo: 'essencia'
  });
  assert.deepEqual(partes, ['1d4[essencia]', '1[essencia]']);
});
