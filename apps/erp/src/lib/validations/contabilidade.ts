import { z } from 'zod';
import { idEntidade } from '@/lib/validations/common';
import { METODOS_POS_CONFIGURAVEIS } from '@/lib/meios-pagamento';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const ClassePGCEnum = z.enum([
  'CLASSE_1',
  'CLASSE_2',
  'CLASSE_3',
  'CLASSE_4',
  'CLASSE_5',
  'CLASSE_6',
  'CLASSE_7',
  'CLASSE_8',
]);

export const TipoContaEnum = z.enum([
  'ATIVO',
  'PASSIVO',
  'CAPITAL_PROPRIO',
  'RENDIMENTO',
  'GASTO',
  'RESULTADO',
]);

export const NaturezaContaEnum = z.enum(['DEVEDORA', 'CREDORA']);

export const TipoDiarioEnum = z.enum([
  'VENDAS',
  'COMPRAS',
  'CAIXA',
  'BANCO',
  'OPERACOES',
  'SALARIOS',
  'ABERTURA',
  'ENCERRAMENTO',
  'OUTROS',
]);

export const StatusLancamentoEnum = z.enum(['RASCUNHO', 'LANCADO', 'ESTORNADO', 'ANULADO']);

export const OrigemLancamentoEnum = z.enum([
  'MANUAL',
  'VENDA',
  'COMPRA',
  'PAGAMENTO',
  'RECEBIMENTO',
  'AJUSTE',
  'AMORTIZACAO',
  'PRODUCAO',
  'CAIXA',
  'RECONCILIACAO',
]);

export const TipoPartidaEnum = z.enum(['DEBITO', 'CREDITO']);

export const TipoCentroCustoEnum = z.enum([
  'DEPARTAMENTO',
  'PROJETO',
  'FILIAL',
  'OUTRO',
]);

export const TipoContaBancariaEnum = z.enum([
  'CORRENTE',
  'POUPANCA',
  'DEPOSITO_PRAZO',
  'CARTEIRA_MOVEL',
]);

// ---------------------------------------------------------------------------
// ContaPGC
// ---------------------------------------------------------------------------

/** Formato de um código de conta PGC (ex.: 1.1.1) — usado também nos filtros do balancete. */
export const CODIGO_CONTA_PGC_REGEX = /^\d+(\.\d+)*$/;
export const CODIGO_CONTA_PGC_MAX = 20;

/** O texto é um código de conta PGC válido (mesma regra do CriarContaPGCSchema). */
export function codigoContaPGCValido(codigo: string): boolean {
  return codigo.length >= 1 && codigo.length <= CODIGO_CONTA_PGC_MAX && CODIGO_CONTA_PGC_REGEX.test(codigo);
}

export const CriarContaPGCSchema = z.object({
  codigo: z
    .string()
    .min(1)
    .max(CODIGO_CONTA_PGC_MAX)
    .regex(CODIGO_CONTA_PGC_REGEX, 'Código deve seguir o formato PGC (ex.: 1.1.1)'),
  nome: z.string().min(1, 'Nome obrigatório').max(200),
  classe: ClassePGCEnum,
  tipo: TipoContaEnum,
  natureza: NaturezaContaEnum,
  nivel: z.number().int().min(1).max(4),
  contaMaeId: idEntidade('ID de conta mãe inválido').optional(),
  aceitaLancamento: z.boolean().default(false),
  descricao: z.string().max(500).optional(),
});

export type CriarContaPGCInput = z.infer<typeof CriarContaPGCSchema>;

export const AtualizarContaPGCSchema = CriarContaPGCSchema.partial().extend({
  id: idEntidade('ID de conta inválido'),
});

export type AtualizarContaPGCInput = z.infer<typeof AtualizarContaPGCSchema>;

export const FiltroContaPGCSchema = z.object({
  classe: ClassePGCEnum.optional(),
  tipo: TipoContaEnum.optional(),
  nivel: z.number().int().min(1).max(4).optional(),
  aceitaLancamento: z.boolean().optional(),
  ativo: z.boolean().optional(),
  search: z.string().max(100).optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(200).default(50),
});

export type FiltroContaPGCInput = z.infer<typeof FiltroContaPGCSchema>;

// ---------------------------------------------------------------------------
// Diario
// ---------------------------------------------------------------------------

export const CriarDiarioSchema = z.object({
  codigo: z.string().min(1).max(10),
  nome: z.string().min(1).max(100),
  tipo: TipoDiarioEnum,
});

export type CriarDiarioInput = z.infer<typeof CriarDiarioSchema>;

export const AtualizarDiarioSchema = CriarDiarioSchema.partial().extend({
  id: z.string().cuid(),
  ativo: z.boolean().optional(),
});

export type AtualizarDiarioInput = z.infer<typeof AtualizarDiarioSchema>;

// ---------------------------------------------------------------------------
// CentroCusto
// ---------------------------------------------------------------------------

export const CriarCentroCustoSchema = z.object({
  codigo: z.string().min(1).max(20),
  nome: z.string().min(1).max(100),
  descricao: z.string().max(500).optional(),
  tipo: TipoCentroCustoEnum,
  responsavelId: z.string().cuid().optional(),
  orcamento: z.number().nonnegative().multipleOf(0.01).optional(),
});

export type CriarCentroCustoInput = z.infer<typeof CriarCentroCustoSchema>;

export const AtualizarCentroCustoSchema = CriarCentroCustoSchema.partial().extend({
  id: z.string().cuid(),
  ativo: z.boolean().optional(),
});

export type AtualizarCentroCustoInput = z.infer<typeof AtualizarCentroCustoSchema>;

export const FiltroCentroCustoSchema = z.object({
  tipo: TipoCentroCustoEnum.optional(),
  ativo: z.boolean().optional(),
  search: z.string().max(100).optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

export type FiltroCentroCustoInput = z.infer<typeof FiltroCentroCustoSchema>;

// ---------------------------------------------------------------------------
// Lancamento (partidas dobradas)
// ---------------------------------------------------------------------------

export const PartidaSchema = z
  .object({
    contaId: idEntidade('ID de conta inválido'),
    centroCustoId: z.string().cuid().optional(),
    tipo: TipoPartidaEnum,
    valor: z
      .number({ required_error: 'Valor obrigatório' })
      .positive('Valor deve ser positivo')
      .multipleOf(0.01, 'Máximo 2 casas decimais'),
    historico: z.string().max(255).optional(),
  });

export type PartidaInput = z.infer<typeof PartidaSchema>;

/** Campos do lançamento sem o refinement — base partilhada por criar e editar. */
const LancamentoBaseSchema = z.object({
  data: z.coerce.date({ required_error: 'Data obrigatória' }),
  diarioId: z.string().cuid('ID de diário inválido'),
  origem: OrigemLancamentoEnum.default('MANUAL'),
  documentoOrigemId: z.string().optional(),
  documentoOrigemTipo: z.string().max(50).optional(),
  historico: z.string().min(1, 'Histórico obrigatório').max(500),
  partidas: z
    .array(PartidaSchema)
    .min(2, 'Mínimo de 2 partidas por lançamento'),
  observacoes: z.string().max(1000).optional(),
});

/** Invariante: soma(débitos) == soma(créditos). */
function refinarEquilibrio(
  data: { partidas: { tipo: 'DEBITO' | 'CREDITO'; valor: number }[] },
  ctx: z.RefinementCtx,
) {
  const debitos = data.partidas
    .filter((p) => p.tipo === 'DEBITO')
    .reduce((acc, p) => acc + p.valor, 0);
  const creditos = data.partidas
    .filter((p) => p.tipo === 'CREDITO')
    .reduce((acc, p) => acc + p.valor, 0);

  // Comparação com tolerância de centavo para aritmética de ponto flutuante
  if (Math.abs(debitos - creditos) > 0.005) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['partidas'],
      message: `Débitos (${debitos.toFixed(2)}) devem ser iguais a créditos (${creditos.toFixed(2)})`,
    });
  }
}

/** Schema completo do lançamento; invariante débito=crédito validado em refinement. */
export const CriarLancamentoSchema = LancamentoBaseSchema.superRefine(refinarEquilibrio);

export type CriarLancamentoInput = z.infer<typeof CriarLancamentoSchema>;

export const EstornarLancamentoSchema = z.object({
  lancamentoId: z.string().cuid('ID de lançamento inválido'),
  motivo: z.string().min(1, 'Motivo de estorno obrigatório').max(500),
  data: z.coerce.date().optional(), // por omissão usa data actual
});

export type EstornarLancamentoInput = z.infer<typeof EstornarLancamentoSchema>;

/**
 * Editar um RASCUNHO (#137, D2): tudo menos o diário e a origem — o número
 * pertence ao diário+período e nunca muda. A data pode mudar, mas só dentro do
 * mesmo período (o serviço confirma, `LANCAMENTO_MUDA_PERIODO`).
 */
export const EditarLancamentoSchema = LancamentoBaseSchema.omit({
  diarioId: true,
  origem: true,
  documentoOrigemId: true,
  documentoOrigemTipo: true,
})
  .extend({ id: idEntidade('ID de lançamento inválido') })
  .superRefine(refinarEquilibrio);

export type EditarLancamentoInput = z.infer<typeof EditarLancamentoSchema>;

/** Anular um RASCUNHO (#137, D3): o motivo fica no lançamento. */
export const AnularLancamentoSchema = z.object({
  id: idEntidade('ID de lançamento inválido'),
  motivo: z
    .string({ required_error: 'Motivo obrigatório' })
    .trim()
    .min(3, 'Indique o motivo (pelo menos 3 caracteres)')
    .max(500, 'Máximo de 500 caracteres'),
});

export type AnularLancamentoInput = z.infer<typeof AnularLancamentoSchema>;

export const FiltroLancamentoSchema = z.object({
  diarioId: z.string().cuid().optional(),
  status: StatusLancamentoEnum.optional(),
  origem: OrigemLancamentoEnum.optional(),
  contaId: idEntidade('ID de conta inválido').optional(),
  centroCustoId: z.string().cuid().optional(),
  periodoFiscal: z.string().regex(/^\d{4}-\d{2}$/, 'Formato YYYY-MM').optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

export type FiltroLancamentoInput = z.infer<typeof FiltroLancamentoSchema>;

// ---------------------------------------------------------------------------
// ContaBancaria
// ---------------------------------------------------------------------------

/**
 * Configuração de reconciliação da conta (ADR-0038, issue #140). Limites
 * fechados em cada campo e SEM `.default()`: um campo omitido fica omitido —
 * o update não repõe omissões nos outros, e o create usa a omissão da BD.
 */
export const ConfigReconciliacaoContaSchema = z.object({
  toleranciaDias: z.coerce
    .number({ invalid_type_error: 'Indique um número de dias' })
    .int('Use um número inteiro de dias')
    .min(0, 'Mínimo 0 dias')
    .max(60, 'Máximo 60 dias'),
  /** Montante ≥ 0 com até 2 casas, como texto (vira `Prisma.Decimal` no serviço). */
  toleranciaValor: z
    .string()
    .trim()
    .regex(/^\d{1,16}(\.\d{1,2})?$/, 'Valor inválido (≥ 0, ponto decimal e até 2 casas)'),
  permitirMatchPorReferencia: z.boolean(),
  permitirMatchPorValor: z.boolean(),
  permitirMatchPorDescricao: z.boolean(),
  autoReconciliacao: z.boolean(),
  limiarConfianca: z.coerce
    .number({ invalid_type_error: 'Indique o limiar' })
    .int('Use um número inteiro')
    .min(50, 'Mínimo 50')
    .max(100, 'Máximo 100'),
  permitirAgregacao: z.boolean(),
  maxMovimentosAgregacao: z.coerce
    .number({ invalid_type_error: 'Indique o máximo' })
    .int('Use um número inteiro')
    // O motor conta os dois lados (banco + contabilidade): uma agregação tem pelo menos 3.
    .min(3, 'Mínimo 3')
    .max(20, 'Máximo 20'),
});

export type ConfigReconciliacaoContaInput = z.infer<typeof ConfigReconciliacaoContaSchema>;

export const CriarContaBancariaSchema = z
  .object({
    banco: z.string().min(1).max(100),
    agencia: z.string().min(1).max(20),
    numeroConta: z.string().min(1).max(30),
    tipoConta: TipoContaBancariaEnum,
    moeda: z.string().length(3).default('MZN'),
    contaContabilId: idEntidade('ID de conta contabilística inválido'),
  })
  .merge(ConfigReconciliacaoContaSchema.partial());

export type CriarContaBancariaInput = z.infer<typeof CriarContaBancariaSchema>;

export const AtualizarContaBancariaSchema = CriarContaBancariaSchema.partial().extend({
  id: z.string().cuid(),
  ativo: z.boolean().optional(),
});

export type AtualizarContaBancariaInput = z.infer<typeof AtualizarContaBancariaSchema>;

export const FiltroContaBancariaSchema = z.object({
  ativo: z.boolean().optional(),
  search: z.string().max(100).optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

export type FiltroContaBancariaInput = z.infer<typeof FiltroContaBancariaSchema>;

// ---------------------------------------------------------------------------
// Conta a débito por meio de pagamento do POS (ADR-0041 §4)
// ---------------------------------------------------------------------------

/** `contaBancariaId: null` retira a configuração (o meio volta a debitar 121). */
export const DefinirContaMeioPagamentoPOSSchema = z.object({
  metodo: z.enum(METODOS_POS_CONFIGURAVEIS),
  contaBancariaId: idEntidade('Conta bancária inválida').nullable(),
});

export type DefinirContaMeioPagamentoPOSInput = z.infer<typeof DefinirContaMeioPagamentoPOSSchema>;

/** Modo por datas: filtra pelo campo `data` do lançamento. */
export const FiltroRazaoDatasSchema = z.object({
  contaId: idEntidade('ID de conta inválido'),
  dataInicio: z.coerce.date(),
  dataFim: z.coerce.date(),
  cursor: z.string().cuid().optional(),
  // take e cursor aceites e ignorados pelo serviço — linhas completas por decisão G5 (#297);
  // paginação por cursor fica para quando uma conta o justificar.
  take: z.number().int().min(1).max(200).default(50),
});

export type FiltroRazaoDatasInput = z.infer<typeof FiltroRazaoDatasSchema>;

/**
 * Modo por períodos: filtra pelo período do lançamento dentro de um exercício.
 *
 * Os campos numéricos (`periodoInicial`, `periodoFinal`) usam `z.coerce` porque
 * chegam como string do URL; `incluir13` usa `z.boolean` sem coerção (a página
 * traduz o parâmetro de URL para boolean antes de chamar o schema).
 *
 * A normalização do intervalo (de > ate → ate..ate; 13 sem p13 → 12) é feita
 * pelo serviço, tal como no balancete de verificação.
 */
export const FiltroRazaoPeriodosSchema = z.object({
  contaId: idEntidade('ID de conta inválido'),
  exercicioId: idEntidade('ID de exercício inválido'),
  periodoInicial: z.coerce.number().int().min(1).max(13),
  periodoFinal: z.coerce.number().int().min(1).max(13),
  /** Se false (omissão), o período 13 nunca entra mesmo com periodoFinal=13. */
  incluir13: z.boolean().default(false),
  // take e cursor aceites e ignorados pelo serviço — linhas completas por decisão G5 (#297);
  // paginação por cursor fica para quando uma conta o justificar.
  take: z.number().int().min(1).max(200).default(50),
});

export type FiltroRazaoPeriodosInput = z.infer<typeof FiltroRazaoPeriodosSchema>;

/**
 * Filtro de razão de conta: union dos dois modos.
 * A normalização do intervalo (de > ate, 13 sem p13) é do SERVIÇO.
 */
export const FiltroRazaoSchema = z.union([FiltroRazaoDatasSchema, FiltroRazaoPeriodosSchema]);

export type FiltroRazaoInput = z.infer<typeof FiltroRazaoSchema>;

export const FiltroBalanceteSchema = z.object({
  dataInicio: z.coerce.date(),
  dataFim: z.coerce.date(),
  incluirZeradas: z.boolean().default(false),
  classe: ClassePGCEnum.optional(),
  /** Código (prefixo) ou nome da conta; filtra linhas, não os totais (#141). */
  search: z.string().trim().max(100).optional(),
  /**
   * Balancete com saldos (#141): saldo anterior = tudo antes de `dataInicio`, e o
   * saldo actual soma-o. Sem ele é um balancete de MOVIMENTO (saldo actual = só o
   * período, contas só com partidas no período) — o contrato de que a DFC depende.
   */
  comSaldoAnterior: z.boolean().optional(),
});

export type FiltroBalanceteInput = z.infer<typeof FiltroBalanceteSchema>;

export const FiltroDRESchema = z.object({
  dataInicio: z.coerce.date(),
  dataFim: z.coerce.date(),
  centroCustoId: z.string().cuid().optional(),
});

export type FiltroDREInput = z.infer<typeof FiltroDRESchema>;

// ---------------------------------------------------------------------------
// Períodos e Exercícios (ADR-0033 §5, §6, §7)
// ---------------------------------------------------------------------------

export const FecharPeriodoSchema = z.object({
  id: idEntidade('ID de período inválido'),
});

export type FecharPeriodoInput = z.infer<typeof FecharPeriodoSchema>;

export const ReabrirPeriodoSchema = z.object({
  id: idEntidade('ID de período inválido'),
  motivo: z.string().min(10, 'Motivo deve ter pelo menos 10 caracteres').max(1000),
});

export type ReabrirPeriodoInput = z.infer<typeof ReabrirPeriodoSchema>;

export const ListarPeriodosSchema = z.object({
  exercicioId: idEntidade('ID de exercício inválido').optional(),
  estado: z.enum(['ABERTO', 'FECHADO']).optional(),
});

export type ListarPeriodosInput = z.infer<typeof ListarPeriodosSchema>;

export const AbrirExercicioSchema = z.object({
  ano: z
    .number()
    .int('O ano tem de ser um número inteiro')
    .min(2020, 'Ano inválido')
    .max(2099, 'Ano inválido'),
});

export type AbrirExercicioInput = z.infer<typeof AbrirExercicioSchema>;

// ---------------------------------------------------------------------------
// Balancete de Verificação PHC (ADR-0040, issue #280)
// ---------------------------------------------------------------------------

export const FiltroBalanceteVerificacaoSchema = z.object({
  /** Se ausente, usa o exercício que contém hoje (fuso Africa/Maputo). */
  exercicioId: idEntidade('ID de exercício inválido').optional(),
  /** Período inicial do intervalo de movimento (1..13). */
  periodoInicial: z.coerce.number().int().min(1).max(13).default(1),
  /**
   * Período final do intervalo de movimento e acumulado (1..13).
   * Default 12 para chamadores directos; a página passa o período corrente (Africa/Maputo).
   */
  periodoFinal: z.coerce.number().int().min(1).max(13).default(12),
  /** Se false (omissão), o período 13 nunca entra mesmo com periodoFinal=13. */
  incluir13: z.boolean().default(false),
});

export type FiltroBalanceteVerificacaoInput = z.infer<typeof FiltroBalanceteVerificacaoSchema>;

// --- Pesquisa de contas para ComboboxRemoto (formulário de lançamento) ---

export const ProcurarContasLancamentoSchema = z.object({
  q: z.string().trim().max(100).default(''),
});

export type ProcurarContasLancamentoInput = z.infer<typeof ProcurarContasLancamentoSchema>;

// --- Pesquisa de contas mãe para ComboboxRemoto (formulário plano de contas) ---

export const ProcurarContasMaeSchema = z.object({
  q: z.string().trim().max(100).default(''),
  /** Conta a excluir dos resultados (a própria conta em modo edição). */
  excluirId: idEntidade().optional(),
});

export type ProcurarContasMaeInput = z.infer<typeof ProcurarContasMaeSchema>;
