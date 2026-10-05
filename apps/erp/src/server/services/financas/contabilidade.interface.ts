import 'server-only'; // A5: serviços são server-only
import type { Prisma, AplicacaoResultado as AplicacaoResultadoModelo } from '@prisma/client';
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
  EditarLancamentoInput,
  AnularLancamentoInput,
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
  FiltroBalanceteVerificacaoInput,
} from '@/lib/validations/contabilidade';
import type { BalanceteVerificacaoNucleo, ContaBV } from './balancete-verificacao';
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

export type StatusLancamento = 'RASCUNHO' | 'LANCADO' | 'ESTORNADO' | 'ANULADO';
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
export type TipoContaBancaria = 'CORRENTE' | 'POUPANCA' | 'DEPOSITO_PRAZO' | 'CARTEIRA_MOVEL';

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
  /** Porque se anulou o rascunho (#137, D3) — só preenchido em ANULADO. */
  motivoAnulacao: string | null;
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
  // Configuração de reconciliação (ADR-0038, issue #140)
  toleranciaDias: number;
  toleranciaValor: Prisma.Decimal;
  permitirMatchPorReferencia: boolean;
  permitirMatchPorValor: boolean;
  permitirMatchPorDescricao: boolean;
  autoReconciliacao: boolean;
  limiarConfianca: number;
  permitirAgregacao: boolean;
  maxMovimentosAgregacao: number;
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
 * RASCUNHO  → ANULADO    (rascunho deitado fora, com motivo — #137; a linha e o número ficam)
 * LANCADO   → ESTORNADO  (geração de lançamento compensatório)
 * ESTORNADO → []         (terminal)
 * ANULADO   → []         (terminal)
 *
 * Nota: lançamentos AUTOMATICOS passam directamente de RASCUNHO → LANCADO
 * dentro da transacção que os origina (não há interacção de utilizador).
 */
export const TRANSICOES_LANCAMENTO: Record<StatusLancamento, StatusLancamento[]> = {
  RASCUNHO: ['LANCADO', 'ANULADO'],
  LANCADO: ['ESTORNADO'],
  ESTORNADO: [],
  ANULADO: [],
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

/**
 * Intervalo efectivo do razão — modo por datas ou por períodos.
 * O modo por períodos usa os valores normalizados (após aplicação de incluir13
 * e de>ate), tal como `BalanceteVerificacaoResult.periodoInicial/Final`.
 */
export type IntervaloRazao =
  | { modo: 'DATAS'; dataInicio: Date; dataFim: Date }
  | {
      modo: 'PERIODOS';
      exercicioId: string;
      periodoInicial: number;
      periodoFinal: number;
      incluir13: boolean;
    };

/**
 * Resultado de `razaoConta` (ADR-0040 §7, issue #297).
 *
 * `saldoAnterior` — saldo da conta antes do intervalo pedido, com o sinal da natureza
 * (DEVEDORA: D−C; CREDORA: C−D).
 * `totais` — débitos e créditos brutos do intervalo de movimento (= movD/movC do balancete);
 *   calculados por `groupBy` sobre o mesmo intervalo das linhas.
 * `saldoFinal` — derivado de `totais`: `saldoAnterior + sinal(natureza)·(D−C)`.
 *   Igual ao último `saldoAcumulado` quando as linhas não estão truncadas.
 * `linhas` — cada `saldoAcumulado` parte do `saldoAnterior`; não são truncadas por `take`.
 */
export interface RazaoConta {
  conta: Pick<ContaPGC, 'id' | 'codigo' | 'nome' | 'natureza' | 'classe'>;
  saldoAnterior: Prisma.Decimal;
  totais: { debito: Prisma.Decimal; credito: Prisma.Decimal };
  linhas: LinhaRazao[];
  saldoFinal: Prisma.Decimal;
  intervalo: IntervaloRazao;
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

/**
 * Resultado de `gerarBalanceteVerificacao` (ADR-0040, issue #280).
 * Estende o núcleo puro com metadados do exercício e do intervalo pedido.
 */
export interface BalanceteVerificacaoResult extends BalanceteVerificacaoNucleo {
  exercicio: Pick<ExercicioContabil, 'id' | 'codigo' | 'dataInicio' | 'dataFim'>;
  /** Período inicial efectivo (conforme pedido). */
  periodoInicial: number;
  /** Período final efectivo (≤ 12 quando incluir13=false). */
  periodoFinal: number;
  incluir13: boolean;
  /** Todas as contas do tenant (mães e folhas) — necessário para hierarquizarBalancete. */
  contas: ContaBV[];
}

// Re-export para conveniência dos importadores do contrato
export type { FiltroBalanceteVerificacaoInput };

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
  encerradoDefinitivoEm: Date | null;   // ADR-0035 §1 — segunda fase
  encerradoDefinitivoPorId: string | null;
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
/** Uma linha da fotografia do balancete guardada no encerramento (ADR-0035 §8); valores em string decimal. */
export interface LinhaFotografiaEncerramento {
  contaId: string;
  codigo: string;
  nome: string;
  totalDebito: string;
  totalCredito: string;
  saldoDevedor: string;
  saldoCredor: string;
}

/** Registo do encerramento provisório de um exercício (ADR-0035, #138). */
export interface EncerramentoExercicio {
  id: string;
  tenantId: string;
  exercicioId: string;
  versao: number;
  estimativaImposto: Prisma.Decimal;
  /** Nulo quando não houve nada a lançar (#366). */
  lancamentoResultadosId: string | null;
  lancamentoImpostoId: string | null;
  /** Nulo quando o resultado corrente é zero e não há imposto (#366). */
  lancamentoLiquidoId: string | null;
  fotografia: LinhaFotografiaEncerramento[];
  totalDebito: Prisma.Decimal;
  totalCredito: Prisma.Decimal;
  anuladoEm: Date | null;
  encerradoPorId: string;
  keycloakSub: string;
  requestId: string | null;
  createdAt: Date;
  /** PDF arquivados depois do commit (ADR-0035 §8, #365); nulos até o arquivo correr. */
  balancoStorageKey: string | null;
  dreStorageKey: string | null;
  balanceteStorageKey: string | null;
  arquivadoEm: Date | null;
}

/** Registo append-only da reabertura de um exercício encerrado provisoriamente (ADR-0035 §1, #138). */
/**
 * Aplicação do resultado de um exercício (ADR-0035 §5, #364) — a linha do modelo, tal como o
 * Prisma a devolve (`aplicacao-resultado.service.ts`).
 */
export type AplicacaoResultado = AplicacaoResultadoModelo;

/** O que a página de exercícios precisa para oferecer ou mostrar a aplicação do resultado. */
export interface SituacaoAplicacaoResultado {
  /** A aplicação em vigor, se houver. */
  activa: Pick<AplicacaoResultado, 'id' | 'dataDeliberacao' | 'referenciaActa' | 'valor' | 'lancamentoId'> | null;
  /** O exercício seguinte, se existir. */
  seguinte: { id: string; codigo: string; dataInicio: Date; dataFim: Date } | null;
  /** N ≥ ENCERRADO_PROVISORIO, N+1 com abertura efectiva e nenhuma aplicação activa. */
  disponivel: boolean;
  /** Saldo de 88 em N+1 (D − C) — negativo é lucro; zero quando não há N+1. */
  saldo88: Prisma.Decimal;
}

export interface ReaberturaExercicio {
  id: string;
  tenantId: string;
  exercicioId: string;
  encerramentoId: string;
  motivo: string;
  lancamentosEstornados: string[];
  reabertoPorId: string;
  keycloakSub: string;
  requestId: string | null;
  createdAt: Date;
}

/** Como o fecho de período: impedimentos devolvidos todos de uma vez, sem escrita. */
export type ResultadoEncerramentoExercicio =
  | { ok: true; encerramento: EncerramentoExercicio }
  | { ok: false; impedimentos: string[] };

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
  editarLancamentoRascunho(input: EditarLancamentoInput, ctx: Ctx): Promise<LancamentoComPartidas>;
  anularLancamentoRascunho(input: AnularLancamentoInput, ctx: Ctx): Promise<Lancamento>;
  obterLancamento(id: string, ctx: Ctx): Promise<LancamentoComPartidas | null>;
  listarLancamentos(
    filtro: FiltroLancamentoInput,
    ctx: Ctx,
  ): Promise<PaginacaoContabilidade<LancamentoComPartidas>>;

  // --- Relatórios ---
  gerarBalancete(filtro: FiltroBalanceteInput, ctx: Ctx): Promise<Balancete>;
  razaoConta(filtro: FiltroRazaoInput, ctx: Ctx): Promise<RazaoConta>;
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

  // --- Balancete de verificação PHC (ADR-0040) ---
  gerarBalanceteVerificacao(
    filtro: FiltroBalanceteVerificacaoInput,
    ctx: Ctx,
  ): Promise<BalanceteVerificacaoResult>;
}
