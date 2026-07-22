import 'server-only';
import type { Prisma } from '@prisma/client';
import type {
  CreateBeneficioInput,
  UpdateBeneficioInput,
  AtribuirBeneficioInput,
  TerminarBeneficioInput,
  SuspenderBeneficioInput,
  FilterBeneficioInput,
  FilterAtribuicaoInput,
} from '@/lib/validations/beneficios';
import type { Ctx } from '@/server/services/types';

export type { Ctx };

// ─────────────────────────────────────────────────────────────────────────────
// Contrato de integração com o Payroll (spec 06)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Linha de payroll gerada por um benefício.
 * Cada benefício activo com comparticipação/desconto gera uma ou duas linhas.
 *
 * - tipo='PROVENTO': a empresa custeia parte tributável (aumenta base IRPS)
 * - tipo='DESCONTO': desconto da parte do colaborador (reduz líquido)
 *
 * O payroll.service chama `linhasPayrollDeBeneficios` dentro da transacção de
 * processamento para compor proventos/descontos por colaborador.
 */
export interface LinhaPayrollBeneficio {
  tipo: 'PROVENTO' | 'DESCONTO';
  /** Código do benefício (TipoBeneficio) */
  natureza: string;
  descricao: string;
  valor: Prisma.Decimal;
  tributavel: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// IBeneficioService
// ─────────────────────────────────────────────────────────────────────────────

export interface IBeneficioService {
  /** Cria um benefício no catálogo do tenant. */
  criar(input: CreateBeneficioInput, ctx: Ctx): Promise<{ id: string }>;

  /** Actualiza um benefício existente. */
  actualizar(id: string, input: UpdateBeneficioInput, ctx: Ctx): Promise<{ id: string }>;

  /**
   * Arquiva (desactiva) um benefício.
   * Não remove da BD — só marca ativo=false.
   * Lança BusinessRuleError('BENEFICIO_COM_ATRIBUICOES_ACTIVAS') se houver
   * atribuições activas.
   */
  arquivar(id: string, ctx: Ctx): Promise<void>;

  /** Lista benefícios do tenant (paginada por cursor). */
  listar(filter: FilterBeneficioInput, ctx: Ctx): Promise<{ items: unknown[]; nextCursor: string | null }>;

  /** Detalhe de um benefício por ID. */
  obter(id: string, ctx: Ctx): Promise<unknown>;

  /**
   * Relatório de custos agregado por tipo e departamento.
   * Devolve totais de comparticipacaoEmpresa por período (sem N+1).
   */
  relatorioCustos(
    ano: number,
    mes: number,
    ctx: Ctx,
  ): Promise<{ tipo: string; totalEmpresa: Prisma.Decimal; totalColaborador: Prisma.Decimal; count: number }[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// IBeneficioColaboradorService
// ─────────────────────────────────────────────────────────────────────────────

export interface IBeneficioColaboradorService {
  /**
   * Atribui um benefício a um colaborador.
   * Valida:
   * 1. Benefício existe e está activo no tenant.
   * 2. Colaborador existe no tenant.
   * 3. Não duplicação: não pode haver atribuição ACTIVA do mesmo benefício ao
   *    mesmo colaborador com sobreposição de período.
   *    Lança BusinessRuleError('BENEFICIO_DUPLICADO').
   * 4. Elegibilidade (se configurada): departamento/cargo elegível.
   *    Lança BusinessRuleError('COLABORADOR_NAO_ELEGIVEL').
   */
  atribuir(input: AtribuirBeneficioInput, ctx: Ctx): Promise<{ id: string }>;

  /**
   * Termina uma atribuição (status → TERMINADO, dataFim = hoje se não fornecida).
   * Lança NotFoundError se a atribuição não pertencer ao tenant.
   * Lança BusinessRuleError('ATRIBUICAO_JA_TERMINADA') se já TERMINADO.
   */
  terminar(input: TerminarBeneficioInput, ctx: Ctx): Promise<void>;

  /**
   * Suspende uma atribuição activa (status → SUSPENSO).
   * Lança BusinessRuleError('ATRIBUICAO_NAO_ACTIVA') se não estiver ACTIVO.
   */
  suspender(input: SuspenderBeneficioInput, ctx: Ctx): Promise<void>;

  /**
   * Reactiva uma atribuição suspensa (status → ACTIVO).
   * Lança BusinessRuleError('ATRIBUICAO_NAO_SUSPENSA') se não estiver SUSPENSO.
   */
  reactivar(id: string, ctx: Ctx): Promise<void>;

  /** Lista atribuições de um colaborador (com dados do benefício). */
  listarPorColaborador(
    colaboradorId: string,
    filter: { status?: string; cursor?: string; take?: number },
    ctx: Ctx,
  ): Promise<{ items: unknown[]; nextCursor: string | null }>;

  /** Lista atribuições por filtro genérico. */
  listar(filter: FilterAtribuicaoInput, ctx: Ctx): Promise<{ items: unknown[]; nextCursor: string | null }>;
}
