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
  FiltroBalanceteInput,
  FiltroRazaoInput,
  FiltroDREInput,
  FecharPeriodoInput,
  ReabrirPeriodoInput,
  AbrirExercicioInput,
  ListarPeriodosInput,
} from '@/lib/validations/contabilidade';
import type { CalendarioContabilisticoInput } from '@/lib/validations/plataforma';

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

export interface ContaPGC {
  id: string;
  tenantId: string;
  codigo: string;
  nome: string;
  classe: ClassePGC;
  tipo: TipoConta;
  natureza: NaturezaConta;
  nivel: number;
  contaMaeId: string | null;
  aceitaLancamento: boolean;
  ativo: boolean;
  descricao: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A conta com hierarquia e movimento — o que uma página de detalhe precisa. */
export interface ContaDetalhe {
  conta: ContaPGC;
  contaMae: { id: string; codigo: string; nome: string } | null;
  subContas: { id: string; codigo: string; nome: string; nivel: number; ativo: boolean }[];
  /** Somas do intervalo pedido. */
  debitos: Prisma.Decimal;
  creditos: Prisma.Decimal;
  /** Já com o sinal da natureza da conta aplicado. */
  saldo: Prisma.Decimal;
  /** Partidas no intervalo. */
  movimentos: number;
  /** Partidas de sempre — é o que tranca os campos estruturais. */
  movimentosTotais: number;
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

/** Um lançamento com os dois lados do estorno já resolvidos. */
export interface LancamentoDetalhe {
  lancamento: LancamentoComPartidas;
  /** Preenchido quando ESTE lançamento é o estorno de outro. */
  original: ResumoLancamento | null;
  /** Preenchido quando este lançamento FOI estornado. */
  estorno: ResumoLancamento | null;
}

export interface ResumoLancamento {
  id: string;
  numero: string;
  data: Date;
  historico: string;
  status: StatusLancamento;
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
  periodoId: string;
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
// Períodos e Exercícios (ADR-0033)
// ---------------------------------------------------------------------------

export type EstadoExercicio = 'ABERTO' | 'EM_ENCERRAMENTO' | 'ENCERRADO_PROVISORIO' | 'ENCERRADO';
export type EstadoPeriodo = 'ABERTO' | 'FECHADO';

export interface ExercicioContabil {
  id: string;
  tenantId: string;
  codigo: string;      // "2026"
  dataInicio: Date;
  dataFim: Date;
  estado: EstadoExercicio;
  anteriorId: string | null;
  criadoPorId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PeriodoContabil {
  id: string;
  tenantId: string;
  exercicioId: string;
  ordem: number;       // 1..13
  codigo: string;      // "2026-01" … "2026-13"
  dataInicio: Date;
  dataFim: Date;
  estado: EstadoPeriodo;
  fechadoEm: Date | null;
  fechadoPorId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReaberturaPeriodo {
  id: string;
  tenantId: string;
  periodoId: string;
  motivo: string;
  reabertoPorId: string;
  keycloakSub: string;
  requestId: string | null;
  createdAt: Date;
}

/**
 * Resultado do fecho de período. Quando `ok: false`, `impedimentos` lista todos os
 * códigos que falharam (devolvidos de uma vez para o ecrã os mostrar todos).
 */
export type ResultadoFechoPeriodo =
  | { ok: true; periodo: PeriodoContabil }
  | { ok: false; impedimentos: string[] };

/** Campos do calendário contabilístico lidos ou gravados pelo serviço. */
export interface CalendarioContabilisticoRow {
  aberturaExercicioAutomatica: boolean;
  diaAberturaExercicio: number;
  mesAberturaExercicio: number;
  fechoPeriodoAutomatico: boolean;
  diasAposFimDoMesParaFechoAutomatico: number;
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

  // --- Períodos e Exercícios (ADR-0033 §5, §6, §7) ---
  listarPeriodos(filtro: ListarPeriodosInput, ctx: Ctx): Promise<PeriodoContabil[]>;
  abrirExercicio(input: AbrirExercicioInput, ctx: Ctx): Promise<{ ano: number; seriesCriadas: number }>;
  listarExercicios(ctx: Ctx): Promise<ExercicioContabil[]>;
  fecharPeriodo(input: FecharPeriodoInput, ctx: Ctx): Promise<ResultadoFechoPeriodo>;
  reabrirPeriodo(input: ReabrirPeriodoInput, ctx: Ctx): Promise<PeriodoContabil>;

  // --- Calendário contabilístico (ADR-0033 §3 — configuração do automatismo) ---
  obterCalendarioContabilistico(ctx: Ctx): Promise<CalendarioContabilisticoRow>;
  atualizarCalendarioContabilistico(
    input: CalendarioContabilisticoInput,
    ctx: Ctx,
  ): Promise<CalendarioContabilisticoRow>;

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
