// Interface do serviço de Ativos (WS A — Wave 1 contrato)
import 'server-only';

import type {
  AtivoCreate,
  AtivoFilter,
  AtivoUpdate,
  CategoriaAtivoCreate,
  CategoriaAtivoFilter,
  CategoriaAtivoUpdate,
  DocumentoAtivoCreate,
  MovimentacaoAtivoCreate,
} from '@/lib/validations/inventario-ativos';
import type { Ctx, PaginatedResult } from './types';

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

export interface CategoriaAtivoDto {
  id: string;
  tenantId: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  categoriaPaiId: string | null;
  metodoAmortizacao: string;
  vidaUtilAnos: number;
  valorResidualPct: string; // Decimal
  intervaloPreventivaDias: number | null;
  alertaManutencaoDias: number | null;
  ativa: boolean;
  createdAt: Date;
}

export interface DocumentoAtivoDto {
  id: string;
  ativoId: string;
  nome: string;
  tipo: string;
  url: string;
  dataUpload: Date;
}

export interface AtivoDto {
  id: string;
  tenantId: string;
  codigoInterno: string;
  nome: string;
  descricao: string | null;
  categoriaId: string;
  categoria: Pick<CategoriaAtivoDto, 'id' | 'nome'> | null;
  numeroSerie: string | null;
  modelo: string | null;
  marca: string | null;
  fornecedorId: string | null;
  dataAquisicao: Date;
  valorCompra: string;    // Decimal
  valorResidual: string | null;
  vidaUtilAnos: number;
  dataSubstituicao: Date | null;
  estado: string;
  localizacaoId: string;
  responsavelId: string | null;
  departamentoId: string | null;
  projetoId: string | null;
  metodoAmortizacao: string;
  qrCode: string | null;
  codigoBarras: string | null;
  rfidTag: string | null;
  observacoes: string | null;
  garantiaDataInicio: Date | null;
  garantiaDataFim: Date | null;
  garantiaFornecedor: string | null;
  garantiaTermos: string | null;
  imagens: string[];
  documentos: DocumentoAtivoDto[];
  // Amortização calculada (join com AmortizacaoCalculo mais recente)
  valorAmortizadoAcumulado: string | null;
  valorLiquidoContabilistico: string | null;
  percentualAmortizado: string | null;
  criadoPor: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MovimentacaoAtivoDto {
  id: string;
  tenantId: string;
  ativoId: string;
  tipo: string;
  localizacaoOrigemId: string | null;
  localizacaoDestinoId: string | null;
  responsavelOrigemId: string | null;
  responsavelDestinoId: string | null;
  dataMovimentacao: Date;
  dataPrevisaoDevolucao: Date | null;
  motivo: string;
  observacoes: string | null;
  guiaMovimentacao: string | null;
  confirmada: boolean;
  dataConfirmacao: Date | null;
  confirmadaPor: string | null;
  criadoPor: string;
  createdAt: Date;
}

// ─── Mapa de máquina de estado — Ativo ───────────────────────────────────────

/**
 * Transições válidas para EstadoAtivo.
 *
 * NOVO          → EM_USO, BAIXADO
 * EM_USO        → EM_MANUTENCAO, EM_TRANSFERENCIA, OBSOLETO, BAIXADO
 * EM_MANUTENCAO → EM_USO, OBSOLETO, BAIXADO
 * EM_TRANSFERENCIA → EM_USO, BAIXADO
 * OBSOLETO      → BAIXADO
 * BAIXADO       → (terminal)
 */
export const TRANSICOES_ATIVO: Record<string, string[]> = {
  NOVO: ['EM_USO', 'BAIXADO'],
  EM_USO: ['EM_MANUTENCAO', 'EM_TRANSFERENCIA', 'OBSOLETO', 'BAIXADO'],
  EM_MANUTENCAO: ['EM_USO', 'OBSOLETO', 'BAIXADO'],
  EM_TRANSFERENCIA: ['EM_USO', 'BAIXADO'],
  OBSOLETO: ['BAIXADO'],
  BAIXADO: [],
} as const;

// ─── Interface do serviço ─────────────────────────────────────────────────────

export interface IAtivoService {
  // Categorias de ativo
  listarCategorias(
    filter: CategoriaAtivoFilter,
    ctx: Ctx,
  ): Promise<PaginatedResult<CategoriaAtivoDto>>;

  obterCategoria(id: string, ctx: Ctx): Promise<CategoriaAtivoDto>;

  criarCategoria(data: CategoriaAtivoCreate, ctx: Ctx): Promise<CategoriaAtivoDto>;

  actualizarCategoria(
    id: string,
    data: CategoriaAtivoUpdate,
    ctx: Ctx,
  ): Promise<CategoriaAtivoDto>;

  arquivarCategoria(id: string, ctx: Ctx): Promise<void>;

  // Ativos
  listarAtivos(filter: AtivoFilter, ctx: Ctx): Promise<PaginatedResult<AtivoDto>>;

  obterAtivo(id: string, ctx: Ctx): Promise<AtivoDto>;

  obterAtivoPorCodigo(codigoInterno: string, ctx: Ctx): Promise<AtivoDto>;

  criarAtivo(data: AtivoCreate, ctx: Ctx): Promise<AtivoDto>;

  actualizarAtivo(id: string, data: AtivoUpdate, ctx: Ctx): Promise<AtivoDto>;

  /**
   * Transição de estado do ativo (via TRANSICOES_ATIVO).
   * Lança BusinessRuleError('TRANSICAO_INVALIDA') se a transição não for permitida.
   * Quando novoEstado === 'BAIXADO', gera lançamento contabilístico via WS D.
   */
  transitarEstado(
    id: string,
    novoEstado: string,
    ctx: Ctx,
    opts?: { observacoes?: string; contaDebitoId?: string; contaCreditoId?: string },
  ): Promise<AtivoDto>;

  arquivarAtivo(id: string, ctx: Ctx): Promise<void>;

  // Documentos
  adicionarDocumento(data: DocumentoAtivoCreate, ctx: Ctx): Promise<DocumentoAtivoDto>;

  removerDocumento(documentoId: string, ctx: Ctx): Promise<void>;

  // Movimentações
  listarMovimentacoes(
    ativoId: string,
    ctx: Ctx,
  ): Promise<MovimentacaoAtivoDto[]>;

  registarMovimentacao(
    data: MovimentacaoAtivoCreate,
    ctx: Ctx,
  ): Promise<MovimentacaoAtivoDto>;

  confirmarMovimentacao(
    movimentacaoId: string,
    confirmadaPor: string,
    ctx: Ctx,
  ): Promise<MovimentacaoAtivoDto>;

  // Relatório / exportação
  exportarRelatorioAtivos(filter: AtivoFilter, ctx: Ctx): Promise<string>; // CSV string
}
