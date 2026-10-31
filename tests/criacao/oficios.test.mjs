import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chaveDoOficio, ehOficioNovo, nomeOficioNovo, rotuloPericia, semPrefixoOficio } from '../../scripts/criacao/oficios.mjs';

const conhecidos = [['alqu', 'Ofício: Alquimista'], ['ofi1', 'Ofício: Ferreiro']];

test('nome de ofício do sistema ou da ficha vira a chave existente', () => {
  assert.equal(chaveDoOficio('alquimista', conhecidos), 'alqu');
  assert.equal(chaveDoOficio('Ofício: ferreiro', conhecidos), 'ofi1');
});

test('nome novo vira chave de ofício novo, com espaços arrumados', () => {
  const k = chaveDoOficio('  escriba   real ', conhecidos);
  assert.ok(ehOficioNovo(k));
  assert.equal(nomeOficioNovo(k), 'Escriba real');
  assert.equal(rotuloPericia(k, {}), 'Ofício: Escriba real');
});

test('texto vazio não vira ofício', () => {
  assert.equal(chaveDoOficio('   ', conhecidos), null);
  assert.equal(chaveDoOficio('Ofício:', conhecidos), null);
});

test('prefixo "Ofício" sai do rótulo, com ou sem parênteses', () => {
  assert.equal(semPrefixoOficio('Ofício: Cozinheiro'), 'Cozinheiro');
  assert.equal(semPrefixoOficio('Ofício (escriba)'), 'escriba');
});
