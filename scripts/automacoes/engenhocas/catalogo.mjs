/** Aparatos de Heróis de Arton que podem ser acoplados a uma engenhoca. */
export const APARATOS = {
  'captador-luz': {
    nome: 'Captador de Luz',
    icone: 'fa-solid fa-sun',
    automacao: 'Soma +1 por dado às rolagens de cura de PV da engenhoca.',
    aplicacao: 'cura'
  },
  comutador: {
    nome: 'Comutador',
    icone: 'fa-solid fa-bolt',
    automacao: 'Reduz em 1 PM o custo total dos aprimoramentos (mínimo 0).'
  },
  'conversor-alimentador': {
    nome: 'Conversor-Alimentador',
    icone: 'fa-solid fa-flask',
    automacao: 'Lembra o uso do preparado; o consumo do item e a sustentação são manuais.',
    manual: true
  },
  'engenho-automacao': {
    nome: 'Engenho de Automação',
    icone: 'fa-solid fa-gears',
    automacao: 'Lembra que esta engenhoca sustentada não ocupa o limite normal.',
    manual: true,
    requer: 'conversor-alimentador'
  },
  'espera-melhorias': {
    nome: 'Espera para Melhorias',
    icone: 'fa-solid fa-screwdriver-wrench',
    automacao: 'Registra a espera acoplada; a melhoria instalada é resolvida pelo sistema ou pela mesa.',
    manual: true,
    repetivel: true
  },
  estabilizador: {
    nome: 'Estabilizador',
    icone: 'fa-solid fa-shield-halved',
    automacao: 'Aumenta em +2 a CD para resistir ao efeito da magia simulada.'
  },
  'estimulador-sobrecarga': {
    nome: 'Estimulador de Sobrecarga',
    icone: 'fa-solid fa-explosion',
    automacao: 'Acrescenta um dado do mesmo tipo na rolagem de dano.',
    aplicacao: 'dano'
  },
  'gatilho-corda': {
    nome: 'Gatilho de Corda',
    icone: 'fa-solid fa-stopwatch',
    automacao: 'Troca a execução para ação de movimento e controla quando é preciso dar corda.',
    aplicacao: 'acao-padrao'
  },
  giroscopio: {
    nome: 'Giroscópio',
    icone: 'fa-solid fa-compass-drafting',
    automacao: 'Retira a penalidade de armadura do teste de ativação.'
  },
  'ligacao-convergencia': {
    nome: 'Ligação de Convergência',
    icone: 'fa-solid fa-link',
    automacao: 'Lembra a ligação; limite, exclusão por cena e dissipação são controlados pela mesa.',
    manual: true
  },
  'remontagem-portabilidade': {
    nome: 'Remontagem de Portabilidade',
    icone: 'fa-solid fa-shirt',
    automacao: 'Registra a remontagem; espaços e limite de itens vestidos permanecem manuais.',
    manual: true
  },
  'sequenciador-ativacao': {
    nome: 'Sequenciador de Ativação',
    icone: 'fa-solid fa-list-ol',
    automacao: 'Lembra a sequência; escolha das três engenhocas e ativações por turno são manuais.',
    manual: true
  },
  'sistema-refrigeracao': {
    nome: 'Sistema de Refrigeração',
    icone: 'fa-solid fa-fan',
    automacao: 'Botão no cartão gasta 1 PM e prepara uma redução de –5 na próxima CD, uma vez por dia.'
  },
  'supressor-seguranca': {
    nome: 'Supressor de Segurança',
    icone: 'fa-solid fa-triangle-exclamation',
    automacao: 'Na primeira falha da cena, evita o enguiço e o aumento da próxima CD.'
  }
};

export function nomeAparato(id) {
  return APARATOS[id]?.nome ?? id;
}

