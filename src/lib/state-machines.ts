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
