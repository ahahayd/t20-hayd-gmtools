/**
 * Contas do preview de dano — sem Foundry, testáveis.
 *
 * O grosso do trabalho (aprimoramentos, passos de dado, bônus do ator) é feito
 * pelo próprio sistema sobre um clone do item; aqui ficam só os pedaços que o
 * sistema aplica FORA de `applyOnUseEffects` e a leitura dos tipos de dano.
 */

const VAZIO = ['', '0', undefined, null];

/**
 * Repete o que `ItemT20.use()` faz com o campo "Dano:" da janela, logo depois
 * do diálogo: o bônus digitado entra como mais uma parcela, herdando o tipo de
 * dano da primeira parcela da rolagem.
 */
export function aplicarBonusDano(rolls, bonusdano) {
  if (VAZIO.includes(bonusdano)) return rolls ?? [];
  for (const rolagem of rolls ?? []) {
    if (rolagem?.type !== 'dano' || !Array.isArray(rolagem.parts)) continue;
    const tipoBase = rolagem.parts[0]?.[1] ?? '';
    rolagem.parts.push([bonusdano, tipoBase]);
  }
  return rolls ?? [];
}

/**
 * Qual caixa fica marcada depois de um clique: as duas são exclusivas, e
 * clicar na que já estava marcada desliga o modo.
 */
export function alternarModo(atual, clicado) {
  if (!['max', 'min'].includes(clicado)) return '';
  return atual === clicado ? '' : clicado;
}

/**
 * Margem de crítico como faixa legível: o sistema guarda só o menor resultado
 * natural que critica ("19"), e quem lê a janela quer ver "19-20".
 */
export function textoDaMargem(criticoM) {
  const numero = Number(criticoM);
  if (!Number.isFinite(numero) || !numero) return String(criticoM || 20);
  if (numero >= 20) return '20';
  return `${numero}-20`;
}

/**
 * O mesmo para o campo "Bônus" da janela, que o sistema empurra nas parcelas
 * da rolagem de ataque — sem tipo, porque acerto não tem tipo de dano.
 */
export function aplicarBonusAcerto(rolls, bonus) {
  if (VAZIO.includes(bonus)) return rolls ?? [];
  for (const rolagem of rolls ?? []) {
    if (rolagem?.type !== 'ataque' || !Array.isArray(rolagem.parts)) continue;
    rolagem.parts.push([bonus, '']);
  }
  return rolls ?? [];
}
