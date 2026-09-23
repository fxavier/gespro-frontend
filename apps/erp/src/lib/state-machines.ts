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

// Formação — Spec 05 (Wave 7). Espelha TRANSICOES_FORMACAO em rh.interface.ts.
export const TRANSICOES_FORMACAO: Record<string, string[]> = {
  PLANEADA: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['CONCLUIDA', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
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

// ─────────────────────────────────────────────────────────────────────────────
// Spec 06 (Wave 7) — Transporte & Logística
// Espelham TRANSICOES_* das interfaces server-only (operacoes/*.interface.ts).
// Usados nos componentes-folha de acções para mostrar só transições válidas.
// ─────────────────────────────────────────────────────────────────────────────

export const TRANSICOES_VIATURA: Record<string, string[]> = {
  DISPONIVEL: ['EM_ACTIVIDADE', 'EM_MANUTENCAO', 'INACTIVA', 'ABATIDA'],
  EM_ACTIVIDADE: ['DISPONIVEL'],
  EM_MANUTENCAO: ['DISPONIVEL', 'INACTIVA'],
  INACTIVA: ['DISPONIVEL', 'ABATIDA'],
  ABATIDA: [],
};

export const TRANSICOES_ROTA: Record<string, string[]> = {
  PLANEADA: ['ATIVA', 'CANCELADA'],
  ATIVA: ['PAUSADA', 'CONCLUIDA', 'CANCELADA'],
  PAUSADA: ['ATIVA', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
};

export const TRANSICOES_ATIVIDADE: Record<string, string[]> = {
  PLANEADA: ['EM_CURSO', 'CANCELADA'],
  EM_CURSO: ['SUSPENSA', 'CONCLUIDA', 'CANCELADA'],
  SUSPENSA: ['EM_CURSO', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
};

export const TRANSICOES_ENTREGA: Record<string, string[]> = {
  PENDENTE: ['AGENDADA', 'CANCELADA'],
  AGENDADA: ['EM_TRANSITO', 'CANCELADA'],
  EM_TRANSITO: ['ENTREGUE', 'FALHADA'],
  FALHADA: ['AGENDADA', 'CANCELADA'],
  ENTREGUE: [],
  CANCELADA: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Spec 19 — Assinatura SaaS (onboarding self-service e faturação por subscrição)
// ─────────────────────────────────────────────────────────────────────────────

export const ESTADOS_ASSINATURA = [
  'TRIAL',
  'ATIVA',
  'LEITURA',
  'FECHADA',
  // Legados (ADR-0032 §1): já não se escrevem, mas existem em linhas antigas.
  'SUSPENSA',
  'CANCELADA',
  'EXPIRADO',
] as const;

export type EstadoAssinatura = (typeof ESTADOS_ASSINATURA)[number];

/**
 * Ciclo de vida da subscrição.
 *
 * As TRÊS saídas de uma subscrição viva — fim de Trial, cancelamento voluntário
 * e dunning esgotado — convergem todas em `LEITURA` (ADR-0027 §6): uma regra,
 * um prazo, um estado. Ao fim dos trinta dias, `FECHADA`; nada se apaga.
 *
 * Reactivar é uma nova Checkout Session que, por convenção, actualiza o MESMO
 * registo `Assinatura` com um novo `stripeSubscriptionId` — daí todos os
 * estados sem acesso terem saída para `ATIVA`. Nunca se prende quem quer pagar.
 *
 * O Stripe não garante ordem de entrega de webhooks: quem transita valida
 * sempre contra o estado actual e ignora (sem erro fatal) o que não encaixa.
 */
export const TRANSICOES_ASSINATURA: Record<EstadoAssinatura, EstadoAssinatura[]> = {
  TRIAL: ['ATIVA', 'LEITURA'],
  ATIVA: ['LEITURA'],
  LEITURA: ['ATIVA', 'FECHADA'],
  FECHADA: ['ATIVA'],
  // Legados: ficam com a única saída que interessa — pagar (ADR-0032 §1).
  SUSPENSA: ['ATIVA'],
  EXPIRADO: ['ATIVA'],
  CANCELADA: ['ATIVA'],
};

/** `true` se a transição `de → para` é válida. Idempotente: `de === para` é válida. */
export function transicaoAssinaturaValida(
  de: EstadoAssinatura,
  para: EstadoAssinatura,
): boolean {
  if (de === para) return true;
  return (TRANSICOES_ASSINATURA[de] ?? []).includes(para);
}

/**
 * Os três níveis de acesso de um Tenant (ADR-0027 §6, ADR-0032 §4).
 *
 * - `aberto`  — vê e escreve.
 * - `leitura` — vê e exporta tudo o que é seu, não escreve nada, e pode pagar
 *               para sair de lá. Pagar e exportar NUNCA se travam: um estado de
 *               onde o cliente não pudesse sair seria uma armadilha.
 * - `fechado` — não entra. Os dados ficam.
 */
export type EstadoAcesso = 'aberto' | 'leitura' | 'fechado';

/**
 * Arbitra os DOIS donos do acesso, e é a única a fazê-lo (ADR-0032 §4).
 *
 * O estado comercial vive na `Assinatura` e mais nada lhe toca; a decisão da
 * GestPro vive no `Tenant` (hoje `deletedAt`) e só a administração a escreve.
 * Antes havia um booleano partilhado (`ConfiguracaoFiscal.statusAtivo`) que os
 * dois escreviam, e quem escrevesse por último ganhava — na prática, um tenant
 * suspenso por abuso era reactivado pelo pagamento seguinte.
 *
 * A decisão da GestPro ganha SEMPRE: quem foi fechado por nós não reabre por
 * ter pago.
 *
 * Pura e client-safe de propósito — testa-se como tabela de estados completa,
 * sem base de dados.
 */
export function estadoDeAcesso(
  estado: EstadoAssinatura,
  fechadoPelaGestPro: boolean,
): EstadoAcesso {
  if (fechadoPelaGestPro) return 'fechado';
  if (estado === 'TRIAL' || estado === 'ATIVA') return 'aberto';
  if (estado === 'LEITURA') return 'leitura';
  return 'fechado';
}

/** Dias de Leitura antes de o acesso fechar (ADR-0027 §6). */
export const LEITURA_DIAS = 30;

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

// ADR-0038 / RF-XXX §12: estado de reconciliação de um movimento.
// RECONCILIADO não é terminal — reverter uma correspondência devolve o movimento
// a PENDENTE e deixa o trilho de auditoria intacto (RF §19: nada muda em silêncio).
export const TRANSICOES_MOVIMENTO_RECONCILIACAO: Record<string, string[]> = {
  PENDENTE: [
    'RECONCILIADO', 'RECONCILIADO_MANUALMENTE', 'EM_TRANSITO',
    'BANCO_SEM_CONTABILIZACAO', 'CONTABILIDADE_SEM_BANCO',
    'DIFERENCA_VALOR', 'DIVERGENCIA', 'IGNORADO',
  ],
  EM_TRANSITO: [
    'RECONCILIADO', 'RECONCILIADO_MANUALMENTE', 'CONTABILIDADE_SEM_BANCO',
    'DIFERENCA_VALOR', 'DIVERGENCIA', 'IGNORADO',
  ],
  BANCO_SEM_CONTABILIZACAO: [
    'RECONCILIADO', 'RECONCILIADO_MANUALMENTE', 'DIFERENCA_VALOR', 'DIVERGENCIA', 'IGNORADO',
  ],
  CONTABILIDADE_SEM_BANCO: [
    'RECONCILIADO', 'RECONCILIADO_MANUALMENTE', 'EM_TRANSITO', 'DIFERENCA_VALOR',
    'DIVERGENCIA', 'IGNORADO',
  ],
  DIFERENCA_VALOR: ['RECONCILIADO_MANUALMENTE', 'DIVERGENCIA', 'IGNORADO', 'PENDENTE'],
  DIVERGENCIA: ['RECONCILIADO_MANUALMENTE', 'IGNORADO', 'PENDENTE'],
  RECONCILIADO: ['PENDENTE'],
  RECONCILIADO_MANUALMENTE: ['PENDENTE'],
  IGNORADO: ['PENDENTE'],
};

// ADR-0038 / RF-XXX §17: ciclo de vida do período de reconciliação.
// RECONCILIADO e CANCELADO são terminais — reabrir é criar um período novo.
export const TRANSICOES_PERIODO_RECONCILIACAO: Record<string, string[]> = {
  ABERTO: ['EM_RECONCILIACAO', 'CANCELADO'],
  EM_RECONCILIACAO: ['RECONCILIADO', 'CANCELADO'],
  RECONCILIADO: [],
  CANCELADO: [],
};
