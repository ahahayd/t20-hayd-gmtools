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
  `estudarAdversario`, `auras`, `auraEfeito`, `auraCura`, `alvosDaRolagem`,
  `resistenciaResultado` e `engenhoca` não devem ser renomeadas sem uma
  migração de mundo.
- `t20-hayd-automacoes.mjs` é a fachada pública e deve manter os exports já
  publicados.
- A API `module.api.automacoes` deve continuar compatível entre versões.

## Responsabilidade entre clientes

Hooks de documentos e combate rodam em todos os clientes. Gravações
automáticas de um ator passam por `souResponsavelPeloAtor`: primeiro um único
jogador proprietário ativo; depois o GM ativo; por fim um único GM ativo.

Alvos são estado local do usuário. Por isso o jogador proprietário tem
prioridade sobre o GM ao sincronizar efeitos dependentes de alvo.

E por isso mesmo o alvo de uma rolagem é gravado NA MENSAGEM
(`marcarAlvosDaRolagem`, no `preCreateChatMessage`): `game.user.targets` é a
mira de quem LÊ o cartão, não a de quem rolou — sem a marca, o Mestre abrindo
o ataque de um jogador via a própria seleção (quase sempre vazia) e a barra de
Combinações/Estudo saía "sem alvo" justamente para quem mais precisa dela.
Só os IDs são guardados; o nome é resolvido ao desenhar, para o metagame
continuar decidindo quem lê o quê. `alvosDaBarra` lê exclusivamente esse
retrato persistido: mudar a mira não altera cartões antigos. O autor da
rolagem e o Mestre recebem um botão para substituir o retrato pelo único token
mirado naquele momento, o que também permite definir o alvo que faltou. O botão
segue o mesmo contrato tanto na barra de Combinações quanto na de Estudar o
Adversário. Essa troca migra os registros `msgRetroativa` pertencentes ao
cartão e recalcula o dano com a contagem do novo oponente imediatamente; os
cliques seguintes de Combinação, portanto, continuam atualizando o cartão
contra esse novo alvo.
Uma rolagem sem alvo também guarda explicitamente `tokens: []`: nesse estado
Combinações, Estudar o Adversário e registros retroativos usam bônus zero, sem
procurar a maior contagem existente. Antes de qualquer `Item.roll`, uma
sincronização curta fecha a corrida entre desmarcar o último token e o sistema
copiar os efeitos para a rolagem, inclusive quando o diálogo de uso é pulado.

Corrigir uma mensagem já postada (o dano retroativo do Boca do Estômago) exige
permissão NELA, não na ficha: quem clica no "+" pode ser outro dono do
personagem, sem poder editar o cartão alheio. `podeCorrigirMensagem` elege um
único responsável — o autor enquanto estiver conectado, o Mestre ativo quando
não estiver — e o hook de `updateActor` chama `corrigirRetroativasDoAtor` em
todos os clientes, para que a correção não dependa de quem clicou. Dentro das
ações de contagem, essa correção vem ANTES de sincronizar efeitos e debuffs:
é o número que a mesa está olhando, e as escritas de efeito não mudam nada na
tela.

## Painel de contadores

`injetarPainelContadores` adiciona **Gerenciar contadores** antes da lista
nativa da aba Efeitos, somente para proprietários da ficha e Mestres. O painel
deriva suas linhas das automações que o ator realmente possui e cobre quatro
armazenamentos sem criar flags novas: `contador` nos itens comuns, `contador`
no Golpe Pessoal com Sequencial, `combinacoes` no ator por token e
`estudarAdversario` no ator por token. Alvos atualmente mirados também entram
na lista com valor zero, para permitir criar uma contagem ainda não registrada.

Edições são valores absolutos e passam pelos mesmos sincronizadores das ações
do chat. Campos intocados não são escritos. Em particular,
`definirCombinacao` chama `atualizarMensagensRetroativas` antes dos efeitos,
para que uma correção manual também reescreva o dano do Boca do Estômago;
contadores comuns, Estudo e Sequencial repintam suas respectivas barras.

## Desempenho

O índice de atores com Combinações é reconstruído somente quando itens mudam
ou uma cena é carregada. Atualizações de efeitos devem comparar o estado atual
antes de gravar, pois cada gravação gera banco, socket e nova preparação do
ator.

## Novas automações

Uma automação nova deve declarar seus tipos de item, efeitos e duração no
catálogo. Lógica especial deve ficar em um arquivo de domínio e ser chamada
pelo motor, sem criar hooks globais adicionais para cada poder.

Ao adicionar uma automação, decida se ela leva `apagarEfeitos: true`: essa
marca vale para automações que **substituem por completo** a mecânica do poder,
tornando os Efeitos Ativos do próprio item (passivos e de uso do compêndio)
redundantes ou conflitantes. Ao ligar a automação, o motor
(`sugerirApagarEfeitosOriginais`) mostra a lista desses efeitos e oferece
apagá-los — sempre opt-in, nunca automático. Não confundir com os efeitos que o
módulo cria na ficha do ator (`sincronizarEfeito`): esses vivem no ator, não no
item, e não entram nessa limpeza.

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

## Teste de Resistência automático

`scripts/automacoes/resistencia.mjs` guarda só a parte pura: reconhecer
Reflexos/Fortitude/Vontade no texto livre de `system.resistencia.txt`
(`testesCitados`) e comparar total contra CD (`passouNoTeste`). A integração
mora em `motor.mjs` porque é pequena (no molde de `estudar-adversario.mjs`,
que também não tem arquivo de integração próprio).

Não é uma automação configurável — não usa a flag `automacao`, não aparece no
seletor. É inferida direto do texto, igual ao Engenhoqueiro ser inferido de
`system.tipo === "eng"`: qualquer magia ou poder com uma das três palavras no
texto de resistência ganha o botão sozinho. Por isso `injetarBotaoResistencia`
é uma função própria, chamada direto em `hooks.mjs` — se ela dependesse do
early-return de `injetarControlesAutomacao` (que corta cedo quando o item não
tem contador/combinação/estudo configurado), uma Bola de Fogo comum nunca
ganharia o botão.

Ao localizar a habilidade que originou o cartão, `atorDoCard` dá prioridade ao
ator do token registrado em `message.speaker` e só usa o `actorId` do cartão
como fallback. A ordem é essencial para ameaças em tokens não vinculados: o
ator-base pode existir em `game.actors`, mas a habilidade usada ou suas
alterações podem viver somente no ator sintético daquele token.

O botão rola nos tokens **selecionados no canvas** (`canvas.tokens.controlled`),
não nos **mirados** (`game.user.targets`) — é outro conceito, já usado por
Combinações/Estudo. O fluxo pensado é o Mestre selecionar os inimigos
atingidos por uma área e clicar uma vez para todos. Sem nada selecionado, cai
para `game.user.character` (o personagem vinculado do próprio usuário) — é o
caminho comum do jogador, que raramente seleciona o próprio token só para
reagir a um teste. Pedir para selecionar um token é o ÚLTIMO recurso, só
quando nem isso existe.

O botão entra logo depois do **último elemento nativo** do cartão
(`ultimoElementoNativo`: o último filho que NÃO é um `.t20g-auto-barra`) —
tipicamente o footer do "Colocar Área de Efeito" ou o de aplicar efeito — e
NUNCA no fim do cartão, junto das automações específicas de item (Aparatos,
contadores…), que não têm nenhuma relação com isto. Pela mesma razão, ele usa
`font: inherit` em vez do `0.85em` fixo dos outros botões largos do módulo: o
botão nativo ao lado não define fonte própria nenhuma, e um tamanho diferente
destoaria bem ali.

Cada token ganha a própria rolagem via `actor.rollPericia(chave, { event })`,
repassando o EVENTO DE CLIQUE de verdade — é o `shiftKey` dele que decide,
dentro do próprio sistema, se abre a janela de uso ou rola direto, a mesma
regra que qualquer perícia do jogador já segue. Reimplementar essa checagem
aqui divergiria da rolagem normal assim que o mundo mudasse a configuração
`UsageConfig`. As chamadas não são `await`adas em sequência — saem juntas via
`Promise.all`, para as janelas de vários alvos aparecerem ao mesmo tempo, não
uma depois da outra fechar.

`rollPericia` devolve a própria `ChatMessage` criada (quando não é cancelada),
então não precisa nenhum registro de "pendências" para saber qual rolagem
pertence a qual teste: o resultado chega direto no retorno da própria chamada,
sem precisar casar mensagens por hook depois.

O veredito (bateu ou não a CD) é escrito no cartão da rolagem com
`data-gm-only="1"` e escondido do DOM de quem não é Mestre no mesmo
`renderChatMessageHTML` que já injeta os botões — mesmo mecanismo que o
metagame usa para esconder segredo de rolagem, aplicado aqui incondicionalmente
(não depende de nenhuma configuração de metagame estar ligada).

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
