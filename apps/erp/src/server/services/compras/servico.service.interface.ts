/**
 * Interface do serviço de Serviços — WS B (Wave 1: contratos)
 * Cobre: CategoriaServico, Servico, TecnicoServico, AgendamentoServico,
 *        AvaliacaoServico, ContratoServico
 *
 * Máquina de estado do Agendamento também exportada para property tests.
 * Implementação em Wave 2: servico.service.ts
 */
import 'server-only';

import type {
  CreateServicoInput,
  UpdateServicoInput,
  FilterServicoInput,
  CreateCategoriaServicoInput,
  UpdateCategoriaServicoSchema,
  CreateTecnicoServicoInput,
  UpdateTecnicoServicoSchema,
  FilterTecnicoServicoSchema,
  CreateAgendamentoServicoInput,
  UpdateAgendamentoServicoSchema,
  FilterAgendamentoServicoInput,
  CreateAvaliacaoServicoInput,
  CreateContratoServicoInput,
  UpdateContratoServicoSchema,
  FilterContratoServicoSchema,
} from '@/lib/validations/servicos';
import type { Ctx, PaginatedResult } from '@/server/services/types';
import type { z } from 'zod';

export type Dinheiro = number; // Decimal(18,2) — implementação usa Prisma.Decimal

// =====================================================================
// MÁQUINA DE ESTADO DO AGENDAMENTO
// =====================================================================

export type StatusAgendamento =
  | 'PENDENTE'
  | 'CONFIRMADO'
  | 'EM_ANDAMENTO'
  | 'CONCLUIDO'
  | 'CANCELADO'
  | 'NAO_COMPARECEU';

/**
 * Transições válidas para AgendamentoServico.
 * NAO_COMPARECEU: cliente não compareceu — estado terminal para registo histórico.
 * CONCLUIDO: serviço executado com sucesso — pode gerar avaliação.
 */
export const TRANSICOES_AGENDAMENTO: Record<StatusAgendamento, StatusAgendamento[]> = {
  PENDENTE: ['CONFIRMADO', 'CANCELADO'],
  CONFIRMADO: ['EM_ANDAMENTO', 'CANCELADO', 'NAO_COMPARECEU'],
  EM_ANDAMENTO: ['CONCLUIDO', 'CANCELADO'],
  CONCLUIDO: [],
  CANCELADO: [],
  NAO_COMPARECEU: [],
};

// =====================================================================
// TIPOS DE DOMÍNIO
// =====================================================================

export interface CategoriaServicoDto {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string;
  icone: string | null;
  ativo: boolean;
  ordem: number | null;
  totalServicos: number;
}

export interface ServicoResumo {
  id: string;
  codigo: string;
  nome: string;
  categoriaServicoId: string | null;
  categoriaNome: string | null;
  tipoServico: string;
  preco: Dinheiro;
  taxaIva: number;
  precoComIva: Dinheiro;
  disponivel: boolean;
  ativo: boolean;
  avaliacaoMedia: number | null;
  totalVendas: number;
}

export interface ServicoDetalhe extends ServicoResumo {
  descricao: string | null;
  subcategoria: string | null;
  precoMinimo: Dinheiro | null;
  precoMaximo: Dinheiro | null;
  duracaoEstimada: number;
  unidadeMedida: string;
  incluiMaterial: boolean;
  materialIncluido: string | null;
  requerAgendamento: boolean;
  requerTecnico: boolean;
  nivelTecnicoRequerido: string | null;
  diasDisponibilidade: string[];
  horaInicio: string | null;
  horaFim: string | null;
  imagem: string | null;
  observacoes: string | null;
  faturamentoTotal: Dinheiro;
  ultimaVenda: Date | null;
  numeroAvaliacoes: number;
}

export interface TecnicoServicoDto {
  id: string;
  colaboradorId: string;
  nome: string;
  email: string;
  telefone: string;
  especialidades: string[];
  nivelTecnico: string;
  disponivel: boolean;
  agendamentosAtivos: number;
  avaliacaoMedia: number | null;
  custoHora: Dinheiro;
}

export interface AgendamentoResumo {
  id: string;
  codigo: string;
  servicoId: string;
  servicoNome: string;
  clienteId: string;
  clienteNome: string;
  tecnicoId: string | null;
  tecnicoNome: string | null;
  dataAgendamento: Date;
  horaInicio: string;
  horaFim: string;
  status: StatusAgendamento;
  total: Dinheiro;
}

export interface AgendamentoDetalhe extends AgendamentoResumo {
  clienteEmail: string;
  clienteTelefone: string;
  duracaoEstimada: number;
  local: string;
  endereco: string;
  cidade: string;
  provincia: string;
  precoServico: Dinheiro;
  desconto: Dinheiro | null;
  taxaIva: number;
  observacoes: string | null;
  notasConclusao: string | null;
}

export interface AvaliacaoServicoDto {
  id: string;
  agendamentoServicoId: string;
  servicoId: string;
  clienteId: string;
  clienteNome: string;
  nota: number;
  comentario: string | null;
  aspectosPositivos: string[];
  aspectosNegativos: string[];
  recomendaria: boolean;
  createdAt: Date;
}

export interface ContratoServicoDto {
  id: string;
  codigo: string;
  clienteId: string;
  clienteNome: string;
  servicosIds: string[];
  dataInicio: Date;
  dataFim: Date;
  renovacaoAutomatica: boolean;
  periodicidade: string;
  valorMensal: Dinheiro;
  status: string;
  diasParaExpirar: number; // negativo se expirado
}

// =====================================================================
// Contrato do serviço
// =====================================================================

export interface IServicoService {
  // ---- Categorias ----
  criarCategoria(input: CreateCategoriaServicoInput, ctx: Ctx): Promise<CategoriaServicoDto>;
  listarCategorias(ctx: Ctx): Promise<CategoriaServicoDto[]>;
  actualizarCategoria(
    id: string,
    input: z.infer<typeof UpdateCategoriaServicoSchema>,
    ctx: Ctx,
  ): Promise<CategoriaServicoDto>;

  // ---- Serviços ----
  criarServico(input: CreateServicoInput, ctx: Ctx): Promise<ServicoDetalhe>;
  actualizarServico(id: string, input: UpdateServicoInput, ctx: Ctx): Promise<ServicoDetalhe>;
  obterServico(id: string, ctx: Ctx): Promise<ServicoDetalhe>;
  listarServicos(filtros: FilterServicoInput, ctx: Ctx): Promise<PaginatedResult<ServicoResumo>>;
  arquivarServico(id: string, ctx: Ctx): Promise<void>;

  // ---- Técnicos ----
  criarTecnico(input: CreateTecnicoServicoInput, ctx: Ctx): Promise<TecnicoServicoDto>;
  actualizarTecnico(
    id: string,
    input: z.infer<typeof UpdateTecnicoServicoSchema>,
    ctx: Ctx,
  ): Promise<TecnicoServicoDto>;
  listarTecnicos(
    filtros: z.infer<typeof FilterTecnicoServicoSchema>,
    ctx: Ctx,
  ): Promise<PaginatedResult<TecnicoServicoDto>>;
  tecnicosDisponiveis(
    dataAgendamento: Date,
    horaInicio: string,
    horaFim: string,
    ctx: Ctx,
  ): Promise<TecnicoServicoDto[]>;

  // ---- Agendamentos ----
  criarAgendamento(input: CreateAgendamentoServicoInput, ctx: Ctx): Promise<AgendamentoDetalhe>;
  actualizarAgendamento(
    id: string,
    input: z.infer<typeof UpdateAgendamentoServicoSchema>,
    ctx: Ctx,
  ): Promise<AgendamentoDetalhe>;
  obterAgendamento(id: string, ctx: Ctx): Promise<AgendamentoDetalhe>;
  listarAgendamentos(
    filtros: FilterAgendamentoServicoInput,
    ctx: Ctx,
  ): Promise<PaginatedResult<AgendamentoResumo>>;
  /** Transição de estado com validação via TRANSICOES_AGENDAMENTO. */
  transitarAgendamento(
    id: string,
    novoStatus: StatusAgendamento,
    notasConclusao: string | undefined,
    ctx: Ctx,
  ): Promise<AgendamentoDetalhe>;

  // ---- Avaliações ----
  registarAvaliacao(
    input: CreateAvaliacaoServicoInput,
    ctx: Ctx,
  ): Promise<AvaliacaoServicoDto>;
  listarAvaliacoes(
    servicoId: string,
    ctx: Ctx,
  ): Promise<AvaliacaoServicoDto[]>;

  // ---- Contratos de Serviço ----
  criarContrato(input: CreateContratoServicoInput, ctx: Ctx): Promise<ContratoServicoDto>;
  actualizarContrato(
    id: string,
    input: z.infer<typeof UpdateContratoServicoSchema>,
    ctx: Ctx,
  ): Promise<ContratoServicoDto>;
  listarContratos(
    filtros: z.infer<typeof FilterContratoServicoSchema>,
    ctx: Ctx,
  ): Promise<PaginatedResult<ContratoServicoDto>>;
  /** Renovar contrato com nova dataFim (baseada em periodicidade). */
  renovarContrato(id: string, ctx: Ctx): Promise<ContratoServicoDto>;
  /** Contratos a expirar nos próximos N dias. */
  contratosAExpirar(diasAntecedencia: number, ctx: Ctx): Promise<ContratoServicoDto[]>;
}
