/**
 * Ponte com o recurso de metagame.
 *
 * A contagem das automações vira efeito ativo na criatura, então mostrá-la
 * para a mesa entrega a mesma informação que a chave "Efeitos ativos nas
 * criaturas" esconde. Um NPC do Mestre com Sangue dos Inimigos não pode exibir
 * "+5" no cartão para os jogadores.
 *
 * Isto NÃO reimplementa o metagame: só lê o mesmo contrato que ele grava
 * (setting `metagame`, flag `ocultarSegredos` no ator). O teste de arquitetura
 * trava esses nomes para os dois lados não desalinharem.
 */
import { MODULE_ID } from './runtime.mjs';

/** Tipos de ator considerados "do Mestre" pelo recurso de metagame. */
const TIPOS_COM_SEGREDO = new Set(['npc', 'hazard', 'simple']);

/** Flag no ator: o Mestre forçou esconder/mostrar os segredos da criatura. */
const FLAG_ATOR_OCULTAR = 'ocultarSegredos';

/** Só jogador comum e confiável são restritos; Mestre e assistente veem tudo. */
function usuarioRestrito() {
  const role = game.user?.role;
  if (role === undefined) return false;
  const { PLAYER, TRUSTED } = CONST.USER_ROLES;
  return role === PLAYER || role === TRUSTED;
}

/**
 * Configuração crua do metagame. Ausente (mundo novo, ou antes do `init`),
 * o padrão do recurso é esconder — por isso o fallback é `true`.
 */
function opcoes() {
  try {
    const cfg = game.settings.get(MODULE_ID, 'metagame');
    return { ativo: cfg?.ativo ?? true, efeitos: cfg?.efeitos ?? true };
  } catch {
    return { ativo: true, efeitos: true };
  }
}

/**
 * A contagem das automações deste ator deve ficar escondida de mim?
 *
 * Falso para o Mestre, para quem observa a criatura e para personagens de
 * jogador — só criaturas do Mestre que o jogador não acompanha entram aqui.
 */
export function ocultarContagemDe(ator) {
  if (!ator || !TIPOS_COM_SEGREDO.has(ator.type)) return false;
  if (!usuarioRestrito()) return false;

  const { ativo, efeitos } = opcoes();
  if (!ativo) return false;

  // Observador ou dono acompanha a criatura: não é segredo para ele.
  const nivel = ator.getUserLevel?.(game.user);
  if (nivel >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) return false;

  // O Mestre pode forçar por criatura no HUD do token; sem marcação vale a
  // chave "Efeitos ativos nas criaturas".
  const forcado = ator.getFlag?.(MODULE_ID, FLAG_ATOR_OCULTAR);
  return typeof forcado === 'boolean' ? forcado : efeitos;
}
