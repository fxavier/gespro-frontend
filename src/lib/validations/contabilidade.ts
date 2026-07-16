import { z } from 'zod';

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

export const StatusLancamentoEnum = z.enum(['RASCUNHO', 'LANCADO', 'ESTORNADO']);

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
]);

export const StatusReconciliacaoEnum = z.enum([
  'EM_ANDAMENTO',
  'CONCLUIDA',
  'CANCELADA',
]);

// ---------------------------------------------------------------------------
// ContaPGC
// ---------------------------------------------------------------------------

export const CriarContaPGCSchema = z.object({
  codigo: z
    .string()
    .min(1)
    .max(20)
    .regex(/^\d+(\.\d+)*$/, 'Código deve seguir o formato PGC (ex.: 1.1.1)'),
  nome: z.string().min(1, 'Nome obrigatório').max(200),
  classe: ClassePGCEnum,
  tipo: TipoContaEnum,
  natureza: NaturezaContaEnum,
  nivel: z.number().int().min(1).max(4),
  contaPaiId: z.string().cuid().optional(),
  aceitaLancamento: z.boolean().default(false),
  descricao: z.string().max(500).optional(),
});

export type CriarContaPGCInput = z.infer<typeof CriarContaPGCSchema>;

export const AtualizarContaPGCSchema = CriarContaPGCSchema.partial().extend({
  id: z.string().cuid(),
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
    contaId: z.string().cuid('ID de conta inválido'),
    centroCustoId: z.string().cuid().optional(),
    tipo: TipoPartidaEnum,
    valor: z
      .number({ required_error: 'Valor obrigatório' })
      .positive('Valor deve ser positivo')
      .multipleOf(0.01, 'Máximo 2 casas decimais'),
    historico: z.string().max(255).optional(),
  });

export type PartidaInput = z.infer<typeof PartidaSchema>;

/** Schema completo do lançamento; invariante débito=crédito validado em refinement. */
export const CriarLancamentoSchema = z
  .object({
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
  })
  .superRefine((data, ctx) => {
    // Invariante: soma(débitos) == soma(créditos)
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
  });

export type CriarLancamentoInput = z.infer<typeof CriarLancamentoSchema>;

export const EstornarLancamentoSchema = z.object({
  lancamentoId: z.string().cuid('ID de lançamento inválido'),
  motivo: z.string().min(1, 'Motivo de estorno obrigatório').max(500),
  data: z.coerce.date().optional(), // por omissão usa data actual
});

export type EstornarLancamentoInput = z.infer<typeof EstornarLancamentoSchema>;

export const FiltroLancamentoSchema = z.object({
  diarioId: z.string().cuid().optional(),
  status: StatusLancamentoEnum.optional(),
  origem: OrigemLancamentoEnum.optional(),
  contaId: z.string().cuid().optional(),
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

export const CriarContaBancariaSchema = z.object({
  banco: z.string().min(1).max(100),
  agencia: z.string().min(1).max(20),
  numeroConta: z.string().min(1).max(30),
  tipoConta: TipoContaBancariaEnum,
  moeda: z.string().length(3).default('MZN'),
  contaContabilId: z.string().cuid('ID de conta contabilística inválido'),
});

export type CriarContaBancariaInput = z.infer<typeof CriarContaBancariaSchema>;

export const AtualizarContaBancariaSchema = CriarContaBancariaSchema.partial().extend({
  id: z.string().cuid(),
  ativo: z.boolean().optional(),
});

export type AtualizarContaBancariaInput = z.infer<typeof AtualizarContaBancariaSchema>;

// ---------------------------------------------------------------------------
// ReconciliacaoBancaria
// ---------------------------------------------------------------------------

export const IniciarReconciliacaoSchema = z.object({
  contaBancariaId: z.string().cuid('ID de conta bancária inválido'),
  dataInicio: z.coerce.date(),
  dataFim: z.coerce.date(),
  saldoInicialBanco: z.number().multipleOf(0.01),
  saldoFinalBanco: z.number().multipleOf(0.01),
});

export type IniciarReconciliacaoInput = z.infer<typeof IniciarReconciliacaoSchema>;

export const MarcarItemReconciliadoSchema = z.object({
  reconciliacaoId: z.string().cuid(),
  itemId: z.string().cuid(),
  conciliado: z.boolean(),
  observacoes: z.string().max(255).optional(),
});

export type MarcarItemReconciliadoInput = z.infer<typeof MarcarItemReconciliadoSchema>;

export const FiltroRazaoSchema = z.object({
  contaId: z.string().cuid('ID de conta inválido'),
  dataInicio: z.coerce.date(),
  dataFim: z.coerce.date(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(200).default(50),
});

export type FiltroRazaoInput = z.infer<typeof FiltroRazaoSchema>;

export const FiltroBalanceteSchema = z.object({
  dataInicio: z.coerce.date(),
  dataFim: z.coerce.date(),
  incluirZeradas: z.boolean().default(false),
  classe: ClassePGCEnum.optional(),
});

export type FiltroBalanceteInput = z.infer<typeof FiltroBalanceteSchema>;

export const FiltroDRESchema = z.object({
  dataInicio: z.coerce.date(),
  dataFim: z.coerce.date(),
  centroCustoId: z.string().cuid().optional(),
});

export type FiltroDREInput = z.infer<typeof FiltroDRESchema>;
