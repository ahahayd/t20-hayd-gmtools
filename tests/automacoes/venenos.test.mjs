import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  normalizarDano,
  danoValido,
  normalizarConfig,
  configValida,
  resultadoVazio,
  formulaDePerda,
  formulaAcumulada,
  listarVenenos,
  avancarRodada,
  jaRolou,
  registrarTurno,
  desfazerTurnos,
  imuneAVeneno
} from '../../scripts/automacoes/venenos/regras.mjs';
import { AUTOMACOES } from '../../scripts/automacoes/catalogo.mjs';

const raiz = new URL('../../', import.meta.url);
const hooks = await readFile(new URL('scripts/automacoes/hooks.mjs', raiz), 'utf8');
const idioma = JSON.parse(await readFile(new URL('lang/pt-BR.json', raiz), 'utf8'));
const dominio = await readFile(new URL('scripts/automacoes/venenos/index.mjs', raiz), 'utf8');

test('o dano aceita o que o jogador digita, sem o tipo e sem espaços', () => {
  assert.equal(normalizarDano(' 1D12 [perda] + 2 '), '1d12+2');
  assert.ok(danoValido('1d12[perda]'));
  assert.ok(danoValido('2d6-1'));
  assert.ok(danoValido('3'));
});

test('fórmula que perderia o tipo em parte dos termos é recusada', () => {
  for (const dano of ['', '2*1d6', '(1d6+1)', '@for', 'd6', '1d6+']) {
    assert.equal(danoValido(dano), false, dano);
  }
});

test('todo termo do dano vira perda', () => {
  assert.equal(formulaDePerda('1d12'), '1d12[perda]');
  assert.equal(formulaDePerda('1d12+2-1d4'), '1d12[perda]+2[perda]-1d4[perda]');
});

test('o dano acumulado soma todos os venenos numa fórmula só', () => {
  assert.equal(
    formulaAcumulada([{ dano: '1d12' }, { dano: '2d4+1' }]),
    '1d12[perda]+2d4[perda]+1[perda]'
  );
});

test('um resultado fica em branco ou completo, e ao menos um aplica veneno', () => {
  const completo = { dano: '1d6', rodadas: 2 };
  const vazio = { dano: '', rodadas: 0 };
  assert.ok(configValida({ sucesso: completo, falha: completo }));
  assert.ok(configValida({ sucesso: vazio, falha: completo }));
  assert.equal(configValida({ sucesso: vazio, falha: vazio }), false);
  assert.equal(configValida({ sucesso: { dano: '1d6', rodadas: 0 }, falha: completo }), false);
  assert.equal(configValida({ sucesso: { dano: '', rodadas: 3 }, falha: completo }), false);
  assert.equal(configValida({ sucesso: { dano: 'x', rodadas: 3 }, falha: completo }), false);
  assert.ok(resultadoVazio(vazio));
});

test('a configuração normalizada nunca deixa campo indefinido', () => {
  assert.deepEqual(normalizarConfig(undefined), {
    sucesso: { dano: '', rodadas: 0 },
    falha: { dano: '', rodadas: 0 },
    ignoraImunidade: false
  });
  assert.deepEqual(
    normalizarConfig({ falha: { dano: '1D8 [perda]', rodadas: '3' }, ignoraImunidade: 1 }).falha,
    { dano: '1d8', rodadas: 3 }
  );
});

test('venenos contam as rodadas de forma independente', () => {
  const lista = [
    { id: 'a', dano: '1d6', rodadas: 1 },
    { id: 'b', dano: '1d6', rodadas: 3 }
  ];
  const { restantes, encerrados } = avancarRodada(lista);
  assert.deepEqual(restantes.map((v) => [v.id, v.rodadas]), [['b', 2]]);
  assert.deepEqual(encerrados.map((v) => v.id), ['a']);
  assert.equal(lista[1].rodadas, 3, 'a lista recebida fica intacta');
});

test('um veneno de 3 rodadas causa dano em 3 turnos, sem reiniciar o outro', () => {
  let ativos = [{ id: 'a', dano: '1d6', rodadas: 3 }];
  const danos = [];
  for (let turno = 1; turno <= 4; turno += 1) {
    if (turno === 2) ativos.push({ id: 'b', dano: '1d4', rodadas: 3 });
    if (!ativos.length) { danos.push(0); continue; }
    danos.push(ativos.length);
    ativos = avancarRodada(ativos).restantes;
  }
  assert.deepEqual(danos, [1, 2, 2, 1]);
  assert.equal(ativos.length, 0, 'a condição pode sair: não sobrou veneno');
});

test('a lista segue a ordem de aplicação', () => {
  const lista = listarVenenos({
    b: { id: 'b', criado: 2 }, a: { id: 'a', criado: 1 }, ruim: null
  });
  assert.deepEqual(lista.map((v) => v.id), ['a', 'b']);
  assert.deepEqual(listarVenenos(undefined), []);
});

/** Roda um turno de veneno, como o início do turno faz. */
function rolarTurno(historico, ativos, agora) {
  const resultado = avancarRodada(ativos);
  return { historico: registrarTurno(historico, agora, resultado), ativos: resultado.restantes };
}

const veneno = (id, rodadas) => ({ id, dano: '1d6', rodadas });
const posicao = (rodada, turno) => ({ combate: 'c1', rodada, turno });
const rodadasDe = (lista) => Object.fromEntries(lista.map((v) => [v.id, v.rodadas]));

test('cada rodada do combate rola uma vez só', () => {
  const { historico } = rolarTurno([], [veneno('a', 3)], posicao(2, 1));
  assert.equal(jaRolou(historico, posicao(2, 1)), true);
  assert.equal(jaRolou(historico, posicao(2, 0)), true, 'mesma rodada, outro turno');
  assert.equal(jaRolou(historico, posicao(3, 1)), false);
  assert.equal(jaRolou(historico, { combate: 'c2', rodada: 2, turno: 1 }), false);
  assert.equal(jaRolou(undefined, posicao(1, 0)), false);
});

test('voltar para antes da rolagem devolve a rodada e libera rolar de novo', () => {
  const { historico, ativos } = rolarTurno([], [veneno('a', 3)], posicao(2, 1));
  const volta = desfazerTurnos(historico, posicao(2, 0), ativos);
  assert.deepEqual(rodadasDe(volta.mudados), { a: 3 });
  assert.deepEqual(volta.historico, []);
  assert.equal(jaRolou(volta.historico, posicao(2, 1)), false);
});

test('voltar até o próprio turno ou para depois dele não desfaz nada', () => {
  const { historico, ativos } = rolarTurno([], [veneno('a', 3)], posicao(2, 1));
  for (const destino of [posicao(2, 1), posicao(2, 2), posicao(3, 0)]) {
    const volta = desfazerTurnos(historico, destino, ativos);
    assert.deepEqual(volta.mudados, []);
    assert.equal(volta.historico.length, 1);
  }
});

test('veneno que acabou na rolagem desfeita volta', () => {
  const { historico, ativos } = rolarTurno([], [veneno('a', 1)], posicao(1, 0));
  assert.deepEqual(ativos, []);
  assert.deepEqual(rodadasDe(desfazerTurnos(historico, posicao(0, 0), ativos).mudados), { a: 1 });
});

test('voltar várias rodadas soma as devoluções na ordem certa', () => {
  let estado = { historico: [], ativos: [veneno('a', 2), veneno('b', 3)] };
  estado = rolarTurno(estado.historico, estado.ativos, posicao(1, 0));
  estado = rolarTurno(estado.historico, estado.ativos, posicao(2, 0));
  assert.deepEqual(rodadasDe(estado.ativos), { b: 1 });
  const volta = desfazerTurnos(estado.historico, posicao(1, 0), estado.ativos);
  assert.deepEqual(rodadasDe(volta.mudados), { a: 1, b: 2 }, 'só a rodada 2 foi desfeita');
  const tudo = desfazerTurnos(estado.historico, { ...posicao(0, 0) }, estado.ativos);
  assert.deepEqual(rodadasDe(tudo.mudados), { a: 2, b: 3 });
});

test('veneno aplicado depois da rolagem fica como está', () => {
  const { historico, ativos } = rolarTurno([], [veneno('a', 3)], posicao(2, 1));
  const volta = desfazerTurnos(historico, posicao(1, 0), [...ativos, veneno('novo', 3)]);
  assert.deepEqual(rodadasDe(volta.mudados), { a: 3 });
});

test('veneno encerrado à mão depois da rolagem não volta', () => {
  const { historico } = rolarTurno([], [veneno('a', 3)], posicao(2, 1));
  assert.deepEqual(desfazerTurnos(historico, posicao(1, 0), []).mudados, []);
});

test('o histórico guarda só o combate atual e tem limite', () => {
  let historico = [{ combate: 'velho', rodada: 9, turno: 0, contados: [], encerrados: [] }];
  for (let rodada = 1; rodada <= 40; rodada += 1) {
    historico = registrarTurno(historico, posicao(rodada, 0), { restantes: [], encerrados: [] });
  }
  assert.equal(historico.length, 30);
  assert.ok(historico.every((r) => r.combate === 'c1'));
  assert.equal(historico.at(-1).rodada, 40);
});

test('imunidade vale pela condição e pela categoria do sistema', () => {
  assert.ok(imuneAVeneno(new Set(['envenenado'])));
  assert.ok(imuneAVeneno(['veneno']));
  assert.equal(imuneAVeneno(new Set(['medo'])), false);
  assert.equal(imuneAVeneno(undefined), false);
});

test('a automação é só para consumíveis e fica na categoria do diário', () => {
  const def = AUTOMACOES['veneno-dano-continuo'];
  assert.deepEqual(def.tipos, ['consumivel']);
  assert.equal(def.categoria, 'consumivel');
  assert.ok(idioma.T20HaydGMTools.DiarioCatConsumivel);
});

test('todos os textos do domínio existem no idioma', () => {
  const chaves = [...dominio.matchAll(/\bt\('(\w+)'/g)].map((m) => m[1]);
  assert.ok(chaves.length > 10);
  for (const chave of chaves) assert.ok(idioma.T20HaydGMTools[chave], `sem tradução: ${chave}`);
});

test('o veneno roda no avanço do combate e na remoção da condição', () => {
  assert.match(hooks, /s\.venenos\.aoMudarTurno\(combate,/);
  assert.match(hooks, /Hooks\.on\('deleteActiveEffect'[\s\S]*s\.venenos\.aoRemoverCondicao/);
  assert.match(hooks, /s\.venenos\.marcarCartao\(message\)/);
  assert.match(hooks, /s\.venenos\.injetarBotoes\(message, container\)/);
});
