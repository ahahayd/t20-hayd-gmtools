import test from 'node:test';
import assert from 'node:assert/strict';
import {
  marcaAplicacao,
  normalizarRegistroCondicoes,
  aplicacaoExpirada
} from '../../scripts/automacoes/combinacoes/duracao.mjs';

test('aplicação permanece no próximo turno e expira somente ao sair dele', () => {
  const marca = marcaAplicacao('combate-1', 3, { turno: 2, combatente: 'lutador' });
  assert.equal(aplicacaoExpirada(marca, 'combate-1', 4, {
    rodadaAnterior: 3, turnoAnterior: 5, combatenteAnterior: 'inimigo'
  }), false);
  // Entrar no turno do lutador não expira: o anterior ainda era outro.
  assert.equal(aplicacaoExpirada(marca, 'combate-1', 4, {
    rodadaAnterior: 4, turnoAnterior: 1, combatenteAnterior: 'inimigo'
  }), false);
  // Ao avançar para o próximo combatente, o turno anterior era o do lutador.
  assert.equal(aplicacaoExpirada(marca, 'combate-1', 4, {
    rodadaAnterior: 4, turnoAnterior: 2, combatenteAnterior: 'lutador'
  }), true);
  assert.equal(aplicacaoExpirada(marca, 'combate-2', 4, {
    rodadaAnterior: 4, turnoAnterior: 2, combatenteAnterior: 'lutador'
  }), false);
});

test('aplicação feita antes do turno expira ao terminar esse turno na mesma rodada', () => {
  const marca = marcaAplicacao('combate-1', 3, { turno: 1, combatente: 'lutador' });
  assert.equal(aplicacaoExpirada(marca, 'combate-1', 3, {
    rodadaAnterior: 3, turnoAnterior: 4, combatenteAnterior: 'lutador'
  }), true);
});

test('registro antigo de condições continua legível e não é removido por engano', () => {
  const antigo = ['lento', 'vulneravel'];
  assert.deepEqual(normalizarRegistroCondicoes(antigo).condicoes, antigo);
  assert.equal(aplicacaoExpirada(antigo, 'combate-1', 9), false);
});
