/**
 * Interface de serviço — Clientes (WS C)
 * ADR-0003: import 'server-only'; Ctx/TxClient de types.ts (sem redefinição local).
 * Wave 1: tipos de retorno como interfaces TS standalone (Prisma não gerado ainda).
 * Decimal fields serialized as string (ADR A9).
 */
import 'server-only';

import type {
  CreateClienteInput,
  UpdateClienteInput,
  FilterClienteInput,
  CreateEnderecoClienteInput,
  UpdateEnderecoClienteInput,
  CreateContactoClienteInput,
  UpdateContactoClienteInput,
  CreateSegmentacaoClienteInput,
  UpdateSegmentacaoClienteInput,
} from '@/lib/validations/clientes';

// ADR-0003 ponto 6: Ctx e TxClient de fonte única
import type { Ctx, TxClient } from '@/server/services/types';
export type { Ctx, TxClient };

// ---------------------------------------------------------------------------
// Tipos de resultado (Wave 2: substituir por tipos Prisma gerados)
// ---------------------------------------------------------------------------

export interface EnderecoClienteRow {
  id: string;
  tenantId: string;
  clienteId: string;
  tipo: 'FACTURACAO' | 'ENTREGA' | 'OUTRO';
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  provincia: string;
  codigoPostal: string | null;
  referencia: string | null;
  principal: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactoClienteRow {
  id: string;
  tenantId: string;
  clienteId: string;
  nome: string;
  cargo: string | null;
  email: string;
  telefone: string;
  telefoneSec: string | null;
  tipo: 'PRINCIPAL' | 'SECUNDARIO' | 'TECNICO' | 'FINANCEIRO';
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SegmentacaoClienteRow {
  id: string;
  tenantId: string;
  clienteId: string;
  segmento: 'VAREJO' | 'GROSSISTA' | 'DISTRIBUIDOR' | 'CORPORATIVO' | 'GOVERNO';
  industria: string | null;
  tamanhoEmpresa: 'MICRO' | 'PEQUENA' | 'MEDIA' | 'GRANDE' | null;
  potencialVendas: 'ALTO' | 'MEDIO' | 'BAIXO';
  frequenciaCompra: 'DIARIA' | 'SEMANAL' | 'MENSAL' | 'TRIMESTRAL' | 'ANUAL';
  /** Decimal serializado (string) — Prisma.Decimal na implementação (ADR A9) */
  ticketMedio: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface HistoricoTransacaoRow {
  id: string;
  tenantId: string;
  clienteId: string;
  tipo: 'VENDA' | 'DEVOLUCAO' | 'PAGAMENTO' | 'AJUSTE' | 'NOTA_CREDITO';
  referencia: string;
  descricao: string;
  /** Decimal serializado (string) — Prisma.Decimal na implementação (ADR A9) */
  valor: string;
  currency: string;
  dataTransacao: Date;
  status: 'CONCLUIDO' | 'PENDENTE' | 'CANCELADO';
  userId: string;
  createdAt: Date;
}

/** Representação completa de cliente (detalhe, com relações opcionais). */
export interface ClienteRow {
  id: string;
  tenantId: string;
  codigo: string;
  nome: string;
  tipo: 'FISICA' | 'JURIDICA' | 'REVENDEDOR';
  nuit: string;
  bi: string | null;
  email: string;
  telefone: string;
  telefoneSec: string | null;
  diasPagamento: number;
  /** Decimal serializado (string) — Prisma.Decimal na implementação (ADR A9) */
  limiteCreditoMT: string;
  creditoUtilizadoMT: string;
  status: 'ATIVO' | 'INATIVO' | 'SUSPENSO';
  categoria: 'VIP' | 'REGULAR' | 'NOVO' | 'INATIVO';
  observacoes: string | null;
  representanteNome: string | null;
  representanteEmail: string | null;
  representanteTelefone: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  // Relações carregadas a pedido
  enderecos?: EnderecoClienteRow[];
  contactos?: ContactoClienteRow[];
  segmentacao?: SegmentacaoClienteRow | null;
}

/** Resumo de cliente para listagens (sem relações pesadas). */
export interface ClienteSummary {
  id: string;
  codigo: string;
  nome: string;
  tipo: 'FISICA' | 'JURIDICA' | 'REVENDEDOR';
  nuit: string;
  email: string;
  telefone: string;
  status: 'ATIVO' | 'INATIVO' | 'SUSPENSO';
  categoria: 'VIP' | 'REGULAR' | 'NOVO' | 'INATIVO';
  enderecosCidade: string;
  createdAt: Date;
}

export interface PaginatedClientes {
  items: ClienteSummary[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Interface do serviço
// ---------------------------------------------------------------------------

export interface IClienteService {
  // --- CRUD principal ---
  criar(input: CreateClienteInput, ctx: Ctx): Promise<ClienteRow>;
  buscarPorId(id: string, ctx: Ctx): Promise<ClienteRow>;
  listar(filtros: FilterClienteInput, ctx: Ctx): Promise<PaginatedClientes>;
  atualizar(id: string, input: UpdateClienteInput, ctx: Ctx): Promise<ClienteRow>;
  /**
   * Soft delete — marca deletedAt; não remove registos transaccionais.
   * Lança BusinessRuleError('CLIENTE_COM_DEBITOS_PENDENTES') se creditoUtilizadoMT > 0.
   */
  desativar(id: string, ctx: Ctx): Promise<void>;

  // --- Endereços ---
  adicionarEndereco(
    clienteId: string,
    input: CreateEnderecoClienteInput,
    ctx: Ctx,
  ): Promise<EnderecoClienteRow>;
  atualizarEndereco(
    clienteId: string,
    enderecoId: string,
    input: UpdateEnderecoClienteInput,
    ctx: Ctx,
  ): Promise<EnderecoClienteRow>;
  removerEndereco(clienteId: string, enderecoId: string, ctx: Ctx): Promise<void>;
  definirEnderecoPrincipal(clienteId: string, enderecoId: string, ctx: Ctx): Promise<void>;

  // --- Contactos ---
  adicionarContacto(
    clienteId: string,
    input: CreateContactoClienteInput,
    ctx: Ctx,
  ): Promise<ContactoClienteRow>;
  atualizarContacto(
    clienteId: string,
    contactoId: string,
    input: UpdateContactoClienteInput,
    ctx: Ctx,
  ): Promise<ContactoClienteRow>;
  removerContacto(clienteId: string, contactoId: string, ctx: Ctx): Promise<void>;

  // --- Segmentação ---
  atualizarSegmentacao(
    clienteId: string,
    input: CreateSegmentacaoClienteInput | UpdateSegmentacaoClienteInput,
    ctx: Ctx,
  ): Promise<SegmentacaoClienteRow>;

  // --- Histórico (append-only) ---
  obterHistorico(
    clienteId: string,
    filtro: { dataInicio?: Date; dataFim?: Date; cursor?: string; take?: number },
    ctx: Ctx,
  ): Promise<{ items: HistoricoTransacaoRow[]; nextCursor: string | null }>;

  // --- Crédito (chamado internamente dentro de $transaction pelo VendaService) ---
  /**
   * Incrementa o crédito utilizado do cliente.
   * valor como string decimal (ADR A9 — evita imprecisão de float JS).
   * Lança BusinessRuleError('LIMITE_CREDITO_EXCEDIDO') se ultrapassar o limite.
   */
  incrementarCreditoUtilizado(
    tx: TxClient,
    clienteId: string,
    valor: string,
    ctx: Ctx,
  ): Promise<void>;

  liberarCredito(
    tx: TxClient,
    clienteId: string,
    valor: string,
    ctx: Ctx,
  ): Promise<void>;
}
