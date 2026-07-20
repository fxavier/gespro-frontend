import 'server-only'; // A5: serviços são server-only
import type { Prisma } from '@prisma/client';
import type {
  CriarContaPGCInput,
  AtualizarContaPGCInput,
  FiltroContaPGCInput,
  CriarDiarioInput,
  AtualizarDiarioInput,
  CriarCentroCustoInput,
  AtualizarCentroCustoInput,
  FiltroCentroCustoInput,
  CriarLancamentoInput,
  EstornarLancamentoInput,
  FiltroLancamentoInput,
  CriarContaBancariaInput,
  AtualizarContaBancariaInput,
  IniciarReconciliacaoInput,
  MarcarItemReconciliadoInput,
  ImportarExtratoInput,
  AutoMatchInput,
  ConcluirReconciliacaoInput,
  FiltroBalanceteInput,
  FiltroRazaoInput,
  FiltroDREInput,
} from '@/lib/validations/contabilidade';
import type { MatchSugerido } from './reconciliacao.helpers';

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

export type ClassePGC =
  | 'CLASSE_1'
  | 'CLASSE_2'
  | 'CLASSE_3'
  | 'CLASSE_4'
  | 'CLASSE_5'
  | 'CLASSE_6'
  | 'CLASSE_7'
  | 'CLASSE_8';

export type TipoConta = 'ATIVO' | 'PASSIVO' | 'CAPITAL_PROPRIO' | 'RENDIMENTO' | 'GASTO' | 'RESULTADO';
export type NaturezaConta = 'DEVEDORA' | 'CREDORA';
export type TipoDiario =
  | 'VENDAS'
  | 'COMPRAS'
  | 'CAIXA'
  | 'BANCO'
  | 'OPERACOES'
  | 'SALARIOS'
  | 'ABERTURA'
  | 'ENCERRAMENTO'
  | 'OUTROS';

export type StatusLancamento = 'RASCUNHO' | 'LANCADO' | 'ESTORNADO';
export type OrigemLancamento =
  | 'MANUAL'
  | 'VENDA'
  | 'COMPRA'
  | 'PAGAMENTO'
  | 'RECEBIMENTO'
  | 'AJUSTE'
  | 'AMORTIZACAO'
  | 'PRODUCAO'
  | 'CAIXA'
  | 'RECONCILIACAO';

export type TipoPartida = 'DEBITO' | 'CREDITO';
export type TipoCentroCusto = 'DEPARTAMENTO' | 'PROJETO' | 'FILIAL' | 'OUTRO';
export type TipoContaBancaria = 'CORRENTE' | 'POUPANCA' | 'DEPOSITO_PRAZO';
export type StatusReconciliacao = 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';

export interface ContaPGC {
  id: string;
  tenantId: string;
  codigo: string;
  nome: string;
  classe: ClassePGC;
  tipo: TipoConta;
  natureza: NaturezaConta;
  nivel: number;
  contaPaiId: string | null;
  aceitaLancamento: boolean;
  ativo: boolean;
  descricao: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Diario {
  id: string;
  tenantId: string;
  codigo: string;
  nome: string;
  tipo: TipoDiario;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CentroCusto {
  id: string;
  tenantId: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  tipo: TipoCentroCusto;
  responsavelId: string | null;
  orcamento: Prisma.Decimal | null;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Lancamento {
  id: string;
  tenantId: string;
  numero: string;
  data: Date;
  tipo: string;
  origem: OrigemLancamento;
  diarioId: string;
  documentoOrigemId: string | null;
  documentoOrigemTipo: string | null;
  historico: string;
  valorTotal: Prisma.Decimal;
  status: StatusLancamento;
  lancamentoEstornoId: string | null;
  periodoFiscal: string;
  observacoes: string | null;
  criadoPorId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PartidaLancamento {
  id: string;
  tenantId: string;
  lancamentoId: string;
  contaId: string;
  centroCustoId: string | null;
  tipo: TipoPartida;
  valor: Prisma.Decimal;
  historico: string | null;
  createdAt: Date;
}

export interface ContaBancaria {
  id: string;
  tenantId: string;
  banco: string;
  agencia: string;
  numeroConta: string;
  tipoConta: TipoContaBancaria;
  moeda: string;
  saldoAtual: Prisma.Decimal;
  contaContabilId: string;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReconciliacaoBancaria {
  id: string;
  tenantId: string;
  contaBancariaId: string;
  dataInicio: Date;
  dataFim: Date;
  saldoInicialBanco: Prisma.Decimal;
  saldoFinalBanco: Prisma.Decimal;
  saldoInicialContabil: Prisma.Decimal;
  saldoFinalContabil: Prisma.Decimal;
  diferencaNaoConciliada: Prisma.Decimal;
  status: StatusReconciliacao;
  observacoes: string | null;
  responsavelId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type TipoItemReconciliacao = 'LANCAMENTO_CONTABIL' | 'EXTRATO_BANCARIO';

export interface ItemReconciliacaoBancaria {
  id: string;
  tenantId: string;
  reconciliacaoId: string;
  tipo: string; // TipoItemReconciliacao
  data: Date;
  descricao: string;
  valor: Prisma.Decimal;
  tipoMovimento: TipoPartida;
  conciliado: boolean;
  lancamentoId: string | null;
  extratoReferencia: string | null;
  itemParId: string | null;
  observacoes: string | null;
  createdAt: Date;
}

/** Detalhe do workspace de matching: razão vs extracto + saldos. */
export interface ReconciliacaoDetalhe extends ReconciliacaoBancaria {
  contaBancaria: Pick<ContaBancaria, 'id' | 'banco' | 'agencia' | 'numeroConta' | 'contaContabilId'>;
  itensRazao: ItemReconciliacaoBancaria[];
  itensExtrato: ItemReconciliacaoBancaria[];
}

export interface ReconciliacaoComConta extends ReconciliacaoBancaria {
  contaBancaria: Pick<ContaBancaria, 'id' | 'banco' | 'numeroConta'>;
}

export type { MatchSugerido };

// ---------------------------------------------------------------------------
// Máquina de estado: Lancamento
// ---------------------------------------------------------------------------

/**
 * Mapa de transições válidas por estado.
 *
 * RASCUNHO  → LANCADO    (confirmação pelo utilizador)
 * LANCADO   → ESTORNADO  (geração de lançamento compensatório)
 * ESTORNADO → []         (terminal)
 *
 * Nota: lançamentos AUTOMATICOS passam directamente de RASCUNHO → LANCADO
 * dentro da transacção que os origina (não há interacção de utilizador).
 */
export const TRANSICOES_LANCAMENTO: Record<StatusLancamento, StatusLancamento[]> = {
  RASCUNHO: ['LANCADO'],
  LANCADO: ['ESTORNADO'],
  ESTORNADO: [],
};

/** Valida transição de estado. Lança BusinessRuleError se inválida. */
export function transitarLancamento(
  actual: StatusLancamento,
  alvo: StatusLancamento,
): void {
  const permitidas = TRANSICOES_LANCAMENTO[actual];
  if (!permitidas.includes(alvo)) {
    const err = new Error(
      `Transição inválida: ${actual} → ${alvo}. Permitidas: ${permitidas.join(', ') || 'nenhuma'}`,
    );
    Object.assign(err, { code: 'TRANSICAO_INVALIDA', status: 409 });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Tipos de resultado
// ---------------------------------------------------------------------------

export interface LancamentoComPartidas extends Lancamento {
  partidas: (PartidaLancamento & {
    conta: Pick<ContaPGC, 'id' | 'codigo' | 'nome' | 'natureza'>;
    centroCusto?: Pick<CentroCusto, 'id' | 'codigo' | 'nome'> | null;
  })[];
  diario: Pick<Diario, 'id' | 'codigo' | 'nome' | 'tipo'>;
}

export interface LinhaRazao {
  lancamentoId: string;
  data: Date;
  historico: string;
  debito: Prisma.Decimal | null;
  credito: Prisma.Decimal | null;
  saldoAcumulado: Prisma.Decimal;
  origem: OrigemLancamento;
}

export interface ContaBalancete {
  conta: Pick<ContaPGC, 'id' | 'codigo' | 'nome' | 'tipo' | 'natureza'>;
  saldoAnterior: Prisma.Decimal;
  debitos: Prisma.Decimal;
  creditos: Prisma.Decimal;
  saldoAtual: Prisma.Decimal;
}

export interface Balancete {
  dataInicio: Date;
  dataFim: Date;
  contas: ContaBalancete[];
  totalDebitos: Prisma.Decimal;
  totalCreditos: Prisma.Decimal;
}

export interface DRE {
  dataInicio: Date;
  dataFim: Date;
  centroCustoId?: string;
  receitaBruta: Prisma.Decimal;
  deducoes: Prisma.Decimal;
  receitaLiquida: Prisma.Decimal;
  custoProdutosVendidos: Prisma.Decimal;
  lucroBruto: Prisma.Decimal;
  despesasVendas: Prisma.Decimal;
  despesasAdministrativas: Prisma.Decimal;
  despesasGerais: Prisma.Decimal;
  totalDespesasOperacionais: Prisma.Decimal;
  lucroOperacional: Prisma.Decimal;
  receitasFinanceiras: Prisma.Decimal;
  despesasFinanceiras: Prisma.Decimal;
  resultadoFinanceiro: Prisma.Decimal;
  lucroAntesImpostos: Prisma.Decimal;
  impostos: Prisma.Decimal;
  lucroLiquido: Prisma.Decimal;
}

export interface PaginacaoContabilidade<T> {
  items: T[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Input directo exposto a outros WS (cross-domain contract)
// ---------------------------------------------------------------------------

/**
 * Input canónico para registar lançamento contabilístico automático.
 * WS A, B, C importam ESTE tipo — não definem espelhos locais (ADR decisão 1).
 * `valor` é Prisma.Decimal | string para evitar imprecisão de float JS (ADR A9).
 * Invariante débito=crédito validada pelo serviço com aritmética Decimal exacta.
 */
export interface RegistarLancamentoContabilisticoInput {
  data: Date;
  diarioTipo: TipoDiario;
  origem: OrigemLancamento;
  documentoOrigemId: string;
  documentoOrigemTipo: string; // ex.: 'Fatura' | 'NotaCredito' | 'ContaPagar' | 'MovimentoCaixa'
  historico: string;
  partidas: Array<{
    contaCodigo: string;              // código PGC (ex.: "7.1.1"); serviço resolve ID
    tipo: TipoPartida;                // 'DEBITO' | 'CREDITO'
    /** Decimal string ou Prisma.Decimal — nunca number JS (ADR A9) */
    valor: Prisma.Decimal | string;
    centroCustoCodigo?: string;       // código do centro de custo (opcional)
    historico?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Interface do serviço de contabilidade
// ---------------------------------------------------------------------------

export interface IContabilidadeService {
  // --- Plano de contas ---
  criarConta(input: CriarContaPGCInput, ctx: Ctx): Promise<ContaPGC>;
  atualizarConta(input: AtualizarContaPGCInput, ctx: Ctx): Promise<ContaPGC>;
  desativarConta(id: string, ctx: Ctx): Promise<ContaPGC>;
  obterConta(id: string, ctx: Ctx): Promise<ContaPGC | null>;
  listarContas(
    filtro: FiltroContaPGCInput,
    ctx: Ctx,
  ): Promise<PaginacaoContabilidade<ContaPGC>>;
  arvoreContas(ctx: Ctx): Promise<ContaPGC[]>;

  // --- Diários ---
  criarDiario(input: CriarDiarioInput, ctx: Ctx): Promise<Diario>;
  atualizarDiario(input: AtualizarDiarioInput, ctx: Ctx): Promise<Diario>;
  listarDiarios(ctx: Ctx): Promise<Diario[]>;

  // --- Centros de custo ---
  criarCentroCusto(input: CriarCentroCustoInput, ctx: Ctx): Promise<CentroCusto>;
  atualizarCentroCusto(input: AtualizarCentroCustoInput, ctx: Ctx): Promise<CentroCusto>;
  listarCentrosCusto(
    filtro: FiltroCentroCustoInput,
    ctx: Ctx,
  ): Promise<PaginacaoContabilidade<CentroCusto>>;

  // --- Lançamentos ---
  criarLancamento(input: CriarLancamentoInput, ctx: Ctx): Promise<LancamentoComPartidas>;
  confirmarLancamento(id: string, ctx: Ctx): Promise<Lancamento>;
  estornarLancamento(input: EstornarLancamentoInput, ctx: Ctx): Promise<Lancamento>;
  obterLancamento(id: string, ctx: Ctx): Promise<LancamentoComPartidas | null>;
  listarLancamentos(
    filtro: FiltroLancamentoInput,
    ctx: Ctx,
  ): Promise<PaginacaoContabilidade<LancamentoComPartidas>>;

  // --- Relatórios ---
  gerarBalancete(filtro: FiltroBalanceteInput, ctx: Ctx): Promise<Balancete>;
  razaoConta(filtro: FiltroRazaoInput, ctx: Ctx): Promise<LinhaRazao[]>;
  gerarDRE(filtro: FiltroDREInput, ctx: Ctx): Promise<DRE>;

  // --- Banca ---
  criarContaBancaria(input: CriarContaBancariaInput, ctx: Ctx): Promise<ContaBancaria>;
  atualizarContaBancaria(input: AtualizarContaBancariaInput, ctx: Ctx): Promise<ContaBancaria>;
  listarContasBancarias(ctx: Ctx): Promise<ContaBancaria[]>;

  // --- Reconciliação bancária ---
  /** Abre reconciliação com saldos contabilísticos reais + gera itens do razão. */
  iniciarReconciliacao(input: IniciarReconciliacaoInput, ctx: Ctx): Promise<ReconciliacaoBancaria>;
  /** Geração idempotente de itens LANCAMENTO_CONTABIL do intervalo (não duplica lancamentoId). */
  gerarItensRazao(reconciliacaoId: string, ctx: Ctx): Promise<{ criados: number }>;
  /** Importa linhas de extracto (idempotente por [tenantId, reconciliacaoId, extratoReferencia]). */
  importarExtrato(
    input: ImportarExtratoInput,
    ctx: Ctx,
  ): Promise<{ criados: number; ignorados: number }>;
  /** Sugestões de matching valor+tipoMovimento+janela de datas (não persiste). */
  sugerirMatches(input: AutoMatchInput, ctx: Ctx): Promise<MatchSugerido[]>;
  /** Concilia/desconcilia item (e par opcional) + recalcula diferença em transacção. */
  marcarItemReconciliado(
    input: MarcarItemReconciliadoInput,
    ctx: Ctx,
  ): Promise<ReconciliacaoBancaria>;
  /** Fecho com recálculo de saldos e validação de balanceamento. */
  concluirReconciliacao(input: ConcluirReconciliacaoInput, ctx: Ctx): Promise<ReconciliacaoBancaria>;
  cancelarReconciliacao(id: string, ctx: Ctx): Promise<ReconciliacaoBancaria>;
  obterReconciliacao(id: string, ctx: Ctx): Promise<ReconciliacaoDetalhe | null>;
  listarReconciliacoes(ctx: Ctx): Promise<ReconciliacaoComConta[]>;

  // ------------------------------------------------------------------
  // Contrato exposto a WS A, B, C — chamado dentro de $transaction
  // ------------------------------------------------------------------

  /**
   * Regista lançamento contabilístico automático dentro de uma transacção existente.
   * O serviço resolve os códigos PGC → IDs e garante a invariante débito=crédito.
   * Lança BusinessRuleError('PARTIDAS_DESEQUILIBRADAS') se débitos ≠ créditos.
   * Lança BusinessRuleError('CONTA_NAO_ACEITA_LANCAMENTO') se aceitaLancamento=false.
   */
  registarLancamentoContabilistico(
    tx: Prisma.TransactionClient,
    input: RegistarLancamentoContabilisticoInput,
    ctx: Ctx,
  ): Promise<Lancamento>;
}
