/**
 * Índice preguiçoso de atores relevantes para uma família de automações.
 * Evita percorrer todo o mundo a cada mudança de alvo ou turno.
 */
export class IndiceAtoresAutomacoes {
  #aceita;
  #cache = null;

  constructor(aceita) {
    this.#aceita = aceita;
  }

  invalidar() {
    this.#cache = null;
  }

  listar() {
    if (this.#cache) return [...this.#cache];

    const candidatos = new Map();
    for (const ator of game.actors ?? []) candidatos.set(ator.uuid ?? `Actor.${ator.id}`, ator);

    // Atores sintéticos não pertencem a game.actors. A cena vista é suficiente
    // para eventos de alvo e combate, que são os caminhos quentes deste índice.
    for (const token of canvas?.scene?.tokens ?? []) {
      const ator = token?.actor;
      if (ator) candidatos.set(ator.uuid ?? `Token.${token.id}`, ator);
    }

    this.#cache = [...candidatos.values()].filter((ator) => {
      try { return this.#aceita(ator); }
      catch { return false; }
    });
    return [...this.#cache];
  }
}
