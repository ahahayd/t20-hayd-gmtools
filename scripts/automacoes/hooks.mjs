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
    s.aura.indice.invalidar();
  };

  /**
   * Geometria e ficha mudaram: as auras podem ter ganhado ou perdido alguém.
   *
   * São gatilhos de infraestrutura, não "um hook por poder" — qualquer aura
   * futura reusa os mesmos três laços. O early-out sai antes de qualquer
   * trabalho quando não há nenhuma aura ligada na mesa.
   */
  const aoMexerNaCena = () => {
    if (!automacoesAtivas() || !s.aura.existeAlguma()) return;
    s.aura.agendarRecalculo();
  };

  // Token: só posição, tamanho, visibilidade e disposição mexem na área
  for (const evento of ['createToken', 'deleteToken']) Hooks.on(evento, aoMexerNaCena);
  Hooks.on('updateToken', (doc, mudancas) => {
    const relevante = ['x', 'y', 'elevation', 'hidden', 'disposition', 'width', 'height']
      .some((campo) => campo in mudancas);
    if (relevante) aoMexerNaCena();
  });

  // Movimento do v13 tem hook próprio, disparado depois que a posição é
  // aplicada. `updateToken` já cobre o caso normal; este é a garantia de que
  // nenhum caminho de movimento (arrastar, teclado, régua) fique de fora.
  Hooks.on('moveToken', () => aoMexerNaCena());

  // Parede: só importa para auras que respeitam linha de visão
  for (const evento of ['createWall', 'updateWall', 'deleteWall']) Hooks.on(evento, aoMexerNaCena);

  // Prévia da área ao passar o mouse: só desenho, roda em qualquer cliente.
  // Sem o early-out de existeAlguma() — aoPassarMouse limpa a prévia anterior
  // primeiro, mesmo que a aura tenha sido cancelada com o mouse ainda em cima.
  Hooks.on('hoverToken', (token, sobre) => {
    if (!automacoesAtivas()) return;
    try { s.aura.aoPassarMouse(token, sobre); }
    catch (err) { console.error(`${MODULE_ID} | Falha ao desenhar a prévia da aura`, err); }
  });

  // Efeito ativo: é o que faz o bônus acompanhar uma magia de atributo na fonte
  for (const evento of ['createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect']) {
    Hooks.on(evento, (efeito) => {
      if (efeito?.parent?.documentName === 'Actor') aoMexerNaCena();
    });
  }

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
    if (s.engenhocas.ehEngenhoca(item) && !buttons.some((b) => b.class === 't20g-aparatos')) {
      buttons.unshift({
        label: 'Aparatos',
        class: 't20g-aparatos',
        icon: 'fa-solid fa-gears',
        onclick: (ev) => {
          ev?.preventDefault?.();
          s.engenhocas.abrirAparatos(item);
        }
      });
    }
  });

  Hooks.on('renderActorSheet', (app, html) => {
    if (!automacoesAtivas()) return;
    try { s.engenhocas.injetarPainel(app, html); }
    catch (err) { console.error(`${MODULE_ID} | Falha ao montar o painel de engenhocas`, err); }
  });

  Hooks.on('renderChatMessageHTML', (message, html) => {
    if (!automacoesAtivas()) return;
    try {
      s.injetarControlesAutomacao(message, html);
      const container = html?.querySelector ? html : (html?.[0] ?? null);
      s.engenhocas.injetarBarra(message, container);
      s.engenhocas.ligarBotoesChat(message, container);
      if (container) s.aura.ligarBotoes(message, container);
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
      await s.aura.aoAvancarTurno(combate);

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
    if (ehMensagemDeCenaEncerrada(message)) {
      if (game.user.isGM && game.user === game.users.activeGM) {
        s.sugerirZerarContadores(
          game.i18n.localize('T20HaydGMTools.FimCenaManual')
        ).catch((err) =>
          console.error(`${MODULE_ID} | Falha ao sugerir zerar contadores`, err)
        );
      }
      // Roda em todos os clientes; a eleição de responsabilidade faz cada
      // ficha ser gravada exatamente uma vez, inclusive as dos jogadores.
      s.engenhocas.resetarSupressores().catch((err) =>
        console.error(`${MODULE_ID} | Falha ao resetar supressores`, err));
    }

    if (userId !== game.user.id) return;
    s.registrarMensagemRetroativa(message).catch((err) =>
      console.error(`${MODULE_ID} | Falha ao registrar mensagem retroativa`, err)
    );
  });

  Hooks.on('createItem', (item) => {
    invalidarIndices();
    s.engenhocas.aoMudarItem(item);
    if (item.actor) s.engenhocas.atualizarPaineis(item.actor);
    if (item.type === 'poder') item.actor?.sheet?.render(false);
  });

  /**
   * Contagens de Combinação e de Estudo vivem em flags do ATOR. Este hook roda
   * em todos os clientes para que a mesa inteira veja o número mudar, não só
   * quem clicou. Só repinta o que já está na tela — nada é gravado aqui.
   */
  Hooks.on('updateActor', (ator, mudancas) => {
    if (!automacoesAtivas()) return;

    // O bônus da aura é o Carisma da fonte AGORA. Mudou qualquer coisa do
    // sistema na ficha (magia de atributo, edição à mão, PV que entra na cura),
    // o valor pode ter mudado junto — sem isto ele só acertava no próximo
    // movimento de alguém. É barato: o recálculo é debounced e só o Mestre
    // trabalha.
    if (mudancas?.system) aoMexerNaCena();

    const flags = mudancas?.flags?.[MODULE_ID];
    if (!flags) return;
    if ('auras' in flags || `-=auras` in flags) {
      // Repinta antes de qualquer trabalho assíncrono: quem clicou precisa ver
      // o botão virar "Cancelar" na hora, não depois do recálculo do Mestre.
      s.atualizarBarrasAura(ator);
      s.aura.aoMudarEstado(ator).catch((err) =>
        console.error(`${MODULE_ID} | Falha ao processar estado da aura`, err));
    }

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
    s.engenhocas.resetarSupressores().catch((err) =>
      console.error(`${MODULE_ID} | Falha ao resetar supressores`, err));
  });

  Hooks.on('updateScene', (cena, mudancas) => {
    if (!automacoesAtivas() || mudancas.active !== true) return;
    s.sugerirZerarContadores(
      game.i18n.format('T20HaydGMTools.FimCenaTroca', { cena: cena.name })
    ).catch((err) => console.error(`${MODULE_ID} | Falha ao sugerir zerar contadores`, err));
    s.engenhocas.resetarSupressores().catch((err) =>
      console.error(`${MODULE_ID} | Falha ao resetar supressores`, err));
  });

  Hooks.on('updateItem', (item, mudancas, options, userId) => {
    invalidarIndices();
    s.engenhocas.aoMudarItem(item, mudancas);
    if (item.actor) s.engenhocas.atualizarPaineis(item.actor);
    const mudouAutomacao = foundry.utils.hasProperty(mudancas, `flags.${MODULE_ID}.automacao`)
      || foundry.utils.hasProperty(mudancas, `flags.${MODULE_ID}.-=automacao`);
    if (item.type === 'poder' && mudouAutomacao) item.actor?.sheet?.render(false);
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
    s.engenhocas.aoMudarItem(item);
    if (item.actor) s.engenhocas.atualizarPaineis(item.actor);
    if (item.type === 'poder') item.actor?.sheet?.render(false);
    if (!automacoesAtivas() || userId !== game.user.id) return;
    const ator = item.actor;
    if (!ator?.isOwner) return;
    s.aura.cancelarPorItem(ator, item.id).catch((err) =>
      console.error(`${MODULE_ID} | Falha ao encerrar aura do item apagado`, err));
    for (const efeito of s.efeitosDoItem(ator, item.id)) {
      efeito.delete().catch((err) =>
        console.error(`${MODULE_ID} | Falha ao remover efeito da automação`, err)
      );
    }
  });

  Hooks.on('canvasReady', () => {
    invalidarIndices();
    s.aura.aoTrocarCena(canvas?.scene?.id).catch((err) =>
      console.error(`${MODULE_ID} | Falha ao trocar a cena das auras`, err));
  });
}
