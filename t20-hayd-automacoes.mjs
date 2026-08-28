/**
 * Fachada pública das automações.
 *
 * Este caminho permanece estável para preservar imports existentes. A
 * implementação foi movida para scripts/automacoes, onde pode ser dividida
 * por domínio sem afetar consumidores externos.
 */
export { injetarControlesAutomacao } from './scripts/automacoes/motor.mjs';
