export const AUTOMACOES = {
  'sangue-dos-inimigos': {
    categoria: 'barbaro',
    nome: 'Sangue dos Inimigos',
    fonte: 'Livro Básico',
    icone: 'fa-solid fa-droplet',
    tipos: ['poder'],
    resumo:
      'Enquanto está em fúria, ao fazer um acerto crítico ou reduzir um inimigo a 0 PV, '
      + 'você recebe um bônus cumulativo de +1 em testes de ataque e rolagens de dano, '
      + 'limitado pelo seu nível, até o fim da cena.',
    comoUsar:
      'Os botões de aumentar e diminuir ficam nos cartões de ataque; o de zerar, no cartão '
      + 'do próprio poder.',
    contador: {
      rotulo: 'Bônus acumulado',
      limite: (ator) => Number(ator?.system?.attributes?.nivel?.value) || 1,
      limiteTexto: 'o nível total do personagem',
      efeitoTexto: [
        'Bônus igual ao acumulado em <b>testes de ataque e rolagens de dano</b>.',
      ],
      // attack = armas, power = poderes, spell = magias (o bônus de dano
      // também vale para o dano de magias)
      alvos: { attack: true, power: true, spell: true },
      changes: (n) => [
        { key: 'ataque', mode: 2, value: String(n), priority: 20 },
        { key: 'dano', mode: 2, value: String(n), priority: 20 }
      ]
    }
  },

  sanguinario: {
    categoria: 'combate',
    nome: 'Sanguinário',
    fonte: 'Heróis de Arton',
    icone: 'fa-solid fa-khanda',
    tipos: ['poder'],
    resumo:
      'Sempre que você causar 10 ou mais pontos de dano em um ou mais inimigos, recebe um '
      + 'bônus cumulativo de +1 em rolagens de dano até o fim da cena (limitado pela sua Força).',
    comoUsar:
      'Os botões de aumentar e diminuir ficam nos cartões de ataque; o de zerar, no cartão '
      + 'do próprio poder.',
    contador: {
      rotulo: 'Bônus acumulado',
      limite: (ator) => Number(ator?.system?.atributos?.for?.value) || 1,
      limiteTexto: 'a Força do personagem',
      duracao: 'cena',
      alvos: { attack: true, power: true, spell: true },
      changes: (n) => [{ key: 'dano', mode: 2, value: String(n), priority: 20 }]
    }
  },

  'sequencia-de-golpes': {
    categoria: 'combate',
    nome: 'Sequência de Golpes',
    fonte: 'Heróis de Arton',
    icone: 'fa-solid fa-hand-fist',
    tipos: ['poder'],
    resumo:
      'Você desfere uma tempestade de golpes, usando a força de um movimento para impulsionar '
      + 'o outro, sem dar chance para sua vítima reagir. Quando você acerta um ataque corpo a '
      + 'corpo em uma criatura, recebe um bônus cumulativo de +1 em testes de ataque e rolagens '
      + 'de dano contra a mesma criatura nesse turno (limitado pela sua Força).',
    comoUsar:
      'Os botões de aumentar e diminuir ficam nos cartões de ataque. O contador zera sozinho '
      + 'quando seu turno acaba.',
    contador: {
      rotulo: 'Bônus acumulado',
      limite: (ator) => Number(ator?.system?.atributos?.for?.value) || 1,
      limiteTexto: 'a Força do personagem',
      // Vale só até o fim do turno de quem acertou os golpes
      duracao: 'turno',
      nota: 'O bônus vale contra a criatura que você vem acertando — atacando outra, '
        + 'desmarque o efeito na janela de rolagem.',
      alvos: { attack: true, power: true },
      changes: (n) => [
        { key: 'ataque', mode: 2, value: String(n), priority: 20 },
        { key: 'dano', mode: 2, value: String(n), priority: 20 }
      ]
    }
  },

  'estudar-o-adversario': {
    categoria: 'combate',
    nome: 'Estudar o Adversário',
    fonte: 'Heróis de Arton',
    icone: 'fa-solid fa-magnifying-glass',
    tipos: ['poder'],
    resumo:
      'Na primeira vez na rodada em que erra um ataque, você recebe um bônus cumulativo de +2 '
      + 'em testes de ataque contra o mesmo alvo até o fim da cena. Pré-requisito: Int 1.',
    comoUsar:
      'Mire o oponente e use o botão de aumentar nos cartões de ataque quando errar. A contagem '
      + 'é separada por inimigo e dura até o fim da cena.',
    estudo: {
      rotulo: 'Estudo',
      // Cada ponto vale +2 no acerto; o dano não muda.
      alvos: { attack: true, power: true },
      changes: (n) => (n > 0
        ? [{ key: 'ataque', mode: 2, value: String(n * 2), priority: 20 }]
        : [])
    }
  },

  'sede-sanguinaria': {
    categoria: 'barbaro',
    nome: 'Sede Sanguinária',
    fonte: 'Heróis de Arton',
    icone: 'fa-solid fa-heart-pulse',
    tipos: ['poder'],
    resumo:
      'Enquanto está em fúria, quando faz um acerto crítico ou reduz um inimigo a 0 PV '
      + 'ou menos, você recupera 10 PV e 2 PM.',
    comoUsar: 'O botão de recuperar fica nos cartões de ataque e no cartão do poder.',
    acao: {
      rotulo: 'Recuperar PV e PM',
      icone: 'fa-solid fa-heart-pulse',
      pv: 10,
      pm: 2
    }
  },

  'seta-infalivel': {
    categoria: 'magia',
    nome: 'Seta Infalível de Talude',
    fonte: 'Livro Básico',
    icone: 'fa-solid fa-bolt',
    tipos: ['magia'],
    resumo:
      'Lança duas setas de energia que causam 1d4+1 pontos de dano de essência cada. '
      + 'Você pode lançar as setas em alvos diferentes ou concentrá-las num mesmo alvo. '
      + 'Caso possua um bônus no dano de magias, como pelo poder Arcano de Batalha, ele é '
      + 'aplicado em apenas uma seta (o bônus vale para a magia, não para cada alvo).',
    comoUsar:
      'Role a magia normalmente. No cartão do chat, use <b>Distribuir setas</b> para escolher '
      + 'em quantos alvos elas vão e o que cada um recebe.',
    distribuicao: {
      rotulo: 'Distribuir setas',
      // O "+1" que cada seta/lança causa além do dado — acompanha sempre a
      // própria seta, nunca é tratado como bônus avulso.
      porProjetil: 1,
      nomeProjetil: 'Seta',
      nomeProjetilPlural: 'setas'
    }
  },

  'golpe-pessoal': {
    categoria: 'guerreiro',
    nome: 'Golpe Pessoal',
    fonte: 'Livro Básico e Heróis de Arton',
    icone: 'fa-solid fa-burst',
    tipos: ['poder'],
    resumo:
      'Quando faz um ataque, você pode desferir seu Golpe Pessoal, uma técnica única, com '
      + 'efeitos determinados por você. Cada efeito tem um custo; a soma deles é o custo do '
      + 'Golpe Pessoal (mínimo 1 PM). O golpe só pode ser usado com uma arma específica, e você '
      + 'não pode gastar mais PM em golpes pessoais numa mesma rodada do que seu limite de PM.',
    comoUsar:
      'No cartão do poder, use <b>Montar Golpe Pessoal</b> para escolher os efeitos. O módulo '
      + 'cria um único efeito de uso, "Golpe Pessoal: nome do golpe", que aparece na janela de '
      + 'rolagem da arma com o custo já somado.',
    // O construtor mora em GP_EFEITOS; aqui só marcamos o tipo da automação.
    golpe: true
  },

  /* --- Combinações Desarmadas (Lutador) --------------------------------- */
  ...montarCombinacoes()
};

/**
 * Poderes de Combinação do Lutador.
 *
 * Todos compartilham a mesma contagem (individual por oponente) e viram
 * efeitos de uso SUSPENSOS — aparecem na janela de rolagem com o custo em PM,
 * mas desmarcados, para o jogador escolher qual combinação está usando.
 *
 * `changes(n)` recebe a contagem atual e devolve as mudanças do efeito; quando
 * a combinação não altera a própria rolagem (efeitos no oponente, bônus de
 * Defesa depois do acerto), a lista vem vazia e o efeito serve de lembrete
 * com o custo certo.
 */
function montarCombinacoes() {
  const base = {
    categoria: 'lutador',
    fonte: 'Heróis de Arton',
    icone: 'fa-solid fa-hand-fist',
    tipos: ['poder']
  };


  const poderes = {
    'combinacao-boca-do-estomago': {
      nome: 'Combinação: Boca do Estômago',
      custo: 1,
      resumo:
        'Gaste 1 PM para que o golpe seja debilitante. Se acertar, você recebe um bônus na '
        + 'rolagem de dano igual à sua contagem de combinações e o oponente fica enjoado até '
        + 'o fim do seu próximo turno.',
      automatiza: [
        'Soma a contagem no dano.',
        'Botão para deixar o alvo enjoado.'
      ],
      manual: [],
      // O termo é emitido SEMPRE, inclusive com contagem 0: é ele que a
      // correção retroativa reescreve depois. Sem o "+0" na rolagem não há
      // o que corrigir, e o dano ficaria preso quando a contagem começa do zero.
      changes: (n) => [{ key: 'dano', mode: 2, value: String(n), priority: 20 }],
      // O bônus vale a contagem DEPOIS do acerto, e a contagem só sobe quando
      // o acerto acontece — então a última mensagem se corrige sozinha.
      retroativo: true,
      efeitoAlvo: {
        alvo: 'oponente',
        rotulo: 'Deixar o alvo enjoado',
        icone: 'fa-solid fa-face-dizzy',
        dica: 'Aplica a condição enjoado no oponente mirado, até o fim do seu próximo turno.',
        condicoes: ['enjoado'],
        rodadas: 1,
        changes: () => []
      }
    },
    'combinacao-chute-circular': {
      nome: 'Combinação: Chute Circular',
      custo: 2,
      resumo:
        'Gaste 2 PM para que o golpe seja giratório. Se acertar, para cada ponto em sua '
        + 'contagem de combinações você causa +1d6 pontos de dano. Além disso, pode fazer uma '
        + 'manobra empurrar contra o mesmo oponente como ação livre.',
      automatiza: ['Soma 1d6 de dano para cada ponto da contagem.'],
      manual: ['A manobra empurrar é feita à parte, com o resultado do ataque.'],
      // Com contagem 0 entra um "+0" no lugar dos dados: é o marcador que a
      // correção retroativa converte em Nd6 quando a contagem sobe.
      changes: (n) => [{ key: 'dano', mode: 2, value: n > 0 ? `${n}d6` : '0', priority: 20 }],
      retroativo: { dados: 6 }
    },
    'combinacao-quebra-guarda': {
      nome: 'Combinação: Quebra-guarda',
      custo: 1,
      resumo:
        'Gaste 1 PM para que o golpe supere defesas: recebe um bônus no teste de ataque igual '
        + 'à sua contagem de combinações. Se acertar, o oponente não pode usar habilidades para '
        + 'reduzir o dano ou receber RD adicional, e fica vulnerável até o fim do seu próximo turno.',
      automatiza: [
        'Soma a contagem no teste de ataque.',
        'Botão para deixar o alvo vulnerável.'
      ],
      manual: ['Barrar as habilidades do alvo que reduzem dano fica com o Mestre.'],
      changes: (n) => (n > 0 ? [{ key: 'ataque', mode: 2, value: String(n), priority: 20 }] : []),
      efeitoAlvo: {
        alvo: 'oponente',
        rotulo: 'Deixar o alvo vulnerável',
        icone: 'fa-solid fa-shield-slash',
        dica: 'Aplica a condição vulnerável no oponente mirado, até o fim do seu próximo turno.',
        condicoes: ['vulneravel'],
        rodadas: 1,
        changes: () => []
      }
    },
    'combinacao-tecnica-de-sacrificio': {
      nome: 'Combinação: Técnica de Sacrifício',
      custo: 1,
      resumo:
        'Gaste 1 PM para que o ataque seja um movimento de projeção: faça uma manobra agarrar '
        + 'com um bônus igual à sua contagem de combinações. Vencendo, você agarra o oponente e '
        + 'ambos caem — mas ele sofre dano como se você tivesse acertado um ataque desarmado.',
      automatiza: [
        'Soma a contagem no teste da manobra.',
        'Botão para deixar o alvo caído.'
      ],
      manual: ['Você também fica caído — aplique em si mesmo.'],
      changes: (n) => (n > 0 ? [{ key: 'ataque', mode: 2, value: String(n), priority: 20 }] : []),
      efeitoAlvo: {
        alvo: 'oponente',
        rotulo: 'Derrubar o alvo',
        icone: 'fa-solid fa-person-falling-burst',
        dica: 'Aplica a condição caído no oponente mirado.',
        condicoes: ['caido'],
        rodadas: 1,
        changes: () => []
      }
    },
    'combinacao-esquiva-tecnica': {
      nome: 'Combinação: Esquiva Técnica',
      custo: 2,
      resumo:
        'Uma vez por rodada, ao sofrer um ataque corpo a corpo, gaste 2 PM para fazer um teste '
        + 'de Reflexos oposto ao teste de Percepção do atacante, com um bônus igual à sua '
        + 'contagem de combinações. Vencendo, você evita o ataque e recebe +5 no próximo ataque '
        + 'desarmado contra ele nessa rodada.',
      automatiza: [
        'Soma a contagem no teste de Reflexos.',
        'Traz também um efeito sem custo com o +5 no próximo ataque desarmado.'
      ],
      manual: [],
      // Perícias usam a chave "roll"; o efeito é restrito a Reflexos
      alvosExtra: { skill: true },
      itens: 'Reflexos',
      changes: (n) => (n > 0 ? [{ key: 'roll', mode: 2, value: String(n), priority: 20 }] : []),
      // Efeito extra do mesmo poder: aparece nos ataques, sem custo em PM
      efeitosExtra: [{
        sufixo: 'contra-ataque',
        nome: 'Esquiva Técnica: +5 no ataque',
        custo: 0,
        alvos: { attack: true, power: true },
        changes: () => [{ key: 'ataque', mode: 2, value: '5', priority: 20 }]
      }]
    },
    'combinacao-chute-no-joelho': {
      nome: 'Combinação: Chute no Joelho',
      custo: 1,
      resumo:
        'Gaste 1 PM para que o golpe seja um chute baixo cruel. Se acertar, até o fim do seu '
        + 'próximo turno o oponente fica lento e sofre uma penalidade em testes de ataque e '
        + 'rolagens de dano igual à sua contagem de combinações.',
      automatiza: [
        'Botão para deixar o alvo lento e aplicar nele a penalidade em ataque e dano '
        + 'igual à contagem.'
      ],
      manual: [],
      changes: () => [],
      efeitoAlvo: {
        alvo: 'oponente',
        rotulo: 'Aplicar lentidão e penalidade',
        icone: 'fa-solid fa-person-falling',
        dica: 'Deixa o oponente lento e aplica a penalidade de ataque/dano igual à contagem.',
        condicoes: ['lento'],
        rodadas: 1,
        // Valores CONCRETOS: o sistema resolve os modificadores na preparação
        // do ator e guarda o número pronto, então uma fórmula com @ ficaria
        // congelada. O módulo reescreve o efeito quando a contagem muda.
        changes: (n) => (n > 0
          ? [
            { key: 'system.modificadores.pericias.ataque', mode: 2, value: `-${n}`, priority: 20 },
            { key: 'system.modificadores.dano.geral', mode: 2, value: `-${n}`, priority: 20 }
          ]
          : [])
      }
    },
    'combinacao-um-dois': {
      nome: 'Combinação: Um-Dois',
      custo: 1,
      resumo:
        'Gaste 1 PM para atacar de vários lados: você não precisa de um aliado para flanquear '
        + '(faz isso sozinho). Se acertar, recebe um bônus na Defesa igual à sua contagem de '
        + 'combinações até o fim do seu próximo turno.',
      automatiza: ['Botão para receber o bônus de Defesa igual à contagem.'],
      manual: ['Flanquear sozinho é narrativo, sem ajuste na ficha.'],
      changes: () => [],
      efeitoAlvo: {
        alvo: 'proprio',
        rotulo: 'Receber o bônus de Defesa',
        icone: 'fa-solid fa-shield-halved',
        dica: 'Aplica em você o bônus de Defesa igual à contagem, até o fim do seu próximo turno.',
        condicoes: [],
        rodadas: 1,
        changes: (n) => (n > 0
          ? [{ key: 'system.attributes.defesa.bonus', mode: 2, value: String(n), priority: 20 }]
          : [])
      }
    }
  };

  const catalogo = {};
  for (const [id, p] of Object.entries(poderes)) {
    catalogo[id] = {
      ...base,
      nome: p.nome,
      resumo: p.resumo,
      comoUsar:
        `Custa ${p.custo} PM. Mire o oponente e marque este efeito na janela de rolagem. `
        + 'Veja a página <b>Combinações Desarmadas</b> no diário.',
      combinacao: {
        custo: p.custo,
        changes: p.changes,
        alvosExtra: p.alvosExtra ?? null,
        itens: p.itens ?? null,
        efeitoAlvo: p.efeitoAlvo ?? null,
        efeitosExtra: p.efeitosExtra ?? [],
        retroativo: p.retroativo ?? false,
        automatiza: p.automatiza,
        manual: p.manual
      }
    };
  }

  catalogo['mestre-das-combinacoes'] = {
    ...base,
    nome: 'Mestre das Combinações',
    resumo:
      'Sua contagem de combinações aumenta em +2 (em vez de +1) para cada ataque de Combinação '
      + 'diferente com o qual você acertar o oponente.',
    comoUsar: 'Ligue no poder e o botão de aumentar a contagem passa a somar 2.',
    marcador: 'incremento2'
  };

  return catalogo;
}
