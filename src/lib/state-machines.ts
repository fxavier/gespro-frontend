/**
 * Mapas de máquinas de estado — CLIENT-SAFE (sem `server-only`).
 * Dado de domínio puro, usável no servidor (serviços) e no cliente (componentes
 * de acções que mostram só as transições válidas). Os ficheiros de interface de
 * serviço em `src/server/services/**` espelham estes valores; se divergirem, esta
 * é a fonte para o lado cliente.
 * ponytail: pequena duplicação com as interfaces de serviço; unificar se crescer.
 */

export const TRANSICOES_ATIVO: Record<string, string[]> = {
  NOVO: ['EM_USO', 'BAIXADO'],
  EM_USO: ['EM_MANUTENCAO', 'EM_TRANSFERENCIA', 'OBSOLETO', 'BAIXADO'],
  EM_MANUTENCAO: ['EM_USO', 'OBSOLETO', 'BAIXADO'],
  EM_TRANSFERENCIA: ['EM_USO', 'BAIXADO'],
  OBSOLETO: ['BAIXADO'],
  BAIXADO: [],
};

export const TRANSICOES_MANUTENCAO_ATIVO: Record<string, string[]> = {
  AGENDADA: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['ORCAMENTO', 'CONCLUIDA', 'CANCELADA'],
  ORCAMENTO: ['EM_ANDAMENTO', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
};

export const TRANSICOES_TICKET: Record<string, string[]> = {
  ABERTO: ['EM_PROGRESSO', 'AGUARDANDO_CLIENTE', 'AGUARDANDO_TERCEIRO', 'CANCELADO'],
  EM_PROGRESSO: ['AGUARDANDO_CLIENTE', 'AGUARDANDO_TERCEIRO', 'RESOLVIDO', 'CANCELADO'],
  AGUARDANDO_CLIENTE: ['EM_PROGRESSO', 'RESOLVIDO', 'CANCELADO'],
  AGUARDANDO_TERCEIRO: ['EM_PROGRESSO', 'CANCELADO'],
  RESOLVIDO: ['FECHADO', 'EM_PROGRESSO'],
  FECHADO: ['EM_PROGRESSO'],
  CANCELADO: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Recrutamento — Spec 07
// ─────────────────────────────────────────────────────────────────────────────

/** Ciclo de vida da Vaga: RASCUNHO → ABERTA → EM_TRIAGEM → FECHADA/CANCELADA */
export const TRANSICOES_VAGA: Record<string, string[]> = {
  RASCUNHO: ['ABERTA', 'CANCELADA'],
  ABERTA: ['EM_TRIAGEM', 'FECHADA', 'CANCELADA'],
  EM_TRIAGEM: ['FECHADA', 'CANCELADA', 'ABERTA'],
  FECHADA: [],
  CANCELADA: [],
};

/** Pipeline de selecção da Candidatura */
export const TRANSICOES_CANDIDATURA: Record<string, string[]> = {
  RECEBIDA: ['TRIAGEM', 'REJEITADO', 'DESISTIU'],
  TRIAGEM: ['ENTREVISTA', 'REJEITADO', 'DESISTIU'],
  ENTREVISTA: ['PROPOSTA', 'REJEITADO', 'DESISTIU'],
  PROPOSTA: ['CONTRATADO', 'REJEITADO', 'DESISTIU'],
  CONTRATADO: [],
  REJEITADO: [],
  DESISTIU: [],
};

/**
 * Calcula a posição fraccional entre duas posições (formato string decimal).
 * Inserir entre anterior e posterior: posicao = midpoint(ant, pos).
 * Equivalente ao padrão TarefaProjeto.posicao.
 */
export function calcularMidpoint(anterior: string | null, posterior: string | null): string {
  const a = anterior != null ? parseFloat(anterior) : 0;
  const b = posterior != null ? parseFloat(posterior) : a + 1;
  const mid = (a + b) / 2;
  // Manter precisão razoável (6 casas decimais) para evitar colisões rápidas
  return mid.toFixed(6).replace(/\.?0+$/, '') || '0.5';
}
