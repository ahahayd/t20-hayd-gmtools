# T20 Hayd GMTools

Ferramentas de Mestre para o sistema **Tormenta20** no **FoundryVTT v13**. Oculta automaticamente dos jogadores os detalhes das rolagens e habilidades de criaturas controladas pelo Mestre.

## O que faz

Quando uma rolagem ou ficha vem de um ator do tipo **NPC**, **Perigo** (`hazard`) ou **Coadjuvante** (`simple`), o módulo esconde dos jogadores:

- **Modificadores das rolagens** — o total do dado continua visível, mas a fórmula é mascarada: ataques mostram `1d20+?` e o dano mostra apenas `?`. O breakdown (tooltip) e o destaque de crítico/falha também são ocultados.
- **Descrição e CD de magias e poderes** — os cards de magia/poder no chat têm a descrição, os aprimoramentos e o número da CD (`CD ?`) ocultados; o clique para reexpandir é bloqueado.
- **Animação dos dados (Dice So Nice)** — se instalado, a rolagem 3D da criatura não é exibida para os jogadores (o Mestre vê normalmente).

Quem é **dono ou observador** da criatura continua vendo tudo. Fichas e rolagens de personagens jogadores nunca são afetadas.

## Como usar

Funciona automaticamente após ativar o módulo — não há configurações. O Mestre pode revelar ou reocultar uma rolagem específica **clicando com o botão direito na mensagem do chat** e escolhendo **"Revelar fórmula"** / **"Ocultar fórmula"**.

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
