// Interface do serviço de Inventário Físico de Ativos (WS A — Wave 1 contrato)
import 'server-only';

import type {
  InventarioFisicoCreate,
  InventarioFisicoFilter,
  InventarioFisicoUpdate,
  JustificarDiscrepancia,
  RegistarContagem,
  TransicaoInventarioFisico,
} from '@/lib/validations/inventario-ativos';
import type { Ctx, PaginatedResult } from './types';

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

export interface MembroEquipeInventarioDto {
  id: string;
  inventarioId: string;
  userId: string;
  localizacoesAtribuidas: string[];
  createdAt: Date;
}

export interface ContagemInventarioDto {
  id: string;
  inventarioId: string;
  ativoId: string;
  localizacaoEsperadaId: string;
  responsavelEsperadoId: string | null;
  estadoEsperado: string;
  encontrado: boolean;
  localizacaoEncontradaId: string | null;
  responsavelEncontradoId: string | null;
  estadoEncontrado: string | null;
  dataContagem: Date | null;
  contadoPorId: string | null;
  observacoesContagem: string | null;
  fotoContagem: string | null;
  temDiscrepancia: boolean;
  tipoDiscrepancia: string | null;
  justificativaDiscrepancia: string | null;
  ajusteRealizado: boolean;
  dataAjuste: Date | null;
  ajustadoPorId: string | null;
  createdAt: Date;
}

export interface InventarioFisicoDto {
  id: string;
  tenantId: string;
  codigo: string;
  titulo: string;
  descricao: string | null;
  status: string;
  dataInicio: Date;
  dataPrevistaConclusao: Date | null;
  dataConclusao: Date | null;
  localizacaoId: string | null;
  responsavelId: string;
  localizacoesIncluidas: string[];
  categoriasIncluidas: string[];
  totalAtivosEsperados: number | null;
  totalAtivosContados: number | null;
  totalDiscrepancias: number | null;
  ajustesRealizados: boolean;
  dataAjustes: Date | null;
  observacoes: string | null;
  relatorio: string | null;
  motivoCancelamento: string | null;
  membros: MembroEquipeInventarioDto[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ResultadoReconciliacaoInventario {
  inventarioId: string;
  totalAtivos: number;
  encontrados: number;
  naoEncontrados: number;
  comDiscrepancias: number;
  ajustesGerados: number;
  movimentosGerados: string[]; // IDs dos MovimentoStock gerados (ajustes automáticos)
}

// ─── Mapa de máquina de estado — InventarioFisico ────────────────────────────

/**
 * Transições válidas para StatusInventarioFisico.
 *
 * PLANEJADO    → AGENDADO, CANCELADO
 * AGENDADO     → EM_ANDAMENTO, CANCELADO
 * EM_ANDAMENTO → PAUSADO, CONCLUIDO, CANCELADO
 * PAUSADO      → EM_ANDAMENTO, CANCELADO
 * CONCLUIDO    → (terminal)
 * CANCELADO    → (terminal)
 */
export const TRANSICOES_INVENTARIO_FISICO: Record<string, string[]> = {
  PLANEJADO: ['AGENDADO', 'CANCELADO'],
  AGENDADO: ['EM_ANDAMENTO', 'CANCELADO'],
  EM_ANDAMENTO: ['PAUSADO', 'CONCLUIDO', 'CANCELADO'],
  PAUSADO: ['EM_ANDAMENTO', 'CANCELADO'],
  CONCLUIDO: [],
  CANCELADO: [],
} as const;

// ─── Interface do serviço ─────────────────────────────────────────────────────

export interface IInventarioFisicoService {
  listarInventarios(
    filter: InventarioFisicoFilter,
    ctx: Ctx,
  ): Promise<PaginatedResult<InventarioFisicoDto>>;

  obterInventario(id: string, ctx: Ctx): Promise<InventarioFisicoDto>;

  criarInventario(data: InventarioFisicoCreate, ctx: Ctx): Promise<InventarioFisicoDto>;

  actualizarInventario(
    id: string,
    data: InventarioFisicoUpdate,
    ctx: Ctx,
  ): Promise<InventarioFisicoDto>;

  /**
   * Transição de estado via TRANSICOES_INVENTARIO_FISICO.
   * - PLANEJADO → AGENDADO: valida data futura.
   * - AGENDADO → EM_ANDAMENTO: gera lista de ContagemInventario baseada no escopo.
   * - EM_ANDAMENTO → CONCLUIDO: exige todos os itens contados; chama reconciliar().
   * Lança BusinessRuleError('TRANSICAO_INVALIDA') se a transição não for permitida.
   */
  transitarStatus(
    input: TransicaoInventarioFisico,
    ctx: Ctx,
  ): Promise<InventarioFisicoDto>;

  // Membros da equipe
  adicionarMembro(
    inventarioId: string,
    userId: string,
    localizacoesAtribuidas: string[],
    ctx: Ctx,
  ): Promise<MembroEquipeInventarioDto>;

  removerMembro(inventarioId: string, userId: string, ctx: Ctx): Promise<void>;

  // Contagem
  listarContagens(
    inventarioId: string,
    ctx: Ctx,
  ): Promise<ContagemInventarioDto[]>;

  registarContagem(data: RegistarContagem, ctx: Ctx): Promise<ContagemInventarioDto>;

  justificarDiscrepancia(
    data: JustificarDiscrepancia,
    ctx: Ctx,
  ): Promise<ContagemInventarioDto>;

  /**
   * Reconcilia os resultados da contagem:
   * - Para cada discrepância sem ajuste, propõe ajuste de localização/estado.
   * - Para ativos não encontrados, pode gerar MovimentoStock de ajuste.
   * Só executável quando status === CONCLUIDO.
   */
  reconciliar(
    inventarioId: string,
    ctx: Ctx,
  ): Promise<ResultadoReconciliacaoInventario>;
}
