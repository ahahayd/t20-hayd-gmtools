import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.Hooks = { on() {}, once() {} };
const { ehMensagemDeCenaEncerrada } = await import('../../scripts/automacoes/hooks.mjs');

test('reconhece o cartão nativo de cena finalizada do Tormenta20', () => {
  assert.equal(ehMensagemDeCenaEncerrada({
    content: `<div class="tormenta20 chat-card item-card">
      <i class="fa-solid fa-clapperboard"></i> Cena Finalizada
      <div>A cena atual foi terminada pelo mestre.</div>
    </div>`
  }), true);
});

test('não confunde mensagens comuns ou lembretes do próprio GMTools', () => {
  assert.equal(ehMensagemDeCenaEncerrada({ content: 'Cena Finalizada' }), false);
  assert.equal(ehMensagemDeCenaEncerrada({ content: '<i class="fa-clapperboard"></i> Outra coisa' }), false);
  assert.equal(ehMensagemDeCenaEncerrada(null), false);
});
