import test from 'node:test';
import assert from 'node:assert/strict';
import { GP_EFEITOS, GP_SEQUENCIAL } from '../../scripts/automacoes/golpe-pessoal/catalogo.mjs';

/**
 * O efeito Sequencial calcula o dado do passo atual a partir do contador do
 * item. Depois do split das automações esse cálculo precisa viver no domínio
 * do Golpe Pessoal — se voltar a depender de algo só existente no motor, a
 * sincronização do golpe quebra em runtime com ReferenceError.
 */
test('Sequencial calcula o passo sem depender do motor', () => {
  const sequencial = GP_EFEITOS.find((e) => e.id === 'sequencial');
  assert.ok(sequencial, 'efeito Sequencial ausente do catálogo');
  assert.ok(typeof sequencial.changes === 'function');

  const item = (contador) => ({
    getFlag: (_m, chave) => (chave === 'contador' ? contador : undefined)
  });

  // Sem acertos ainda: primeiro passo da progressão
  const inicial = sequencial.changes({}, item(0));
  assert.equal(inicial.length, 1);
  assert.equal(inicial[0].key, 'dano');
  assert.equal(inicial[0].value, GP_SEQUENCIAL[0]);

  // Cada acerto avança um passo
  assert.equal(sequencial.changes({}, item(2))[0].value, GP_SEQUENCIAL[2]);

  // Acima do último passo, satura no máximo em vez de devolver undefined
  const alem = sequencial.changes({}, item(GP_SEQUENCIAL.length + 5));
  assert.equal(alem[0].value, GP_SEQUENCIAL.at(-1));
});
