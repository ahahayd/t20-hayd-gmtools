import fs from 'node:fs';
const p = 't20-hayd-gmtools.mjs';
let s = fs.readFileSync(p, 'utf8');
const a = "  // O sistema não mostra os flavors no texto da fórmula; manter igual.\r\n  nova._formula = nova._formula.replaceAll(/(\[\w*\])/g, '');\r\n";
if (s.split(a).length - 1 !== 1) throw new Error('ancora');
s = s.replace(a, '');
fs.writeFileSync(p, s);
console.log('ok');
