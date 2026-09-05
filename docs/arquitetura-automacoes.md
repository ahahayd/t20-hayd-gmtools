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
  `estudarAdversario`, `auras`, `auraEfeito`, `auraCura` e `engenhoca` não devem ser
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

## Engenhocas

`scripts/automacoes/engenhocas/` mantém o catálogo de Aparatos, as regras puras
de CD/estado e a integração. Engenhoca não ocupa a flag `automacao` da magia:
ela é ativada pela presença do poder Engenhoqueiro automatizado e pelo tipo
nativo `system.tipo === "eng"`. Assim uma magia preserva uma automação própria,
como Seta Infalível, simultaneamente.

A flag `engenhoca` do item guarda o custo original (o custo visível fica zero),
contagem diária, enguiço, perícia e Aparatos. Nunca derive o custo original do
zero preparado sem consultar essa flag.

O domínio injeta somente os botões **Painel de Engenhocas** e **Resetar
engenhocas** antes da lista nativa de magias nas fichas normal e em abas. O
painel completo abre em uma janela, agrupado por círculo, e usa classes próprias
(não imita linhas `.item`) para não receber listeners nem regras de layout do
sistema ou do `t20-hayd-ui`.

A engenhoca conjura SEMPRE, sucesso ou falha do teste — só o enguiço muda.
Conjurar apenas no sucesso exigia corrigir uma falha chamando `item.roll()` de
novo, e uma segunda chamada reabre o diálogo nativo do zero: os aparatos
aplicados na primeira rolagem (Estimulador de Sobrecarga, Estabilizador…) não
sobrevivem a um segundo diálogo. Com uma rolagem só, `aplicarEfeitosDosAparatos`
roda uma vez, sempre, e nada se perde.

O cartão do teste guarda a CD e o resultado, com um botão que sempre oferece o
resultado OPOSTO ao atual — **Transformar em sucesso** ou **em falha**, uma
correção manual do Mestre, não detecção de rerrolagem. Os dois só corrigem
CD/enguiço retroativamente (`corrigirFalhaParaSucesso`/`corrigirSucessoParaFalha`
em `regras.mjs`) — nenhum rola nada de novo, porque a conjuração já aconteceu.
O cartão da MAGIA em si (não o do teste) recebe uma marca visual simples quando
vem de um teste que falhou (`marcarConjuracaoFalhou`/`desmarcarConjuracaoFalhou`),
já que a magia é idêntica à de um sucesso fora isso.

A CD de resistência de uma magia (Estabilizador) não aparece em `system.
resistencia.cd` em NENHUM template — o cartão mostra `labels.header`, uma
string tipo "Resistência: Vontade (CD 15);" já montada em `_prepareLabels()`
antes do aparato entrar em jogo. Mutar o número sem chamar `item._prepareLabels()`
de novo deixa o cartão com a CD antiga.

O Supressor de Segurança não trava sozinho por já ter sido usado na cena —
`depoisDaTentativa` confia no `usarSupressor` que recebe, sem checar
`supressorUsado`. O checkbox em `escolherPericia` nunca fica desabilitado,
só desmarcado por padrão quando `supressorUsado` já é verdadeiro: "uma vez
por cena" é sugestão da UI, não trava imposta pela regra pura — o Mestre
pode marcar de novo de propósito e o Supressor age de novo.

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

Um ator nunca pode ficar com dois efeitos da MESMA aura. Arrastar a fonte por mais
tempo que o debounce de `agendarRecalculo` (100ms) disparava um novo `recalcular()`
antes do anterior terminar de gravar — duas sincronizações correndo ao mesmo tempo
podiam cada uma ver "este aliado ainda não tem o efeito" e criar um cada, dobrando o
bônus. `dispararRecalculo`, em `aura/index.mjs`, agora serializa isso: enquanto uma
rodada está em `_executando`, a próxima só fica pendente e roda depois, nunca em
paralelo. Como segunda trava — a real garantia, não só a causa raiz corrigida —
`efeitosDaAura`, em `efeitos.mjs`, agrupa por ator antes de qualquer diff e apaga
toda duplicata que encontrar, mantendo só uma; mesmo que uma corrida diferente
volte a criar duas, a sincronização seguinte (chamada com muita frequência) desfaz
sozinha.

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
