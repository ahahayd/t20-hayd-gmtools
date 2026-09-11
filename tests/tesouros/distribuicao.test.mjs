import test from 'node:test';
import assert from 'node:assert/strict';
import { materializarItem } from '../../scripts/tesouros/distribuicao.mjs';

test('riqueza materializada ocupa os espaços sorteados no inventário', async () => {
  const dados = await materializarItem({
    tipo: 'item',
    nome: 'Baú de prata',
    preco: 500,
    espacos: 5
  });

  assert.equal(dados.type, 'tesouro');
  assert.equal(dados.system.preco, 500);
  assert.equal(dados.system.espacos, 5);
  assert.equal(dados.system.peso, undefined);
});
