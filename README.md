# T20 Hayd GMTools

Ferramentas de Mestre para o sistema **Tormenta20** no **FoundryVTT v13**. Oculta automaticamente dos jogadores os detalhes das rolagens e habilidades de criaturas controladas pelo Mestre.

## O que faz

Quando uma rolagem ou ficha vem de um ator do tipo **NPC**, **Perigo** (`hazard`) ou **Coadjuvante** (`simple`), o módulo esconde dos jogadores:

- **Modificadores das rolagens** — o total do dado continua visível, mas a fórmula é mascarada: ataques mostram `1d20+?` e o dano mostra apenas `?`. O breakdown (tooltip) e o destaque de crítico/falha também são ocultados.
- **Descrição e CD de magias e poderes** — os cards de magia/poder no chat têm a descrição, os aprimoramentos e o número da CD (`CD ?`) ocultados; o clique para reexpandir é bloqueado.
- **Animação dos dados (Dice So Nice)** — se instalado, a rolagem 3D da criatura não é exibida para os jogadores (o Mestre vê normalmente).

Quem é **dono ou observador** da criatura continua vendo tudo. Fichas e rolagens de personagens jogadores nunca são afetadas.

### Rerolar e escolher resultados

Clicando com o botão direito em uma mensagem de rolagem no chat:

- **Rerolar resultado** — em testes de perícia/atributo, re-rola os dados mantendo todos os bônus (perícia, atributos, situacionais). O custo de mana **não** é cobrado de novo.
- **Rerolar ataque** / **Rerolar dano** — em cards de arma (que têm o teste de ataque e a rolagem de dano), cada fórmula pode ser rerolada **separadamente**.
- **Inserir resultado** — define manualmente o resultado natural do(s) dado(s), dentro da faixa válida (para poderes que permitem escolher a rolagem por uma condição especial). Bônus e modificadores são mantidos e o total é recalculado. Em armas, o ataque e o dano têm inserção separada.

Uma rolagem alterada ganha um **símbolo** ao lado do novo total e mostra o(s) **resultado(s) anterior(es) riscado(s)** — ⟳ para rerolagem e ✋ para resultado inserido manualmente. O símbolo herda a cor de destaque do t20-hayd-ui (quando ativo) para não se confundir com o fundo.

## Como usar

Ocultar detalhes das criaturas do Mestre funciona automaticamente após ativar o módulo. Para rerolar, inserir um resultado ou revelar/reocultar uma fórmula, **clique com o botão direito na mensagem do chat**.

## Configurações

Em *Configurar → Configurações → T20 Hayd GMTools* (escopo do mundo — o Mestre pode sempre rerolar/inserir):

| Configuração | Padrão | Descrição |
|---|---|---|
| Jogadores podem rerolar | Ligado | Permite que jogadores rerolem os resultados das **próprias** rolagens. |
| Jogadores podem inserir resultado manual | Ligado | Permite que jogadores definam manualmente o resultado do dado das **próprias** rolagens. |

## Requisitos

- FoundryVTT **v13**
- Sistema **Tormenta20**
- *(Opcional)* **Dice So Nice** para ocultar também a animação 3D dos dados

## Instalação

Em *Configurar → Módulos Complementares → Instalar Módulo*, cole a URL do manifesto:

```
https://raw.githubusercontent.com/Haydgi/t20-hayd-gmtools/main/module.json
```

## Aviso

Módulo não oficial, sem afiliação com a Jambô Editora ou com os autores de Tormenta20.
