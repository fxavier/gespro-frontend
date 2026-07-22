// Interface — Serviço de Viatura (WS F)
// Máquina de estado + CRUD. Wave 1: apenas tipos, mapa de transições e assinaturas.

import 'server-only';
import type { Ctx, PaginatedResult } from '@/server/services/types';
import type {
  CriarViaturaInput,
  AtualizarViaturaInput,
  FiltrarViaturasInput,
  CriarDocumentoViaturaInput,
  CriarManutencaoViaturaInput,
  CriarChecklistInput,
} from '@/lib/validations/transporte';

// ============================================================
// Máquina de estado da Viatura
// ============================================================

export type EstadoViatura =
  | 'DISPONIVEL'
  | 'EM_ACTIVIDADE'
  | 'EM_MANUTENCAO'
  | 'INACTIVA'
  | 'ABATIDA';

/**
 * Mapa de transições válidas da Viatura.
 *
 * Regras de negócio:
 * - DISPONIVEL → EM_ACTIVIDADE: só se todos os documentos são VALIDO ou PROXIMO_EXPIRAR
 *   (BusinessRuleError 'VIATURA_COM_DOCUMENTOS_EXPIRADOS' se existir algum EXPIRADO)
 * - EM_ACTIVIDADE → DISPONIVEL: atividade concluída ou cancelada pelo operador
 * - DISPONIVEL ↔ EM_MANUTENCAO: fluxo de manutenção
 * - DISPONIVEL | EM_MANUTENCAO → INACTIVA: desactivação administrativa
 * - INACTIVA → DISPONIVEL: reactivação
 * - DISPONIVEL | INACTIVA → ABATIDA: abate definitivo (estado terminal)
 *
 * Property tests (Wave 2): nenhuma sequência válida atinge ABATIDA acidentalmente;
 * toda a transição fora do mapa lança BusinessRuleError('TRANSICAO_INVALIDA').
 */
export const TRANSICOES_VIATURA: Readonly<Record<EstadoViatura, ReadonlyArray<EstadoViatura>>> = {
  DISPONIVEL:    ['EM_ACTIVIDADE', 'EM_MANUTENCAO', 'INACTIVA', 'ABATIDA'],
  EM_ACTIVIDADE: ['DISPONIVEL'],
  EM_MANUTENCAO: ['DISPONIVEL', 'INACTIVA'],
  INACTIVA:      ['DISPONIVEL', 'ABATIDA'],
  ABATIDA:       [],
};

// ============================================================
// Shapes de retorno
// ============================================================

export interface DocumentoViaturaRef {
  id: string;
  tipo: string;
  numero: string;
  dataEmissao: Date;
  dataValidade: Date;
  entidadeEmissora: string;
  estado: 'VALIDO' | 'PROXIMO_EXPIRAR' | 'EXPIRADO';
  prazoAlertaDias: number;
}

export interface ManutencaoViaturaRef {
  id: string;
  tipo: string;
  data: Date;
  quilometragem: number | null;
  descricao: string;
  /** Decimal serializado como string para evitar perda de precisão. */
  custo: string | null;
  proximaManutencaoData: Date | null;
}

export interface ItemChecklistRef {
  id: string;
  nome: string;
  categoria: string;
  estado: 'OK' | 'AVARIA' | 'FALTA';
  observacoes: string | null;
}

export interface ChecklistRef {
  id: string;
  dataInspeccao: Date;
  responsavel: string;
  itens: ItemChecklistRef[];
}

export interface ViaturaResumo {
  id: string;
  tenantId: string;
  matricula: string;
  marca: string;
  modelo: string;
  tipoViatura: string;
  /** Decimal serializado como string. */
  capacidade: string;
  unidadeCapacidade: string;
  localActividade: string;
  dataInicioActividade: Date;
  motoristaResponsavelId: string | null;
  estado: EstadoViatura;
  createdAt: Date;
  updatedAt: Date;
}

export interface ViaturaDetalhe extends ViaturaResumo {
  observacoes: string | null;
  documentos: DocumentoViaturaRef[];
  manutencoes: ManutencaoViaturaRef[];
  /** Checklist mais recente; null se nunca inspeccionada. */
  checklistRecente: ChecklistRef | null;
}

// ============================================================
// Contrato do serviço (implementado na Wave 2)
// ============================================================

export interface IViaturaService {
  /**
   * Valida e executa uma transição de estado.
   * Lança BusinessRuleError('TRANSICAO_INVALIDA') se fora do mapa.
   * Lança BusinessRuleError('VIATURA_COM_DOCUMENTOS_EXPIRADOS') ao ir para EM_ACTIVIDADE.
   */
  transitarViatura(
    viaturaId: string,
    estadoAlvo: EstadoViatura,
    ctx: Ctx,
    motivo?: string,
  ): Promise<ViaturaDetalhe>;

  criarViatura(input: CriarViaturaInput, ctx: Ctx): Promise<ViaturaDetalhe>;

  obterViatura(id: string, ctx: Ctx): Promise<ViaturaDetalhe>;

  listarViaturas(
    filtros: FiltrarViaturasInput,
    ctx: Ctx,
  ): Promise<PaginatedResult<ViaturaResumo>>;

  atualizarViatura(
    id: string,
    input: AtualizarViaturaInput,
    ctx: Ctx,
  ): Promise<ViaturaDetalhe>;

  adicionarDocumentoViatura(
    input: CriarDocumentoViaturaInput,
    ctx: Ctx,
  ): Promise<DocumentoViaturaRef>;

  registarManutencao(
    input: CriarManutencaoViaturaInput,
    ctx: Ctx,
  ): Promise<ManutencaoViaturaRef>;

  registarChecklist(
    input: CriarChecklistInput,
    ctx: Ctx,
  ): Promise<ChecklistRef>;
}
