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
  `combDebuff`, `condicoesDeCombinacao`, `msgRetroativa` e `golpe` não devem
  ser renomeadas sem uma migração de mundo.
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
