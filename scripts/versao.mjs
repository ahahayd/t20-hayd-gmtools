/**
 * t20-hayd-gmtools | versao.mjs
 * O módulo roda no Foundry v13 (Tormenta20 1.5) e no v14 (Tormenta20 1.6)
 * com o mesmo código. Onde os dois diferem, o código pergunta `ehV14()` e
 * segue o caminho de cada um. Cada versão do Tormenta20 só existe numa
 * versão do Foundry, então isto também separa o formato de dados do sistema.
 *
 * As automações continuam descrevendo os efeitos no formato do v13; no v14
 * a conversão acontece na hora de gravar (`paraOSistema` / `efeitoV14`).
 *
 * No 1.6 o sistema deixou de ler `flags.tormenta20.*` nos efeitos:
 *   flags.tormenta20.onuse          → system.onuse
 *   flags.tormenta20.self/attack/…  → system.abilityUse.types
 *   flags.tormenta20.items ("a;b")  → system.abilityUse.names
 *   flags.tormenta20.custo ("2")    → system.abilityUse.custo (número|null)
 *   flags.tormenta20.aumenta        → system.abilityUse.aumenta
 *   !disabled de um efeito de uso   → system.abilityUse.automatic
 *                                     (efeitos de uso ficam sempre disabled)
 *   flags.tormenta20.durationScene  → duration.expiry = "sceneEnd"
 * e o Foundry v14 trocou `changes[].mode` (número) por
 * `system.changes[].type` (texto) e `duration.rounds` por value/units.
 */

/** true no Foundry v14 (Tormenta20 1.6); false no v13 (Tormenta20 1.5). */
export function ehV14() {
  return (globalThis.game?.release?.generation ?? 13) >= 14;
}

const TIPOS_DE_USO = ["self", "ability", "attack", "consumable", "equipment", "power", "skill", "spell"];
const CHAVES_MOVIDAS = ["onuse", "durationScene", "items", "custo", "aumenta"];
const MODO_PARA_TIPO = { 0: "custom", 1: "multiply", 2: "add", 3: "downgrade", 4: "upgrade", 5: "override" };
const TIPO_PARA_MODO = Object.fromEntries(Object.entries(MODO_PARA_TIPO).map(([m, t]) => [t, Number(m)]));

/** `mode` numérico (v13) → `type` textual (v14). */
export function tipoDaMudanca(change) {
  if (typeof change?.type === "string" && change.type) return change.type;
  return MODO_PARA_TIPO[Number(change?.mode ?? 2)] ?? "add";
}

/** `type` textual (v14) → `mode` numérico, para as telas que ainda o usam. */
export function modoDaMudanca(change) {
  if (typeof change?.type === "string") return TIPO_PARA_MODO[change.type] ?? 0;
  return Number(change?.mode ?? 2);
}

/** Mudanças no formato do v14 (`type`, valor em texto). */
export function mudancasV14(changes = []) {
  return (changes ?? []).map(c => ({
    key: c.key,
    value: String(c.value ?? ""),
    type: tipoDaMudanca(c),
    priority: c.priority ?? null
  }));
}

/** Mudanças de um efeito (documento ou dados), qualquer que seja o formato. */
export function mudancasDe(efeito) {
  return efeito?.system?.changes ?? efeito?.changes ?? [];
}

/**
 * Converte os dados de um efeito montado no formato antigo para o do
 * Tormenta20 1.6. Não altera o objeto recebido. Idempotente.
 */
export function efeitoV14(dados) {
  if (!dados) return dados;
  const saida = foundry.utils.deepClone(dados);
  const t = saida.flags?.tormenta20 ?? {};
  saida.system ??= {};

  // Mudanças: `changes` + `mode` → `system.changes` + `type`.
  if (Array.isArray(saida.changes)) {
    saida.system.changes = mudancasV14(saida.changes);
    delete saida.changes;
  } else if (Array.isArray(saida.system.changes)) {
    saida.system.changes = mudancasV14(saida.system.changes);
  }

  // Duração: { rounds: N } → { value: N, units: "rounds" }.
  const d = saida.duration;
  if (d && d.value === undefined) {
    for (const unidade of ["rounds", "turns", "seconds"]) {
      if (typeof d[unidade] === "number") {
        saida.duration = { value: d[unidade], units: unidade, expiry: "turnStart" };
        break;
      }
    }
  }
  if (t.durationScene) saida.duration = { value: null, units: "rounds", expiry: "sceneEnd" };
  else if (saida.duration && !Object.keys(saida.duration).length) saida.duration = { value: null, expiry: null };

  // Efeito de uso: flags → system.onuse / system.abilityUse.
  if ("onuse" in t) {
    saida.system.onuse = !!t.onuse;
    if (t.onuse) {
      const nomes = typeof t.items === "string"
        ? t.items.replaceAll(",", ";").split(";").map(s => s.trim()).filter(Boolean)
        : Array.isArray(t.items) ? t.items : [];
      const custo = t.custo === undefined || t.custo === null || t.custo === "" ? null : Number(t.custo);
      saida.system.abilityUse = {
        automatic: !saida.disabled,
        aumenta: !!t.aumenta,
        custo: Number.isFinite(custo) ? custo : null,
        names: nomes,
        types: TIPOS_DE_USO.filter(k => t[k])
      };
      // No 1.6 um efeito de uso nunca vale passivamente; "automático"
      // passou a ser o que antes era "não suspenso".
      saida.disabled = true;
    }
  }

  // O cartão do chat do 1.6 lê `parseHTML(description).innerText`, que só
  // funciona com UM elemento raiz; com dois <p> o uso do item quebrava.
  if (typeof saida.description === "string") saida.description = umaRaiz(saida.description);

  // As chaves que o sistema passou para `system` saem das flags; o resto
  // (como a etiqueta `upgrade`) fica.
  if (saida.flags?.tormenta20) {
    for (const k of [...CHAVES_MOVIDAS, ...TIPOS_DE_USO]) delete saida.flags.tormenta20[k];
  }
  return saida;
}

/** Envolve um trecho de HTML num único elemento raiz. */
export function umaRaiz(html) {
  const texto = String(html ?? "").trim();
  if (!texto) return texto;
  const tpl = document.createElement("template");
  tpl.innerHTML = texto;
  const raizes = [...tpl.content.childNodes].filter(n => n.nodeType !== Node.TEXT_NODE || n.textContent.trim());
  return raizes.length === 1 && raizes[0].nodeType === Node.ELEMENT_NODE ? texto : `<div>${texto}</div>`;
}

/**
 * Dados de uso de um efeito (documento do 1.6 ou dados antigos), num
 * formato só: { onuse, tipos:Set, nomes:Set, custo, automatico, aumenta }.
 */
export function usoDe(efeito) {
  const s = efeito?.system;
  if (s && "onuse" in s) {
    const au = s.abilityUse ?? {};
    return {
      onuse: !!s.onuse,
      tipos: new Set(au.types ?? []),
      nomes: new Set(au.names ?? []),
      custo: au.custo ?? null,
      automatico: !!au.automatic,
      aumenta: !!au.aumenta
    };
  }
  const t = efeito?.flags?.tormenta20 ?? {};
  return {
    onuse: !!t.onuse,
    tipos: new Set(TIPOS_DE_USO.filter(k => t[k])),
    nomes: new Set(String(t.items ?? "").split(";").map(s => s.trim()).filter(Boolean)),
    custo: t.custo === "" || t.custo === undefined ? null : Number(t.custo),
    automatico: !efeito?.disabled,
    aumenta: !!t.aumenta
  };
}

/**
 * `event` para ItemT20#roll: no Tormenta20 1.6 ele lê `event.shiftKey` e
 * quebra sem evento. Este sempre abre a janela de uso, qualquer que seja
 * a configuração "UsageConfig" do mundo.
 */
export function eventoComJanela() {
  let padrao = true;
  try { padrao = game.settings.get("tormenta20", "UsageConfig") === "default"; } catch { /* sem a config */ }
  return { shiftKey: !padrao, altKey: false, ctrlKey: false, metaKey: false };
}

/** `event` para ItemT20#roll que pula a janela de uso. */
export function eventoSemJanela() {
  let padrao = true;
  try { padrao = game.settings.get("tormenta20", "UsageConfig") === "default"; } catch { /* sem a config */ }
  return { shiftKey: padrao, altKey: false, ctrlKey: false, metaKey: false };
}

/**
 * Espera a migração 1.6.0 do sistema terminar (ela reescreve os efeitos
 * do mundo). Resolve na hora se ela já rodou.
 */
export function aguardarMigracaoDoSistema() {
  const pronta = () => {
    try {
      const v = game.settings.get("tormenta20", "systemMigrationVersion");
      return !!v && !foundry.utils.isNewerVersion("1.6.0", v);
    } catch { return true; }
  };
  if (pronta()) return Promise.resolve();
  return new Promise(resolve => {
    const id = Hooks.on("updateSetting", setting => {
      if (setting.key !== "tormenta20.systemMigrationVersion" || !pronta()) return;
      Hooks.off("updateSetting", id);
      resolve();
    });
  });
}

/* ── Ajudantes por versão ──────────────────────────────────────── */

/** Dados de efeito montados no formato do v13, prontos para gravar nesta versão. */
export function paraOSistema(dados) {
  return ehV14() ? efeitoV14(dados) : dados;
}

/**
 * Apaga uma chave num update: `{ ...apagarChave('flags.mod.x.y') }`.
 * v14: operador ForcedDeletion. v13: a sintaxe antiga `x.-=y: null`.
 */
export function apagarChave(caminho) {
  if (ehV14()) return { [caminho]: new foundry.data.operators.ForcedDeletion() };
  const i = caminho.lastIndexOf('.');
  return { [`${caminho.slice(0, i)}.-=${caminho.slice(i + 1)}`]: null };
}

/**
 * Opções de ItemT20#roll para abrir (ou pular) a janela de uso.
 * v14: o 1.6 decide pela tecla Shift do `event` e quebra sem ele.
 * v13: o 1.5 ignora o `event` e usa `configureDialog`.
 */
export function opcoesDeRoll({ janela = true } = {}) {
  if (ehV14()) return { event: janela ? eventoComJanela() : eventoSemJanela() };
  return { configureDialog: janela };
}

/**
 * Entrada de menu de contexto nas duas versões. Escrita sempre no formato
 * do v13 ({ name, icon, condition(li), callback(li) }); no v14 vira
 * { label, icon, visible(li), onClick(event, li) } — o formato antigo é
 * deprecado lá até o v16.
 */
export function itemDeMenu({ name, icon, condition, callback, ...resto }) {
  if (!ehV14()) return { name, icon, condition, callback, ...resto };
  const item = { label: name, icon, ...resto };
  if (condition) item.visible = condition;
  if (callback) item.onClick = (_event, li) => callback(li);
  return item;
}

/** Modo da mensagem escolhido na janela de uso (`messageMode` no v14, `rollMode` no v13). */
export function modoDaJanela(configuracao) {
  return ehV14() ? (configuracao?.messageMode ?? configuracao?.rollMode) : configuracao?.rollMode;
}
