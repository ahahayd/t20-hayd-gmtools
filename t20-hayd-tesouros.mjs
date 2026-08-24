/**
 * T20 Hayd GMTools — Gerador de Tesouros
 * Tabela 8-1 (e associadas) de Tormenta20, com vínculo de itens de
 * compêndio, homebrew por tabela, integração opcional com t20-hayd-itens
 * e rolagem "ao vivo" pelos jogadores. Ponto de entrada isolado (importado
 * de t20-hayd-gmtools.mjs, não listado em module.json) para hot-reload,
 * mesmo padrão de t20-hayd-automacoes.mjs e t20-hayd-regua.mjs.
 */
import { MODULE_ID } from './scripts/tesouros/constantes.mjs';
import { registrarHomebrewSettings } from './scripts/tesouros/homebrew.mjs';
import { registrarVinculoSettings } from './scripts/tesouros/vinculo.mjs';
import { abrirGeradorTesouros } from './scripts/tesouros/app-gerador.mjs';
import { abrirVinculosTesouros } from './scripts/tesouros/app-vinculos.mjs';
import { abrirHomebrewTesouros } from './scripts/tesouros/app-homebrew.mjs';
import { gerarTesouro } from './scripts/tesouros/motor.mjs';
import { concederTesouro, postarCardTesouro } from './scripts/tesouros/distribuicao.mjs';
// Liga o botão "Rolar" das mensagens de pedido de rolagem (Hooks.on própria).
import './scripts/tesouros/rolagem-jogador.mjs';

// Esta fachada é o ponto de entrada do gerador para o resto do módulo — a
// Ficha do Grupo abre o gerador a partir do estoque. Reexportado aqui para que
// ninguém precise alcançar scripts/tesouros/ por dentro.
export { abrirGeradorTesouros };

const TOOL = 't20g-tesouros';

Hooks.once('init', () => {
  registrarHomebrewSettings();
  registrarVinculoSettings();

  game.settings.registerMenu(MODULE_ID, 'tesourosVinculosMenu', {
    name: 'T20HaydGMTools.TesourosVinculosTitulo',
    label: 'T20HaydGMTools.TesourosVinculosMenuBotao',
    hint: 'T20HaydGMTools.TesourosVinculosMenuDica',
    icon: 'fa-solid fa-link',
    restricted: true,
    type: class extends foundry.appv1.api.FormApplication {
      async render() { abrirVinculosTesouros(); return this; }
      async _updateObject() {}
    }
  });

  game.settings.registerMenu(MODULE_ID, 'tesourosHomebrewMenu', {
    name: 'T20HaydGMTools.TesourosHomebrewTitulo',
    label: 'T20HaydGMTools.TesourosHomebrewMenuBotao',
    hint: 'T20HaydGMTools.TesourosHomebrewMenuDica',
    icon: 'fa-solid fa-wand-magic-sparkles',
    restricted: true,
    type: class extends foundry.appv1.api.FormApplication {
      async render() { abrirHomebrewTesouros(); return this; }
      async _updateObject() {}
    }
  });

  foundry.applications.handlebars.loadTemplates([
    `modules/${MODULE_ID}/templates/tesouros/gerador.hbs`,
    `modules/${MODULE_ID}/templates/tesouros/vinculos.hbs`,
    `modules/${MODULE_ID}/templates/tesouros/homebrew.hbs`
  ]);

  console.log('T20 Hayd GMTools | Gerador de Tesouros inicializado');
});

Hooks.once('ready', () => {
  const mod = game.modules.get(MODULE_ID);
  if (mod) {
    mod.api = {
      ...(mod.api ?? {}),
      tesouros: {
        abrirGerador: abrirGeradorTesouros,
        abrirVinculos: abrirVinculosTesouros,
        abrirHomebrew: abrirHomebrewTesouros,
        gerarTesouro,
        concederTesouro,
        postarCardTesouro
      }
    };
  }
});

/** Ferramenta nos controles de token, ao lado das demais do GMTools — só para o Mestre. */
Hooks.on('getSceneControlButtons', controls => {
  if (!game.user.isGM) return;
  const tokens = controls.tokens;
  if (!tokens?.tools) return;

  tokens.tools[TOOL] = {
    name: TOOL,
    order: (tokens.tools.ruler?.order ?? 0) + 1,
    title: 'T20HaydGMTools.TesourosGeradorTitulo',
    icon: 'fa-solid fa-sack-dollar',
    button: true,
    // Nomes diferentes de handler em versões/variações do v13 para o mesmo botão de ação —
    // manter os dois é inofensivo (o que não existir na API instalada é apenas ignorado).
    onClick: () => abrirGeradorTesouros(),
    onChange: () => abrirGeradorTesouros()
  };
});
