/**
 * t20-hayd-tesouros | constantes.mjs
 * Constantes compartilhadas entre os módulos do Gerador de Tesouros.
 */

export const MODULE_ID = 't20-hayd-gmtools';

/** Flag na mensagem de chat: id da rolagem pedida a um jogador (ver rolagem-jogador.mjs). */
export const FLAG_PEDIDO_ROLAGEM = 'tesouroRequestId';

/** Setting de mundo: overrides de vínculo item de compêndio ↔ entrada de tabela. */
export const SETTING_VINCULOS = 'tesourosVinculos';

/** Tipos de item que contam como inventário físico (mesmo critério do t20-hayd-management). */
export const TIPOS_INVENTARIO = ['arma', 'equipamento', 'consumivel', 'tesouro'];

/** Moedas do sistema, na ordem de exibição (maior para menor). */
export const MOEDAS = ['tl', 'to', 'tp', 'tc'];

/**
 * Abreviatura de cada moeda. As CHAVES do sistema não seguem a inicial do
 * nome, então vale conferir antes de mexer (tormenta20.mjs, schemaCurrency):
 *
 *   tc → Cobre    (T20.CurrencyCopperValue)   "TC"
 *   tp → Prata    (T20.CurrencySilverValue)   "T$"  ← padrão, exchangeRate 1
 *   to → Ouro     (T20.CurrencyGoldValue)     "TO"  ← exchangeRate 10
 *   tl → Platina  (T20.CurrencyPlatinumValue) "TP"
 *
 * Ou seja: a moeda padrão "T$" do livro é a PRATA, cuja chave é `tp` — não
 * `to`. As abreviaturas vêm do lang do sistema (CurrencySilverAbbr = "T$").
 */
export const MOEDA_ROTULO = { tl: 'TP', to: 'TO', tp: 'T$', tc: 'TC' };

/** Abreviatura de exibição de uma moeda ("tp" → "T$"). */
export const rotuloMoeda = (chave) => MOEDA_ROTULO[chave] ?? String(chave).toUpperCase();
