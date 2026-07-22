/**
 * Interface do serviço de Fornecedores — WS B (Wave 1: contratos)
 * Implementação em Wave 2: fornecedor.service.ts
 */
import 'server-only';

import type {
  CreateFornecedorInput,
  UpdateFornecedorInput,
  FilterFornecedorInput,
  CreateContactoFornecedorSchema,
  UpdateContactoFornecedorSchema,
  CreateDocumentoFornecedorSchema,
  CreateAvaliacaoFornecedorSchema,
} from '@/lib/validations/fornecedores';
import type { Ctx, PaginatedResult } from '@/server/services/types';
import type { z } from 'zod';

export type Dinheiro = number; // Decimal(18,2) em MZN — implementação usa Prisma.Decimal

export interface FornecedorResumo {
  id: string;
  codigo: string;
  nome: string;
  nuit: string;
  email: string;
  status: 'ATIVO' | 'INATIVO' | 'SUSPENSO';
  classificacao: 'PREFERENCIAL' | 'REGULAR' | 'NOVO';
  rating: number | null;
  saldoDevedor: Dinheiro;
  totalCompras: Dinheiro;
  ultimaCompra: Date | null;
  createdAt: Date;
}

export interface FornecedorDetalhe extends FornecedorResumo {
  tipo: 'PESSOA_FISICA' | 'PESSOA_JURIDICA';
  bi: string | null;
  telefone: string | null;
  categoria: string | null;
  limiteCredito: Dinheiro | null;
  diasPagamento: number;
  prazoMedioPagamento: number;
  condicoesPagamento: string | null;
  formasPagamento: string[];
  condicoesComerciaisDesconto: number | null;
  avaliacaoQualidade: number | null;
  observacoes: string | null;
  tags: string[];
  enderecos: EnderecoFornecedorDto[];
  contactos: ContactoFornecedorDto[];
  documentos: DocumentoFornecedorDto[];
}

export interface EnderecoFornecedorDto {
  id: string;
  tipo: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  provincia: string;
  codigoPostal: string | null;
  referencia: string | null;
  principal: boolean;
}

export interface ContactoFornecedorDto {
  id: string;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  tipo: string;
  ativo: boolean;
}

export interface DocumentoFornecedorDto {
  id: string;
  tipo: string;
  nome: string;
  dataUpload: Date;
  dataValidade: Date | null;
  url: string;
}

export interface ScoreFornecedor {
  fornecedorId: string;
  ratingCalculado: number;
  qualidadeMedia: number;
  prazoMedia: number;
  precoMedia: number;
  comunicacaoMedia: number;
  totalAvaliacoes: number;
}

// ---- Aging de contas a pagar ----
export interface AgingContasPagar {
  fornecedorId: string;
  nomeFornecedor: string;
  totalAberto: Dinheiro;
  ate30Dias: Dinheiro;
  de31a60Dias: Dinheiro;
  de61a90Dias: Dinheiro;
  acima90Dias: Dinheiro;
}

// =====================================================================
// Contrato de serviço
// =====================================================================

export interface IFornecedorService {
  // ---- CRUD ----
  criar(input: CreateFornecedorInput, ctx: Ctx): Promise<FornecedorDetalhe>;
  actualizar(id: string, input: UpdateFornecedorInput, ctx: Ctx): Promise<FornecedorDetalhe>;
  /** Soft delete — apenas marca deletedAt; não remove. */
  arquivar(id: string, ctx: Ctx): Promise<void>;
  obter(id: string, ctx: Ctx): Promise<FornecedorDetalhe>;
  listar(filtros: FilterFornecedorInput, ctx: Ctx): Promise<PaginatedResult<FornecedorResumo>>;

  // ---- Contactos ----
  adicionarContacto(
    fornecedorId: string,
    input: z.infer<typeof CreateContactoFornecedorSchema>,
    ctx: Ctx,
  ): Promise<ContactoFornecedorDto>;
  actualizarContacto(
    contactoId: string,
    input: z.infer<typeof UpdateContactoFornecedorSchema>,
    ctx: Ctx,
  ): Promise<ContactoFornecedorDto>;
  removerContacto(contactoId: string, ctx: Ctx): Promise<void>;

  // ---- Documentos ----
  adicionarDocumento(
    input: z.infer<typeof CreateDocumentoFornecedorSchema>,
    ctx: Ctx,
  ): Promise<DocumentoFornecedorDto>;
  removerDocumento(documentoId: string, ctx: Ctx): Promise<void>;

  // ---- Avaliação e scoring ----
  registarAvaliacao(
    input: z.infer<typeof CreateAvaliacaoFornecedorSchema>,
    ctx: Ctx,
  ): Promise<void>;
  calcularScore(fornecedorId: string, ctx: Ctx): Promise<ScoreFornecedor>;
  obterAging(ctx: Ctx): Promise<AgingContasPagar[]>;
}
