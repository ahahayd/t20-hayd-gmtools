/** Serviços de execução compartilhados pelas automações. */

export const MODULE_ID = 't20-hayd-gmtools';

/**
 * Interruptor mestre. Na inicialização, antes do registro da configuração,
 * mantém o comportamento histórico habilitado.
 */
export function automacoesAtivas() {
  try { return game.settings.get(MODULE_ID, 'automacoesEnabled'); }
  catch { return true; }
}

/** Ordena usuários de forma determinística para todos os clientes. */
function porId(a, b) {
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
}

/** Usuários ativos com permissão de proprietário sobre o ator. */
function proprietariosAtivos(ator, { mestres = false } = {}) {
  if (!ator || !game.users) return [];
  return [...game.users]
    .filter((usuario) => usuario?.active && (!!usuario.isGM === mestres))
    .filter((usuario) => ator.testUserPermission?.(usuario, 'OWNER') ?? false)
    .sort(porId);
}

/**
 * Escolhe exatamente um cliente para gravações automáticas de um ator.
 *
 * O jogador proprietário tem prioridade porque alvos são estado local do
 * usuário. Sem jogador ativo, o GM ativo assume; como último recurso, usa um
 * único GM/proprietário ativo ordenado por id.
 */
export function usuarioResponsavelPeloAtor(ator) {
  const jogadores = proprietariosAtivos(ator);
  if (jogadores.length) {
    // Em fichas compartilhadas, o usuário que escolheu este personagem é a
    // autoridade natural. Atores sintéticos mantêm o id do ator-base.
    const escolhido = jogadores.find((usuario) => usuario.character?.id === ator.id);
    return escolhido ?? jogadores[0];
  }

  const gmAtivo = game.users?.activeGM;
  if (gmAtivo?.active && (ator?.testUserPermission?.(gmAtivo, 'OWNER') ?? gmAtivo.isGM)) {
    return gmAtivo;
  }

  return proprietariosAtivos(ator, { mestres: true })[0] ?? null;
}

/** True somente no cliente eleito para persistir mudanças deste ator. */
export function souResponsavelPeloAtor(ator) {
  return usuarioResponsavelPeloAtor(ator)?.id === game.user?.id;
}

/**
 * Quem pode MEXER nos controles de um personagem.
 *
 * Ver é liberado para a mesa inteira (a contagem é informação de jogo, não
 * segredo); alterar continua restrito a quem é dono da ficha. O Mestre passa
 * aqui porque o Foundry trata GM como OWNER de tudo.
 */
export function podeControlar(ator) {
  return !!ator?.isOwner;
}

/**
 * Este cliente é o Mestre ativo?
 *
 * As auras escrevem efeitos em fichas de outros jogadores, o que só o Mestre
 * tem permissão de fazer. Elegendo um único GM, dois Mestres conectados não
 * duplicam o trabalho.
 */
export function souGmAtivo() {
  return !!game.user?.isGM && game.user === game.users?.activeGM;
}
