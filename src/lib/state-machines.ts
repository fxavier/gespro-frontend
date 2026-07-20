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

// Spec 05: Contagem de Stock
export const TRANSICOES_CONTAGEM_STOCK: Record<string, string[]> = {
  RASCUNHO:     ['EM_CONTAGEM', 'CANCELADA'],
  EM_CONTAGEM:  ['RECONCILIADA', 'CANCELADA'],
  RECONCILIADA: ['CONCLUIDA', 'CANCELADA'],
  CONCLUIDA:    [],
  CANCELADA:    [],
};

// Payroll — Spec 06 (folha mensal e payroll individual partilham o ciclo)
export const TRANSICOES_PAYROLL: Record<string, string[]> = {
  PENDENTE: ['PROCESSADO', 'CANCELADO'],
  PROCESSADO: ['PAGO', 'CANCELADO'],
  PAGO: [],
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

// ─────────────────────────────────────────────────────────────────────────────
// WS-10: Encomendas, Devoluções, Trocas, Vendedores (Spec 10)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ciclo de vida de Encomenda:
 * RASCUNHO → CONFIRMADA (reserva stock)
 * CONFIRMADA → PARCIALMENTE_ENTREGUE | CONCLUIDA | CANCELADA
 * PARCIALMENTE_ENTREGUE → CONCLUIDA | CANCELADA
 */
export const TRANSICOES_ENCOMENDA: Record<string, string[]> = {
  RASCUNHO:              ['CONFIRMADA', 'CANCELADA'],
  CONFIRMADA:            ['PARCIALMENTE_ENTREGUE', 'CONCLUIDA', 'CANCELADA'],
  PARCIALMENTE_ENTREGUE: ['CONCLUIDA', 'CANCELADA'],
  CONCLUIDA:             [],
  CANCELADA:             [],
};

/**
 * Ciclo de vida de Devolução:
 * PENDENTE → APROVADA | REJEITADA
 * APROVADA → PROCESSADA
 */
export const TRANSICOES_DEVOLUCAO: Record<string, string[]> = {
  PENDENTE:  ['APROVADA', 'REJEITADA'],
  APROVADA:  ['PROCESSADA'],
  PROCESSADA: [],
  REJEITADA: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Spec 11 — Riscos e Qualidade de Projecto
// ─────────────────────────────────────────────────────────────────────────────

/** Ciclo de vida de RiscoProjeto */
export const TRANSICOES_RISCO: Record<string, string[]> = {
  IDENTIFICADO: ['EM_MITIGACAO', 'FECHADO', 'MATERIALIZADO'],
  EM_MITIGACAO: ['FECHADO', 'MATERIALIZADO', 'IDENTIFICADO'],
  FECHADO: [],
  MATERIALIZADO: ['EM_MITIGACAO', 'FECHADO'],
};

/** Ciclo de vida de RegistoQualidade */
export const TRANSICOES_QUALIDADE: Record<string, string[]> = {
  ABERTA: ['EM_ANALISE', 'FECHADA'],
  EM_ANALISE: ['RESOLVIDA', 'FECHADA'],
  RESOLVIDA: ['FECHADA'],
  FECHADA: [],
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
