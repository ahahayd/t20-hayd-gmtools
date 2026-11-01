import test from 'node:test';
import assert from 'node:assert/strict';
import { materializarItem, aplicarBuildPendente, aplicarBuildNosDados } from '../../scripts/tesouros/distribuicao.mjs';
import { resolverChaveItens } from '../../scripts/tesouros/integracao-itens.mjs';

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

const ESCOPO = 't20-hayd-gmtools';
const espera = () => new Promise(resolve => setTimeout(resolve));

/** Instala um t20-hayd-itens falso; devolve as chaves aplicadas. */
function instalarItens({ conhecidas = ['certeira'] } = {}) {
  const aplicadas = [];
  globalThis.game = {
    modules: new Map([['t20-hayd-itens', {
      active: true,
      api: {
        catalogo: { obterEntrada: chave => (conhecidas.includes(chave) ? {} : null) },
        efeitos: { adicionarEntrada: async (item, chave) => { aplicadas.push(chave); } }
      }
    }]])
  };
  return aplicadas;
}

/** Item falso que, como no Foundry, só muda quando o "servidor" responde. */
function itemFalso(dados) {
  const item = {
    ...structuredClone(dados),
    uuid: `Item.${Math.random()}`,
    getFlag: (escopo, chave) => item.flags[escopo]?.[chave],
    setFlag: async (escopo, chave, valor) => {
      await espera();
      item.flags[escopo][chave] = valor;
    },
    update: async mudancas => {
      await espera();
      item.system.description.value = mudancas['system.description.value'];
    },
    toObject: () => structuredClone({ flags: item.flags, system: item.system, name: item.name, _id: 'tmp', folder: 'pasta', sort: 5 }),
    delete: async () => { item.apagado = true; }
  };
  return item;
}

const dadosPendentes = (nomes = ['Certeira']) => ({
  name: 'Espada longa (Superior)',
  system: { description: { value: '<p>Espada.</p>' } },
  flags: {
    [ESCOPO]: {
      tesouroGerado: {
        tipo: 'itemSuperior', categoria: 'arma', pendente: true,
        melhorias: nomes.map(nome => ({ nome })), encantos: []
      }
    }
  }
});

test('hook de criação e chamada direta aplicam a build uma vez só', async () => {
  const aplicadas = instalarItens();
  const item = itemFalso(dadosPendentes());

  await Promise.all([aplicarBuildPendente(item), aplicarBuildPendente(item)]);

  assert.deepEqual(aplicadas, ['certeira']);
  assert.equal(item.flags[ESCOPO].tesouroGerado.pendente, false);
});

test('a descrição lista o que foi aplicado e o que ficou para o Mestre', async () => {
  instalarItens();
  const item = itemFalso(dadosPendentes(['Certeira', 'Inventada']));

  await aplicarBuildPendente(item);

  const descricao = item.system.description.value;
  assert.match(descricao, /^<p>Espada\.<\/p>/);
  assert.match(descricao, /<strong>Melhorias:<\/strong><\/p><ul><li>Certeira<\/li><\/ul>/);
  assert.match(descricao, /<strong>Melhorias \(aplicar manualmente\):<\/strong><\/p><ul><li>Inventada<\/li><\/ul>/);
});

test('nome da tabela acha a chave oficial do catálogo', async () => {
  instalarItens({ conhecidas: ['banhado-a-ouro', 'espinhosa-armadura', 'espinhoso-escudo'] });

  assert.equal(resolverChaveItens('Banhada a ouro', 'arma'), 'banhado-a-ouro');
  assert.equal(resolverChaveItens('Espinhos', 'armadura-escudo', { system: { tipo: 'pesada' } }), 'espinhosa-armadura');
  assert.equal(resolverChaveItens('Espinhos', 'armadura-escudo', { system: { tipo: 'escudo' } }), 'espinhoso-escudo');
});

test('dado cru sai com a build aplicada e sem sobra do item temporário', async () => {
  const aplicadas = instalarItens();
  let temporario;
  globalThis.foundry = {
    utils: {
      deepClone: structuredClone,
      setProperty: (alvo, caminho, valor) => {
        const partes = caminho.replace(`flags.${ESCOPO}.`, '');
        alvo.flags[ESCOPO][partes] = valor;
      }
    }
  };
  globalThis.Item = {
    implementation: {
      create: async dados => {
        assert.equal(dados.flags[ESCOPO].stashEdit, true, 'a limpeza do início precisa achar o temporário');
        temporario = itemFalso(dados);
        return temporario;
      }
    }
  };

  const pronto = await aplicarBuildNosDados({ ...dadosPendentes(), _id: 'entrada' });

  assert.deepEqual(aplicadas, ['certeira']);
  assert.equal(temporario.apagado, true);
  assert.equal(pronto.flags[ESCOPO].tesouroGerado.pendente, false);
  assert.equal(pronto.flags[ESCOPO].stashEdit, undefined);
  assert.match(pronto.system.description.value, /Certeira/);
  for (const chave of ['_id', 'folder', 'sort']) assert.equal(pronto[chave], undefined);
});

test('item sem build pendente passa intacto pelo estoque', async () => {
  instalarItens();
  const comum = { name: 'Espada longa', flags: {} };
  assert.equal(await aplicarBuildNosDados(comum), comum);
});

test('sem o t20-hayd-itens o item segue pendente até chegar a uma ficha', async () => {
  globalThis.game = { modules: new Map() };
  const dados = dadosPendentes();
  assert.equal(await aplicarBuildNosDados(dados), dados);
});
