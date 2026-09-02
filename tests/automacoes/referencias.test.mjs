import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../scripts/automacoes/', import.meta.url));

function listar(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listar(p));
    else if (e.name.endsWith('.mjs')) out.push(p);
  }
  return out;
}

/**
 * Comentários fora: uma frase como "não há efeito a manter (…)" casaria com o
 * padrão de chamada e viraria falso positivo.
 */
function semComentarios(codigo) {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const fonte = new Map(
  listar(RAIZ).map((f) => [f, semComentarios(fs.readFileSync(f, 'utf8'))])
);

/** Nome -> arquivo onde é definido no topo do módulo. */
function mapaDeDefinicoes() {
  const onde = new Map();
  for (const [f, src] of fonte) {
    for (const re of [
      /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
      /^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/gm,
      /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/gm
    ]) for (const m of src.matchAll(re)) if (!onde.has(m[1])) onde.set(m[1], f);
  }
  return onde;
}

function nomesImportados(src) {
  const nomes = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from/gs)) {
    for (const bruto of m[1].split(',')) {
      const nome = bruto.trim().split(/\s+as\s+/).pop().trim();
      if (nome) nomes.add(nome);
    }
  }
  for (const m of src.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from/g)) nomes.add(m[1]);
  return nomes;
}

function nomesLocais(src) {
  const nomes = new Set();
  for (const re of [
    /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g,
    /class\s+([A-Za-z_$][\w$]*)/g
  ]) for (const m of src.matchAll(re)) nomes.add(m[1]);

  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]+)\}\s*=/g)) {
    for (const b of m[1].split(',')) {
      const n = b.trim().split(':').pop().trim().replace(/\s*=.*$/, '');
      if (/^[A-Za-z_$][\w$]*$/.test(n)) nomes.add(n);
    }
  }
  return nomes;
}

/**
 * Depois do split, uma função pode chamar outra que mudou de arquivo sem que
 * o import tenha vindo junto. `node --check` não pega: o erro só aparece em
 * runtime, quando aquele caminho é exercitado (foi exatamente assim que
 * `passoSequencial` quebrou a sincronização do Golpe Pessoal).
 */
test('nenhuma função é chamada de outro arquivo sem import', () => {
  const definidoEm = mapaDeDefinicoes();
  const pendurados = [];

  for (const [f, src] of fonte) {
    const conhecidos = new Set([...nomesImportados(src), ...nomesLocais(src)]);
    // (?<![.\w$]) ignora acesso a propriedade: `s.funcao(` é injeção de
    // serviço, não referência livre ao escopo do módulo.
    const chamadas = new Set(
      [...src.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1])
    );

    for (const nome of chamadas) {
      const dono = definidoEm.get(nome);
      if (!dono || dono === f || conhecidos.has(nome)) continue;
      pendurados.push(
        `${path.relative(RAIZ, f)} chama ${nome}() — definido em ${path.relative(RAIZ, dono)}`
      );
    }
  }

  assert.deepEqual(pendurados, [], `referências penduradas:\n${pendurados.join('\n')}`);
});

test('nenhum ciclo de import entre os módulos de automação', () => {
  const dep = new Map();
  for (const [f, src] of fonte) {
    dep.set(f, [...src.matchAll(/from '(\.[^']+)'/g)]
      .map((m) => path.normalize(path.join(path.dirname(f), m[1])))
      .filter((d) => fonte.has(d)));
  }

  const estado = new Map();
  const ciclos = [];
  const visita = (no, pilha) => {
    if (estado.get(no) === 'ok') return;
    if (estado.get(no) === 'indo') {
      ciclos.push([...pilha.slice(pilha.indexOf(no)), no]
        .map((p) => path.relative(RAIZ, p)).join(' -> '));
      return;
    }
    estado.set(no, 'indo');
    for (const d of dep.get(no) ?? []) visita(d, [...pilha, no]);
    estado.set(no, 'ok');
  };
  for (const f of fonte.keys()) visita(f, []);

  assert.deepEqual(ciclos, [], `ciclos encontrados:\n${ciclos.join('\n')}`);
});
