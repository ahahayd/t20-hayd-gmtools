# T20 Hayd GMTools

Ferramentas de Mestre para o sistema **Tormenta20** no FoundryVTT: oculta dos jogadores os detalhes das rolagens e habilidades das criaturas do Mestre, permite rerolar ou inserir resultados manualmente pelo chat e adiciona um assistente completo de definição de atributos iniciais dos personagens.

## Requisitos

- FoundryVTT **v13**
- Sistema **Tormenta20**
- *(Opcional)* **Dice So Nice** — para ocultar também a animação 3D dos dados das criaturas do Mestre

## Instalação

Em *Configurar → Módulos Complementares → Instalar Módulo*, cole a URL do manifesto:

```
https://github.com/ahahayd/t20-hayd-gmtools/releases/latest/download/module.json
```

## Como usar

### Ocultar detalhes das criaturas do Mestre

Funciona automaticamente após ativar o módulo. Rolagens de NPCs, Perigos e Coadjuvantes mostram o total, mas mascaram a fórmula (`1d20+?`, dano `?`), o breakdown e o destaque de crítico; cards de magias e poderes escondem descrição, aprimoramentos e CD. Donos e observadores da criatura continuam vendo tudo, e personagens jogadores nunca são afetados.

### Rerolar e inserir resultados

Clique com o botão direito em uma mensagem de rolagem no chat para **rerolar** (mantendo todos os bônus, sem cobrar mana de novo) ou **inserir manualmente** o resultado do dado — útil para poderes que permitem escolher a rolagem. Em cards de arma, ataque e dano são tratados separadamente, e se o ataque virar (ou deixar de ser) um crítico, o dano é recalculado sozinho. Rolagens alteradas ganham um símbolo (⟳ ou ✋) com o resultado anterior riscado.

### Definição de atributos

Um botão nas configurações do personagem abre o assistente de atributos iniciais, com todos os métodos: **compra por pontos** (com pontos variados), **rolagens do Livro Básico** e as variantes do **Heróis de Arton** (Clássica e Épica, p. 280; Valkaria e Nimb, p. 281 — com rolagem individual de cada dado) e o **arranjo de Khalmyr**. O assistente escreve apenas os valores base; o bônus racial continua por sua conta.

### Configurações

Em *Configurar → Configurações → T20 Hayd GMTools*, o Mestre define se jogadores podem rerolar/inserir resultados nas próprias rolagens, o método de atributos padrão da campanha (destacado no assistente), os pontos sugeridos e as tabelas de custo/conversão personalizadas.

## Detalhes adicionais

- Personagens recém-criados exibem o ícone de definição de atributos com um brilho pulsante até a primeira definição.
- O Mestre sempre pode rerolar e inserir resultados, independentemente das permissões dos jogadores.

## Aviso

Módulo não oficial, criado por fã, sem afiliação com a Jambô Editora ou com os autores de Tormenta20.
