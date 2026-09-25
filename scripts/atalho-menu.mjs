/**
 * Tipo para `game.settings.registerMenu` que não abre formulário próprio: o
 * botão da configuração só chama uma função (que abre um diálogo, um diário,
 * uma janela do módulo...).
 *
 * O Foundry faz `new type()` seguido de `render(true)`, então basta
 * interceptar o render. Usa ApplicationV2 porque instanciar um FormApplication
 * (V1) emite o aviso de depreciação do framework V1 a cada clique.
 *
 * @param {() => unknown} abrir  função chamada ao clicar no botão do menu
 */
export function atalhoDeMenu(abrir) {
  return class extends foundry.applications.api.ApplicationV2 {
    async render() {
      await abrir();
      return this;
    }
  };
}
