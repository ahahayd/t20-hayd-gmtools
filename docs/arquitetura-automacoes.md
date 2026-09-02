# Arquitetura das automações

Este documento registra os contratos internos usados para ampliar as
automações sem quebrar itens e mundos existentes.

## Estrutura

- `t20-hayd-automacoes.mjs`: fachada pública estável.
- `scripts/automacoes/motor.mjs`: orquestra os domínios ainda compartilhados.
- `catalogo.mjs`: definições declarativas das automações.
- `estado.mjs`: leitura normalizada de flags e definições.
- `runtime.mjs`: interruptor mundial e autoridade entre clientes.
- `indice-atores.mjs`: cache dos atores relevantes.
- `hooks.mjs`: único registro dos hooks globais das automações.
- `seta-infalivel.mjs`: análise e redistribuição dos projéteis.
- `golpe-pessoal/catalogo.mjs`: efeitos e progressões do construtor.

## Compatibilidade persistente

- O escopo das flags continua sendo `t20-hayd-gmtools`.
- As flags `automacao`, `contador`, `combinacoes`, `automacaoOrigem`,
  `combDebuff`, `condicoesDeCombinacao`, `msgRetroativa`, `golpe`,
  `estudarAdversario`, `auras`, `auraEfeito` e `auraCura` não devem ser
  renomeadas sem uma migração de mundo.
- `t20-hayd-automacoes.mjs` é a fachada pública e deve manter os exports já
  publicados.
- A API `module.api.automacoes` deve continuar compatível entre versões.

## Responsabilidade entre clientes

Hooks de documentos e combate rodam em todos os clientes. Gravações
automáticas de um ator passam por `souResponsavelPeloAtor`: primeiro um único
jogador proprietário ativo; depois o GM ativo; por fim um único GM ativo.

Alvos são estado local do usuário. Por isso o jogador proprietário tem
prioridade sobre o GM ao sincronizar efeitos dependentes de alvo.

## Desempenho

O índice de atores com Combinações é reconstruído somente quando itens mudam
ou uma cena é carregada. Atualizações de efeitos devem comparar o estado atual
antes de gravar, pois cada gravação gera banco, socket e nova preparação do
ator.

## Novas automações

Uma automação nova deve declarar seus tipos de item, efeitos e duração no
catálogo. Lógica especial deve ficar em um arquivo de domínio e ser chamada
pelo motor, sem criar hooks globais adicionais para cada poder.

Os testes em `tests/automacoes` cobrem os serviços puros. Casos ligados a
rolagens do Tormenta20 devem usar dados serializados de mensagens e efeitos,
sem depender de um mundo real.

## Auras

Uma aura é um efeito em raio que atinge aliados próximos. `scripts/automacoes/aura/`
guarda o domínio: `regras.mjs` é puro (raio, elegibilidade, cura, lembrete),
`alcance.mjs` tem a geometria, `estado.mjs` a flag na ficha, `efeitos.mjs` a escrita
nos aliados, `chat.mjs` as mensagens e `index.mjs` orquestra. A direção de import é
sempre motor → aura; `aura/*` nunca importa `motor.mjs`.

Não há prévia visual do raio no canvas: com diagonal dobrada a área real é um
losango, não um círculo, e um losango certo exigiria desenhar o polígono ou
destacar os quadrados afetados — nenhuma versão "aproximada" (círculo, por
exemplo) foi aceita, por mostrar uma área diferente da que o efeito realmente usa.

O efeito nos aliados leva `duration: { rounds: 999 }` só porque o T20 trata efeito
sem duração como passivo e não mostra ícone no token. O número não expira sozinho
em sessão nenhuma — quem tira o efeito continua sendo a geometria, ao sair da área
ou perder linha de visão (`sincronizarAura`), nunca a contagem de rodadas.

Raio e "paredes bloqueiam" são parâmetros do catálogo, não código: uma aura nova é
uma entrada com bloco `aura`. Ampliações e variações entram como `auraModificador`
na mesma ficha.

### Quem escreve

Os efeitos entram em fichas de OUTROS jogadores, o que só o Mestre pode fazer. O
estado fica numa flag do ator fonte (que o jogador possui e escreve) e o Mestre ativo
reage a ela. O canal de volta é o par `pedido`/`feito` na mesma flag — comparar os
dois é o que impede o `updateActor` de virar laço.

### Gatilhos de geometria

Três laços de hooks (token, parede, efeito ativo) são de infraestrutura, não "um hook
por poder": qualquer aura futura reusa os mesmos. Todos passam por um early-out que
sai antes de qualquer trabalho quando nenhuma aura está ligada, e por um debounce —
arrastar um token com vários aliados na área geraria uma rajada de escritas.

### Medição

A área da aura mede pela régua padrão do próprio Tormenta20: a grade REAL da cena
(`canvas.grid.measurePath`), com a diagonal dobrada de verdade — a mesma conta que
qualquer alcance de poder ou magia do sistema usa. Com diagonal dobrada, a área de
9 m não é um círculo: é um losango (mais longe nos eixos ortogonais, mais perto na
diagonal), visível em qualquer template nativo do Foundry sobre uma cena do T20.

Por isso `alcance.mjs` **não** usa `scripts/grade.mjs` (essa grade é espelhada SEM
diagonal dobrada, regra que vale só para a régua opcional, `t20-hayd-regua.mjs`) nem
distância reta em pixels — as duas dão uma área diferente da que o sistema realmente
usa para alcance.

### Posição: sempre `_source`

A animação de movimento do Foundry escreve as coordenadas interpoladas **dentro do
documento**, quadro a quadro (`Token##animateFrame` faz
`mergeObject(this.document, …)`). Logo `doc.x` no meio de um passo ainda é quase a
posição anterior, e qualquer conta feita ali sai atrasada: era o que fazia o bônus
entrar e sair só no movimento SEGUINTE. `posicaoGravada()` lê `_source`, que guarda
o destino já confirmado — mesma razão pela qual o pf2e lê `_source` em
`TokenDocument#bounds`. Vale para `getOccupiedGridSpaceOffsets`, `getCenterPoint` e
o teste de parede; `token.center` do placeable é derivado da posição animada e não
serve para mecânica.
