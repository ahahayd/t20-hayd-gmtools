import { MODULE_ID, automacoesAtivas, souResponsavelPeloAtor } from './runtime.mjs';

/** Reconhece o cartão criado pelo botão nativo "Terminar Cena" do T20. */
export function ehMensagemDeCenaEncerrada(message) {
  const conteudo = String(message?.content ?? '');
  return conteudo.includes('fa-clapperboard')
    && conteudo.includes('Cena Finalizada')
    && conteudo.includes('A cena atual foi terminada pelo mestre');
}

/** Registra uma única vez todos os pontos de integração com o Foundry. */
export function registrarHooksAutomacoes(s) {
  /** Um item mudou: os dois índices de atores precisam ser reconstruídos. */
  const invalidarIndices = () => {
    s.indiceCombinacoes.invalidar();
    s.indiceEstudo.invalidar();
  };

  Hooks.on('getItemSheetHeaderButtons', (app, buttons) => {
    if (!automacoesAtivas()) return;
    const item = app?.document ?? app?.object;
    if (item?.documentName !== 'Item' || !item.isOwner) return;
    if (buttons.some((b) => b.class === 't20g-automacao')) return;
    buttons.unshift({
      label: game.i18n.localize('T20HaydGMTools.AutoBotao'),
      class: 't20g-automacao',
      icon: 'fa-solid fa-wand-magic-sparkles',
      onclick: (ev) => {
        ev?.preventDefault?.();
        s.abrirDialogoAutomacao(item);
      }
    });
  });

  Hooks.on('renderChatMessageHTML', (message, html) => {
    if (!automacoesAtivas()) return;
    try {
      s.injetarControlesAutomacao(message, html);
      const container = html?.querySelector ? html : (html?.[0] ?? null);
      const zerar = container?.querySelector?.('.t20g-auto-zerar-tudo');
      if (zerar && game.user.isGM) {
        zerar.addEventListener('click', async (ev) => {
          ev.preventDefault();
          zerar.disabled = true;
          try { await s.zerarTodosContadores(); }
          catch (err) { console.error(`${MODULE_ID} | Falha ao zerar contadores`, err); }
          finally { zerar.disabled = false; }
        });
      }
    } catch (err) {
      console.error(`${MODULE_ID} | Falha ao injetar controles da automação`, err);
    }
  });

  const sincronizarAtores = async ({ reaplicar = false } = {}) => {
    const atores = s.indiceCombinacoes.listar()
      .filter((ator) => souResponsavelPeloAtor(ator));
    await Promise.all(atores.map(async (ator) => {
      await s.sincronizarCombinacoes(ator);
      if (reaplicar) await s.reaplicarEfeitosCombinacao(ator);
      s.atualizarBarrasCombinacao(ator);
    }));
  };

  // Estudar o Adversário depende do alvo mirado pelo mesmo motivo das
  // Combinações, mas tem índice próprio: os dois poderes raramente convivem
  // na mesma ficha e percorrer a lista errada faria trabalho à toa.
  const sincronizarEstudos = async () => {
    const atores = s.indiceEstudo.listar()
      .filter((ator) => souResponsavelPeloAtor(ator));
    await Promise.all(atores.map(async (ator) => {
      await s.sincronizarEstudo(ator);
      s.atualizarBarrasEstudo(ator);
    }));
  };

  Hooks.on('targetToken', (usuario) => {
    if (!automacoesAtivas() || usuario?.id !== game.user.id) return;
    sincronizarAtores().catch((err) =>
      console.error(`${MODULE_ID} | Falha ao sincronizar combinações`, err)
    );
    sincronizarEstudos().catch((err) =>
      console.error(`${MODULE_ID} | Falha ao sincronizar estudos`, err)
    );
  });

  Hooks.on('updateCombat', (combate, mudancas) => {
    if (!automacoesAtivas()) return;
    if (!('round' in mudancas) && !('turn' in mudancas)) return;

    (async () => {
      await s.encerrarContadoresDeTurno(combate);

      const novaRodada = Number(combate.round) || 0;
      const velhaRodada = Number(combate.previous?.round ?? novaRodada);
      const novoTurno = Number(combate.turn);
      const velhoTurno = Number(combate.previous?.turn);
      const combatenteAnterior = combate.previous?.combatantId
        ?? combate.previous?.combatant?.id
        ?? combate.combatants?.contents?.[velhoTurno]?.id
        ?? null;
      const avancou = novaRodada > velhaRodada
        || (novaRodada === velhaRodada
          && Number.isFinite(novoTurno) && Number.isFinite(velhoTurno)
          && novoTurno > velhoTurno);

      // Cada aplicação termina quando a iniciativa volta a quem usou o poder,
      // não simplesmente quando o número da rodada muda.
      if (avancou) await s.expirarAplicacoesCombinacao(combate, {
        rodadaAnterior: velhaRodada,
        turnoAnterior: velhoTurno,
        combatenteAnterior
      });

      if ('round' in mudancas) {
        if (novaRodada > velhaRodada) {
          await s.apagarMensagensRetrocesso(combate.id, novaRodada);
        }
        await sincronizarAtores({ reaplicar: true });
        await s.anunciarContagensEncerradas(velhaRodada, novaRodada);
        await s.anunciarRetrocessoCombinacoes(combate, velhaRodada, novaRodada);
      } else {
        await sincronizarAtores({ reaplicar: true });
      }
    })().catch((err) =>
      console.error(`${MODULE_ID} | Falha ao processar avanço do combate`, err)
    );
  });

  Hooks.on('createChatMessage', (message, options, userId) => {
    if (!automacoesAtivas()) return;

    // O botão nativo do Tormenta20 não atualiza a Scene nem o Combat. Seu
    // sinal confiável é o cartão criado depois que os efeitos de cena foram
    // removidos. Somente o GM ativo publica a sugestão para evitar duplicatas.
    if (ehMensagemDeCenaEncerrada(message)
      && game.user.isGM && game.user === game.users.activeGM) {
      s.sugerirZerarContadores(
        game.i18n.localize('T20HaydGMTools.FimCenaManual')
      ).catch((err) =>
        console.error(`${MODULE_ID} | Falha ao sugerir zerar contadores`, err)
      );
    }

    if (userId !== game.user.id) return;
    s.registrarMensagemRetroativa(message).catch((err) =>
      console.error(`${MODULE_ID} | Falha ao registrar mensagem retroativa`, err)
    );
  });

  Hooks.on('createItem', () => invalidarIndices());

  /**
   * Contagens de Combinação e de Estudo vivem em flags do ATOR. Este hook roda
   * em todos os clientes para que a mesa inteira veja o número mudar, não só
   * quem clicou. Só repinta o que já está na tela — nada é gravado aqui.
   */
  Hooks.on('updateActor', (ator, mudancas) => {
    if (!automacoesAtivas()) return;
    const flags = mudancas?.flags?.[MODULE_ID];
    if (!flags) return;
    const mexeuNaContagem = ['combinacoes', 'estudarAdversario']
      .some((chave) => chave in flags || `-=${chave}` in flags);
    if (!mexeuNaContagem) return;
    s.atualizarBarrasCombinacao(ator);
    s.atualizarBarrasEstudo(ator);
  });

  Hooks.on('deleteCombat', (combate) => {
    if (!automacoesAtivas()) return;
    s.sugerirZerarContadores(
      game.i18n.localize('T20HaydGMTools.FimCenaCombate'),
      { combateId: combate?.id, rodada: Number(combate?.round) || 0 }
    ).catch((err) =>
      console.error(`${MODULE_ID} | Falha ao sugerir zerar contadores`, err)
    );
  });

  Hooks.on('updateScene', (cena, mudancas) => {
    if (!automacoesAtivas() || mudancas.active !== true) return;
    s.sugerirZerarContadores(
      game.i18n.format('T20HaydGMTools.FimCenaTroca', { cena: cena.name })
    ).catch((err) => console.error(`${MODULE_ID} | Falha ao sugerir zerar contadores`, err));
  });

  Hooks.on('updateItem', (item, mudancas, options, userId) => {
    invalidarIndices();
    if (!automacoesAtivas()) return;

    // Roda em TODOS os clientes: a contagem é visível para a mesa inteira, e
    // sem isto os espectadores ficariam com o valor congelado no cartão.
    if (item.actor) s.atualizarRotulos(item);

    if (userId !== game.user.id || !item.actor?.isOwner) return;
    const def = s.definicaoDe(item);
    if (!def?.contador && !def?.golpe) return;
    if (!('name' in mudancas) && !('img' in mudancas)) return;
    if (def.contador && s.valorContador(item) <= 0) return;
    if (def.golpe && !s.golpeDoItem(item)) return;
    s.sincronizarEfeito(item).catch((err) =>
      console.error(`${MODULE_ID} | Falha ao sincronizar automação`, err)
    );
  });

  Hooks.on('deleteItem', (item, options, userId) => {
    invalidarIndices();
    if (!automacoesAtivas() || userId !== game.user.id) return;
    const ator = item.actor;
    if (!ator?.isOwner) return;
    for (const efeito of s.efeitosDoItem(ator, item.id)) {
      efeito.delete().catch((err) =>
        console.error(`${MODULE_ID} | Falha ao remover efeito da automação`, err)
      );
    }
  });

  Hooks.on('canvasReady', () => invalidarIndices());
}
