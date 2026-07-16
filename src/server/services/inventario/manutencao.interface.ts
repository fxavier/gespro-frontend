// Interface do serviço de Manutenção de Ativos (WS A — Wave 1 contrato)
import 'server-only';

import type {
  ManutencaoAtivoCreate,
  ManutencaoAtivoFilter,
  ManutencaoAtivoUpdate,
  TransicaoManutencaoAtivo,
} from '@/lib/validations/inventario-ativos';
import type { Ctx, PaginatedResult } from './types';

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

export interface PecaManutencaoDto {
  id: string;
  manutencaoId: string;
  produtoId: string | null;
  nome: string;
  quantidade: string; // Decimal
  custoUnitario: string;
  custoTotal: string;
}

export interface ManutencaoAtivoDto {
  id: string;
  tenantId: string;
  ativoId: string;
  tipo: string;
  status: string;
  prioridade: string | null;
  dataAgendada: Date;
  dataInicio: Date | null;
  dataConclusao: Date | null;
  titulo: string;
  descricao: string;
  procedimentos: string | null;
  tecnicoId: string | null;
  responsavelId: string | null;
  fornecedorId: string | null;
  custoEstimado: string | null;
  custoReal: string | null;
  custoMaoObra: string | null;
  custoPecas: string | null;
  proximaManutencao: Date | null;
  intervaloProximaManutencaoDias: number | null;
  relatorio: string | null;
  fotos: string[];
  anexos: string[];
  observacoes: string | null;
  motivoCancelamento: string | null;
  pecas: PecaManutencaoDto[];
  criadoPor: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Mapa de máquina de estado — ManutencaoAtivo ─────────────────────────────

/**
 * Transições válidas para StatusManutencaoAtivo.
 * Conflito #10 resolvido: sem EM_CURSO; apenas EM_ANDAMENTO.
 *
 * AGENDADA    → EM_ANDAMENTO, CANCELADA
 * EM_ANDAMENTO → ORCAMENTO, CONCLUIDA, CANCELADA
 * ORCAMENTO   → EM_ANDAMENTO, CANCELADA
 * CONCLUIDA   → (terminal)
 * CANCELADA   → (terminal)
 */
export const TRANSICOES_MANUTENCAO_ATIVO: Record<string, string[]> = {
  AGENDADA: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['ORCAMENTO', 'CONCLUIDA', 'CANCELADA'],
  ORCAMENTO: ['EM_ANDAMENTO', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
} as const;

// ─── Interface do serviço ─────────────────────────────────────────────────────

export interface IManutencaoAtivoService {
  listarManutencoes(
    filter: ManutencaoAtivoFilter,
    ctx: Ctx,
  ): Promise<PaginatedResult<ManutencaoAtivoDto>>;

  obterManutencao(id: string, ctx: Ctx): Promise<ManutencaoAtivoDto>;

  criarManutencao(data: ManutencaoAtivoCreate, ctx: Ctx): Promise<ManutencaoAtivoDto>;

  actualizarManutencao(
    id: string,
    data: ManutencaoAtivoUpdate,
    ctx: Ctx,
  ): Promise<ManutencaoAtivoDto>;

  /**
   * Transição de estado via TRANSICOES_MANUTENCAO_ATIVO.
   * - AGENDADA → EM_ANDAMENTO: actualiza dataInicio e muda estado do Ativo para EM_MANUTENCAO.
   * - EM_ANDAMENTO/ORCAMENTO → CONCLUIDA: actualiza dataConclusao, custos e muda Ativo para EM_USO.
   * - * → CANCELADA: regista motivoCancelamento e não muda estado do Ativo.
   * Lança BusinessRuleError('TRANSICAO_INVALIDA') se a transição não for permitida.
   */
  transitarStatus(
    input: TransicaoManutencaoAtivo,
    ctx: Ctx,
  ): Promise<ManutencaoAtivoDto>;

  /**
   * Devolve manutenções cuja dataAgendada já passou e status ∈ {AGENDADA}.
   * Usado por painel de alertas e dashboard.
   */
  obterManutencoesPendentes(ctx: Ctx): Promise<ManutencaoAtivoDto[]>;

  /**
   * Devolve manutenções com proximaManutencao nos próximos `diasAntecedencia` dias.
   */
  obterProximasManutencoes(
    diasAntecedencia: number,
    ctx: Ctx,
  ): Promise<ManutencaoAtivoDto[]>;
}
