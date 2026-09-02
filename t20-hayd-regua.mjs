/**
 * t20-hayd-gmtools | Régua para efeitos
 *
 * Régua OPCIONAL (ligada nas configurações do mundo) que mede sem contar a
 * distância dobrada das diagonais.
 *
 * No T20, só o MOVIMENTO conta a diagonal como 3 m. Nos demais efeitos —
 * alcance de ataques (inclusive corpo a corpo), de magias, de habilidades e de
 * poderes — a diagonal é ignorada e vale 1,5 m. A exceção são as áreas de
 * efeito, que continuam usando os gabaritos do próprio sistema.
 *
 * Ela NÃO substitui a régua padrão do Foundry nem altera seu funcionamento:
 * entra como uma ferramenta a mais na barra de tokens, ao lado da régua padrão
 * (que continua sendo a certa para medir movimento), e cada uma mede do seu
 * jeito. Toda a interação (arrastar, Ctrl+clique para pontos de parada, Alt
 * para esconder, roda do mouse para elevação) continua sendo a do próprio
 * Foundry — só o cálculo da distância e o rótulo mudam.
 */

import { gradeSemDiagonal, invalidarGrade } from './scripts/grade.mjs';

const MODULE_ID = 't20-hayd-gmtools';

/** Configuração de mundo que faz a régua existir. */
const SETTING = 'reguaEfeitos';
/** Nome da ferramenta na barra de controles de tokens. */
const TOOL = 'reguaEfeitos';
/** Chave enviada junto da atividade da régua para sincronizar o modo entre clientes. */
const CHAVE_SYNC = 't20SemDiagonal';

/** True se a régua opcional está ligada neste mundo. */
function reguaAtiva() {
  return game.settings.get(MODULE_ID, SETTING) === true;
}

// ─── Medição sem diagonal ─────────────────────────────────────────────────────

// ─── Subclasse da régua ───────────────────────────────────────────────────────

/**
 * Estende a régua configurada em CONFIG.Canvas.rulerClass (preservando o que
 * sistema ou outros módulos já tenham posto lá) com duas mudanças:
 *
 * 1. `canMeasure` passa a aceitar também a nossa ferramenta, o que faz o Foundry
 *    entregar a ela os mesmos eventos de arrastar/clicar da régua padrão;
 * 2. o rótulo de cada ponto usa a medição sem diagonal quando a medição foi
 *    iniciada com a nossa ferramenta.
 */
function instalarRegua() {
  const Base = CONFIG.Canvas.rulerClass;
  if (!Base) {
    console.warn('T20 Hayd GMTools | CONFIG.Canvas.rulerClass ausente — régua para efeitos indisponível');
    return;
  }

  CONFIG.Canvas.rulerClass = class ReguaT20 extends Base {

    /**
     * Esta medição está no modo "efeitos" (sem diagonal)? Definido no início do
     * arrasto e sincronizado com os outros clientes, para que todos vejam o
     * mesmo número.
     * @type {boolean}
     */
    semDiagonal = false;

    /** @override — a régua também mede com a ferramenta do módulo. */
    static get canMeasure() {
      if (!canvas.tokens.active) return false;
      return (game.activeTool === 'ruler') || (reguaAtiva() && game.activeTool === TOOL);
    }

    /** @inheritDoc — grava em qual modo esta medição começou. */
    _onDragStart(event) {
      this.semDiagonal = reguaAtiva() && (game.activeTool === TOOL);
      return super._onDragStart(event);
    }

    /**
     * Medição do caminho atual pela grade sem diagonal, memorizada enquanto o
     * caminho não muda (o `path` é congelado a cada alteração, então comparar a
     * referência basta) — o rótulo é remontado a cada refresh.
     */
    #cache = { path: null, medicao: null };
    #medicao() {
      const path = this.path;
      if (this.#cache.path === path) return this.#cache.medicao;
      const grade = gradeSemDiagonal();
      const medicao = grade ? grade.measurePath(path) : null;
      this.#cache = { path, medicao };
      return medicao;
    }

    /** @inheritDoc — troca a distância do rótulo pela versão sem diagonal. */
    _getWaypointLabelContext(waypoint, state) {
      const context = super._getWaypointLabelContext(waypoint, state);
      if (!context || !this.semDiagonal) return context;

      const medida = this.#medicao()?.waypoints?.[waypoint.index];
      if (medida) {
        context.distance = { total: medida.distance.toNearest(0.01).toLocaleString(game.i18n.lang) };
        // Igual ao núcleo: o delta por trecho só aparece a partir do 2º trecho.
        if (waypoint.index >= 2) context.distance.delta = medida.backward.distance.toNearest(0.01).signedString();
      }

      // Marca visual para não confundir com a régua padrão.
      context.action = { icon: 'fa-solid fa-burst' };
      context.cssClass = [context.cssClass, 't20g-regua-efeitos'].filterJoin(' ');
      return context;
    }
  };
}

// ─── Sincronização do modo entre clientes ─────────────────────────────────────

/**
 * O Foundry transmite aos outros clientes apenas `{path, hidden}` da régua, e
 * cada cliente monta o rótulo por conta própria — sem isto, quem está do outro
 * lado veria a linha certa com a distância da régua padrão.
 *
 * Então acrescentamos a flag do modo ao objeto transmitido (na saída) e a
 * aplicamos na régua do usuário remoto antes do caminho ser atribuído, que é o
 * que dispara o redesenho (na entrada).
 */
function instalarSincronizacao() {
  const UserCls = CONFIG.User.documentClass;
  const broadcastOriginal = UserCls.prototype.broadcastActivity;
  UserCls.prototype.broadcastActivity = function (activityData = {}, options) {
    const dados = activityData.ruler;
    if (this.isSelf && dados && typeof dados === 'object') {
      dados[CHAVE_SYNC] = canvas.controls?.ruler?.semDiagonal === true;
    }
    return broadcastOriginal.call(this, activityData, options);
  };

  const ControlsCls = CONFIG.Canvas.layers.controls.layerClass;
  const updateOriginal = ControlsCls.prototype.updateRuler;
  ControlsCls.prototype.updateRuler = async function (user, data) {
    if (!user.isSelf) {
      // Mesma resolução que o núcleo faz em seguida: se a régua ainda não
      // existe, desenhá-la aqui a deixa no cache e o original a reaproveita.
      const regua = this.getRulerForUser(user.id) ?? await this.drawRuler(user);
      if (regua) regua.semDiagonal = data?.[CHAVE_SYNC] === true;
    }
    return updateOriginal.call(this, user, data);
  };
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, SETTING, {
    name: 'T20HaydGMTools.SettingReguaEfeitosName',
    hint: 'T20HaydGMTools.SettingReguaEfeitosHint',
    scope: 'world', config: true, type: Boolean, default: false,
    onChange: async ligada => {
      // A barra de controles só reconstrói as ferramentas com {reset: true}.
      // Se a ferramenta sumir enquanto estava em uso, volta para "selecionar".
      if (!ligada && game.activeTool === TOOL) {
        await ui.controls?.activate({ control: 'tokens', tool: 'select' });
      }
      await ui.controls?.render({ reset: true });
    }
  });
});

Hooks.once('setup', () => {
  instalarRegua();
  instalarSincronizacao();
  console.log('T20 Hayd GMTools | Régua para efeitos instalada');
});

/**
 * A ferramenta deve existir nesta cena?
 *
 * Só faz sentido em grade quadrada: em hexágono ou sem grade não há diagonal a
 * descontar, e a ferramenta seria uma cópia exata da régua padrão.
 *
 * Exige o canvas PRONTO de propósito. O Foundry monta os controles duas vezes
 * na carga: a primeira antes de o canvas existir e a segunda já com a cena
 * carregada, dentro de `Canvas##initialize` (board.mjs) — que roda ANTES do
 * hook `canvasReady`. Responder "sim" na primeira, sem saber a grade, é o que
 * fazia a ferramenta aparecer e sumir logo depois numa cena sem grade.
 */
function deveMostrarFerramenta() {
  if (!reguaAtiva()) return false;
  if (!canvas?.ready) return false;
  return canvas.grid?.isSquare === true;
}

/** Presença da ferramenta na última montagem dos controles. */
let _ferramentaVisivel = null;

/**
 * A grade espelho depende das dimensões da cena — descarta ao trocar de cena.
 *
 * A remontagem aqui é rede de segurança: o núcleo já refaz os controles ao
 * desenhar a cena, mas se a última montagem tiver ocorrido com o canvas ainda
 * não pronto, a ferramenta ficaria de fora sem nada para trazê-la de volta.
 */
Hooks.on('canvasReady', () => {
  invalidarGrade();
  if (_ferramentaVisivel === deveMostrarFerramenta()) return;
  ui.controls?.render({ reset: true });
});

/** Acrescenta a ferramenta ao lado da régua padrão, nos controles de tokens. */
Hooks.on('getSceneControlButtons', controls => {
  _ferramentaVisivel = false;
  if (!deveMostrarFerramenta()) return;

  const tokens = controls.tokens;
  if (!tokens?.tools?.ruler) return;

  _ferramentaVisivel = true;
  tokens.tools[TOOL] = {
    name: TOOL,
    order: tokens.tools.ruler.order + 0.5,
    title: 'T20HaydGMTools.ReguaEfeitosTool',
    icon: 'fa-solid fa-burst'
  };
});
