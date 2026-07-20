import 'server-only'; // A5: serviços são server-only
import type { Prisma } from '@prisma/client';
import type {
  CriarSerieDocumentoInput,
  EmitirFaturaInput,
  RegistarPagamentoFaturaInput,
  FiltroFaturaInput,
  EmitirNotaCreditoInput,
  FiltroNotaCreditoInput,
  EmitirNotaDebitoInput,
  FiltroNotaDebitoInput,
  CriarProformaInput,
  FiltroProformaInput,
  CriarCotacaoComercialInput,
  FiltroCotacaoComercialInput,
} from '@/lib/validations/faturacao';

// ---------------------------------------------------------------------------
// Contexto
// ---------------------------------------------------------------------------

export interface Ctx {
  tenantId: string;
  userId: string;
}

// ---------------------------------------------------------------------------
// Tipos de domínio (espelham o que Prisma gerará após generate)
// ---------------------------------------------------------------------------

// ADR-0003 ponto 3: enum unificado cobrindo documentos fiscais E operacionais.
// FONTE CANÓNICA = enum `TipoSerieDocumento` em prisma/schema/financas.prisma.
// Esta união TS existe só porque o tipo é usado em validations client-shared (não
// pode importar @prisma/client). Manter em paridade — parity test na Wave 2.
export type TipoSerieDocumento =
  | 'FATURA'
  | 'NOTA_CREDITO'
  | 'NOTA_DEBITO'
  | 'PROFORMA'
  | 'COTACAO_COMERCIAL'
  | 'RECIBO'
  // Operacionais (B6)
  | 'VENDA'
  | 'SESSAO_CAIXA'
  | 'REQUISICAO_COMPRA'
  | 'COTACAO_RFQ'
  | 'PEDIDO_COMPRA'
  | 'CONTA_PAGAR'
  | 'PAGAMENTO'
  | 'RECEBIMENTO'
  | 'ORDEM_PRODUCAO'
  | 'ATIVIDADE'
  | 'TICKET'
  | 'ENTREGA'
  // WS A — spec 05
  | 'CONTAGEM_STOCK'
  // WS-10: Vendas — Encomendas e Devoluções
  | 'ENCOMENDA'
  | 'NOTA_DEVOLUCAO';

export type StatusFatura =
  | 'RASCUNHO'
  | 'EMITIDA'
  | 'PAGA'
  | 'PARCIALMENTE_PAGA'
  | 'VENCIDA'
  | 'CANCELADA';

export type StatusNotaCredito = 'RASCUNHO' | 'EMITIDA' | 'LIQUIDADA' | 'CANCELADA';
export type StatusNotaDebito = 'RASCUNHO' | 'EMITIDA' | 'LIQUIDADA' | 'CANCELADA';
export type StatusProforma =
  | 'RASCUNHO'
  | 'ENVIADA'
  | 'ACEITE'
  | 'CONVERTIDA'
  | 'EXPIRADA'
  | 'CANCELADA';

export type StatusCotacaoComercial =
  | 'RASCUNHO'
  | 'ENVIADA'
  | 'ACEITE'
  | 'REJEITADA'
  | 'CONVERTIDA'
  | 'EXPIRADA'
  | 'CANCELADA';

export interface SerieDocumento {
  id: string;
  tenantId: string;
  tipo: TipoSerieDocumento;
  prefixo: string;
  ano: number;
  proximoNumero: number;
  formatoNumero: string;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Fatura {
  id: string;
  tenantId: string;
  serieDocumentoId: string;
  numero: string;
  clienteId: string;
  vendaId: string | null;
  moeda: string;
  subtotal: Prisma.Decimal;
  descontoTotal: Prisma.Decimal;
  baseIva: Prisma.Decimal;
  ivaTotal: Prisma.Decimal;
  total: Prisma.Decimal;
  totalPago: Prisma.Decimal;
  status: StatusFatura;
  dataEmissao: Date;
  dataVencimento: Date;
  dataPagamento: Date | null;
  observacoes: string | null;
  qrCode: string | null;
  hashValidacao: string | null;
  caminhoArquivoPdf: string | null;
  lancamentoId: string | null;
  emitidoPorId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LinhaFatura {
  id: string;
  tenantId: string;
  faturaId: string;
  produtoId: string | null;
  descricao: string;
  quantidade: Prisma.Decimal;
  precoUnitario: Prisma.Decimal;
  desconto: Prisma.Decimal;
  taxaIva: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  ivaItem: Prisma.Decimal;
  total: Prisma.Decimal;
  ordemLinha: number;
  createdAt: Date;
}

export interface NotaCredito {
  id: string;
  tenantId: string;
  serieDocumentoId: string;
  numero: string;
  faturaOriginalId: string;
  motivo: string;
  moeda: string;
  subtotal: Prisma.Decimal;
  descontoTotal: Prisma.Decimal;
  ivaTotal: Prisma.Decimal;
  total: Prisma.Decimal;
  status: StatusNotaCredito;
  dataEmissao: Date;
  observacoes: string | null;
  lancamentoId: string | null;
  emitidoPorId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LinhaNotaCredito {
  id: string;
  tenantId: string;
  notaCreditoId: string;
  produtoId: string | null;
  descricao: string;
  quantidade: Prisma.Decimal;
  precoUnitario: Prisma.Decimal;
  desconto: Prisma.Decimal;
  taxaIva: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  ivaItem: Prisma.Decimal;
  total: Prisma.Decimal;
  ordemLinha: number;
  createdAt: Date;
}

export interface NotaDebito {
  id: string;
  tenantId: string;
  serieDocumentoId: string;
  numero: string;
  clienteId: string;
  faturaReferenciaId: string | null;
  motivo: string;
  moeda: string;
  subtotal: Prisma.Decimal;
  descontoTotal: Prisma.Decimal;
  ivaTotal: Prisma.Decimal;
  total: Prisma.Decimal;
  status: StatusNotaDebito;
  dataEmissao: Date;
  observacoes: string | null;
  lancamentoId: string | null;
  emitidoPorId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LinhaNotaDebito {
  id: string;
  tenantId: string;
  notaDebitoId: string;
  produtoId: string | null;
  descricao: string;
  quantidade: Prisma.Decimal;
  precoUnitario: Prisma.Decimal;
  desconto: Prisma.Decimal;
  taxaIva: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  ivaItem: Prisma.Decimal;
  total: Prisma.Decimal;
  ordemLinha: number;
  createdAt: Date;
}

export interface Proforma {
  id: string;
  tenantId: string;
  serieDocumentoId: string;
  numero: string;
  clienteId: string;
  moeda: string;
  subtotal: Prisma.Decimal;
  descontoTotal: Prisma.Decimal;
  ivaTotal: Prisma.Decimal;
  total: Prisma.Decimal;
  status: StatusProforma;
  dataEmissao: Date;
  dataValidade: Date;
  faturaId: string | null;
  observacoes: string | null;
  criadoPorId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LinhaProforma {
  id: string;
  tenantId: string;
  proformaId: string;
  produtoId: string | null;
  descricao: string;
  quantidade: Prisma.Decimal;
  precoUnitario: Prisma.Decimal;
  desconto: Prisma.Decimal;
  taxaIva: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  ivaItem: Prisma.Decimal;
  total: Prisma.Decimal;
  ordemLinha: number;
  createdAt: Date;
}

export interface CotacaoComercial {
  id: string;
  tenantId: string;
  serieDocumentoId: string;
  numero: string;
  clienteId: string;
  moeda: string;
  subtotal: Prisma.Decimal;
  descontoTotal: Prisma.Decimal;
  ivaTotal: Prisma.Decimal;
  total: Prisma.Decimal;
  status: StatusCotacaoComercial;
  dataEmissao: Date;
  dataValidade: Date;
  proformaId: string | null;
  faturaId: string | null;
  observacoes: string | null;
  condicoesComerciais: string | null;
  criadoPorId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LinhaCotacaoComercial {
  id: string;
  tenantId: string;
  cotacaoComercialId: string;
  produtoId: string | null;
  descricao: string;
  quantidade: Prisma.Decimal;
  precoUnitario: Prisma.Decimal;
  desconto: Prisma.Decimal;
  taxaIva: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  ivaItem: Prisma.Decimal;
  total: Prisma.Decimal;
  ordemLinha: number;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Máquinas de estado
// ---------------------------------------------------------------------------

/**
 * Transições de Fatura.
 *
 * RASCUNHO          → EMITIDA
 * EMITIDA           → PAGA | PARCIALMENTE_PAGA | VENCIDA | CANCELADA
 * PARCIALMENTE_PAGA → PAGA | VENCIDA
 * VENCIDA           → PAGA | PARCIALMENTE_PAGA | CANCELADA (via nota de crédito)
 * PAGA              → []  (terminal)
 * CANCELADA         → []  (terminal)
 *
 * Após EMITIDA, os campos financeiros são imutáveis;
 * correcção de valores apenas via NotaCredito referenciada.
 */
export const TRANSICOES_FATURA: Record<StatusFatura, StatusFatura[]> = {
  RASCUNHO: ['EMITIDA'],
  EMITIDA: ['PAGA', 'PARCIALMENTE_PAGA', 'VENCIDA', 'CANCELADA'],
  PARCIALMENTE_PAGA: ['PAGA', 'VENCIDA'],
  VENCIDA: ['PAGA', 'PARCIALMENTE_PAGA', 'CANCELADA'],
  PAGA: [],
  CANCELADA: [],
};

/**
 * Transições de NotaCredito.
 *
 * RASCUNHO → EMITIDA
 * EMITIDA  → LIQUIDADA | CANCELADA
 * LIQUIDADA → []  (terminal)
 * CANCELADA → []  (terminal)
 */
export const TRANSICOES_NOTA_CREDITO: Record<StatusNotaCredito, StatusNotaCredito[]> = {
  RASCUNHO: ['EMITIDA'],
  EMITIDA: ['LIQUIDADA', 'CANCELADA'],
  LIQUIDADA: [],
  CANCELADA: [],
};

/**
 * Transições de NotaDebito.
 *
 * RASCUNHO → EMITIDA
 * EMITIDA  → LIQUIDADA | CANCELADA
 * LIQUIDADA → []  (terminal)
 * CANCELADA → []  (terminal)
 */
export const TRANSICOES_NOTA_DEBITO: Record<StatusNotaDebito, StatusNotaDebito[]> = {
  RASCUNHO: ['EMITIDA'],
  EMITIDA: ['LIQUIDADA', 'CANCELADA'],
  LIQUIDADA: [],
  CANCELADA: [],
};

/**
 * Transições de Proforma.
 *
 * RASCUNHO → ENVIADA | CANCELADA
 * ENVIADA  → ACEITE | EXPIRADA | CANCELADA
 * ACEITE   → CONVERTIDA | CANCELADA
 * CONVERTIDA → []  (terminal)
 * EXPIRADA   → []  (terminal)
 * CANCELADA  → []  (terminal)
 */
export const TRANSICOES_PROFORMA: Record<StatusProforma, StatusProforma[]> = {
  RASCUNHO: ['ENVIADA', 'CANCELADA'],
  ENVIADA: ['ACEITE', 'EXPIRADA', 'CANCELADA'],
  ACEITE: ['CONVERTIDA', 'CANCELADA'],
  CONVERTIDA: [],
  EXPIRADA: [],
  CANCELADA: [],
};

/**
 * Transições de CotacaoComercial.
 *
 * RASCUNHO → ENVIADA | CANCELADA
 * ENVIADA  → ACEITE | REJEITADA | EXPIRADA
 * ACEITE   → CONVERTIDA
 * REJEITADA  → []  (terminal)
 * CONVERTIDA → []  (terminal)
 * EXPIRADA   → []  (terminal)
 * CANCELADA  → []  (terminal)
 */
export const TRANSICOES_COTACAO_COMERCIAL: Record<
  StatusCotacaoComercial,
  StatusCotacaoComercial[]
> = {
  RASCUNHO: ['ENVIADA', 'CANCELADA'],
  ENVIADA: ['ACEITE', 'REJEITADA', 'EXPIRADA'],
  ACEITE: ['CONVERTIDA'],
  REJEITADA: [],
  CONVERTIDA: [],
  EXPIRADA: [],
  CANCELADA: [],
};

// ---------------------------------------------------------------------------
// Funções de transição
// ---------------------------------------------------------------------------

type TransicoesMap<S extends string> = Record<S, S[]>;

function validarTransicao<S extends string>(
  mapa: TransicoesMap<S>,
  actual: S,
  alvo: S,
  entidade: string,
): void {
  const permitidas = mapa[actual] ?? ([] as S[]);
  if (!permitidas.includes(alvo)) {
    const err = new Error(
      `Transição inválida em ${entidade}: ${actual} → ${alvo}. Permitidas: ${permitidas.join(', ') || 'nenhuma'}`,
    );
    Object.assign(err, { code: 'TRANSICAO_INVALIDA', status: 409 });
    throw err;
  }
}

export const transitarFatura = (actual: StatusFatura, alvo: StatusFatura): void =>
  validarTransicao(TRANSICOES_FATURA, actual, alvo, 'Fatura');

export const transitarNotaCredito = (actual: StatusNotaCredito, alvo: StatusNotaCredito): void =>
  validarTransicao(TRANSICOES_NOTA_CREDITO, actual, alvo, 'NotaCredito');

export const transitarNotaDebito = (actual: StatusNotaDebito, alvo: StatusNotaDebito): void =>
  validarTransicao(TRANSICOES_NOTA_DEBITO, actual, alvo, 'NotaDebito');

export const transitarProforma = (actual: StatusProforma, alvo: StatusProforma): void =>
  validarTransicao(TRANSICOES_PROFORMA, actual, alvo, 'Proforma');

export const transitarCotacaoComercial = (
  actual: StatusCotacaoComercial,
  alvo: StatusCotacaoComercial,
): void => validarTransicao(TRANSICOES_COTACAO_COMERCIAL, actual, alvo, 'CotacaoComercial');

// ---------------------------------------------------------------------------
// Tipos de resultado
// ---------------------------------------------------------------------------

export interface FaturaCompleta extends Fatura {
  linhas: LinhaFatura[];
  serieDocumento: Pick<SerieDocumento, 'id' | 'tipo' | 'prefixo' | 'ano'>;
}

export interface NotaCreditoCompleta extends NotaCredito {
  linhas: LinhaNotaCredito[];
  faturaOriginal: Pick<Fatura, 'id' | 'numero' | 'total'>;
}

export interface NotaDebitoCompleta extends NotaDebito {
  linhas: LinhaNotaDebito[];
  faturaReferencia?: Pick<Fatura, 'id' | 'numero' | 'total'> | null;
}

export interface ProformaCompleta extends Proforma {
  linhas: LinhaProforma[];
}

export interface CotacaoComercialCompleta extends CotacaoComercial {
  linhas: LinhaCotacaoComercial[];
}

export interface PaginacaoFaturacao<T> {
  items: T[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Interface do serviço de faturação
// ---------------------------------------------------------------------------

export interface IFaturacaoService {
  // --- Séries de documento ---
  criarSerie(input: CriarSerieDocumentoInput, ctx: Ctx): Promise<SerieDocumento>;
  listarSeries(ctx: Ctx): Promise<SerieDocumento[]>;

  /**
   * Obtém o próximo número de série dentro de uma transacção,
   * usando UPDATE...RETURNING para serialização sem lacunas.
   * O número só persiste se a transacção confirmar (commit).
   *
   * Assinatura canónica exposta a TODOS os WS (B6, ADR decisão 3):
   *   `proximoNumeroSerie(tx, tipo, ctx)`
   * `tipo` é TipoSerieDocumento (enum unificado em D).
   * `tenantId` vem de ctx — nunca passado directamente.
   * WS A, B, C, E, F importam esta assinatura e NÃO criam variantes locais.
   *
   * @throws BusinessRuleError('SERIE_NAO_ENCONTRADA') se não existir série activa.
   */
  proximoNumeroSerie(
    tx: Prisma.TransactionClient,
    tipo: TipoSerieDocumento,
    ctx: Ctx,
  ): Promise<string>;

  // --- Facturas ---
  emitirFatura(input: EmitirFaturaInput, ctx: Ctx): Promise<FaturaCompleta>;
  obterFatura(id: string, ctx: Ctx): Promise<FaturaCompleta | null>;
  listarFaturas(
    filtro: FiltroFaturaInput,
    ctx: Ctx,
  ): Promise<PaginacaoFaturacao<FaturaCompleta>>;
  registarPagamento(
    input: RegistarPagamentoFaturaInput,
    ctx: Ctx,
  ): Promise<FaturaCompleta>;
  marcarVencida(faturaId: string, ctx: Ctx): Promise<Fatura>;

  // --- Notas de crédito ---
  emitirNotaCredito(input: EmitirNotaCreditoInput, ctx: Ctx): Promise<NotaCreditoCompleta>;
  obterNotaCredito(id: string, ctx: Ctx): Promise<NotaCreditoCompleta | null>;
  listarNotasCredito(
    filtro: FiltroNotaCreditoInput,
    ctx: Ctx,
  ): Promise<PaginacaoFaturacao<NotaCreditoCompleta>>;
  liquidarNotaCredito(id: string, ctx: Ctx): Promise<NotaCredito>;
  cancelarNotaCredito(id: string, motivo: string, ctx: Ctx): Promise<NotaCredito>;

  // --- Notas de débito ---
  emitirNotaDebito(input: EmitirNotaDebitoInput, ctx: Ctx): Promise<NotaDebitoCompleta>;
  obterNotaDebito(id: string, ctx: Ctx): Promise<NotaDebitoCompleta | null>;
  listarNotasDebito(
    filtro: FiltroNotaDebitoInput,
    ctx: Ctx,
  ): Promise<PaginacaoFaturacao<NotaDebitoCompleta>>;
  liquidarNotaDebito(id: string, ctx: Ctx): Promise<NotaDebito>;
  cancelarNotaDebito(id: string, motivo: string, ctx: Ctx): Promise<NotaDebito>;

  // --- Proformas ---
  criarProforma(input: CriarProformaInput, ctx: Ctx): Promise<ProformaCompleta>;
  enviarProforma(id: string, ctx: Ctx): Promise<Proforma>;
  aceitarProforma(id: string, ctx: Ctx): Promise<Proforma>;
  converterProformaEmFatura(id: string, serieDocumentoId: string, ctx: Ctx): Promise<FaturaCompleta>;
  cancelarProforma(id: string, motivo: string, ctx: Ctx): Promise<Proforma>;
  listarProformas(
    filtro: FiltroProformaInput,
    ctx: Ctx,
  ): Promise<PaginacaoFaturacao<ProformaCompleta>>;

  // --- Cotações comerciais ---
  criarCotacaoComercial(
    input: CriarCotacaoComercialInput,
    ctx: Ctx,
  ): Promise<CotacaoComercialCompleta>;
  enviarCotacaoComercial(id: string, ctx: Ctx): Promise<CotacaoComercial>;
  aceitarCotacaoComercial(id: string, ctx: Ctx): Promise<CotacaoComercial>;
  rejeitarCotacaoComercial(id: string, motivo: string, ctx: Ctx): Promise<CotacaoComercial>;
  converterCotacaoEmProforma(
    id: string,
    serieProformaId: string,
    ctx: Ctx,
  ): Promise<ProformaCompleta>;
  listarCotacoesComerciais(
    filtro: FiltroCotacaoComercialInput,
    ctx: Ctx,
  ): Promise<PaginacaoFaturacao<CotacaoComercialCompleta>>;
}
