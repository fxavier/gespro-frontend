/**
 * WS D — Finanças: Contratos cross-domínio (fonte única — ADR-0003)
 *
 * Outros workstreams IMPORTAM daqui; proibido definir tipos-espelho locais.
 *
 * Contratos transaccionais (chamar dentro de $transaction):
 *   registarLancamentoContabilistico(tx, input, ctx)  → WS A, B, C
 *   registarMovimentoCaixa(tx, input, ctx)            → WS C (POS)
 *   proximoNumeroSerie(tx, tipo, ctx)                 → WS A, B, C, E, F (B6)
 */

// ---------------------------------------------------------------------------
// Tipos de contabilidade (fonte única para WS A, B, C)
// ---------------------------------------------------------------------------
export type {
  RegistarLancamentoContabilisticoInput, // A9: valor: Prisma.Decimal | string
  IContabilidadeService,
  Ctx as ContabilidadeCtx,
  Lancamento,
  ContaPGC,
  Diario,
  CentroCusto,
  OrigemLancamento,
  TipoDiario,
  TipoPartida,
  StatusLancamento,
  Balancete,
  ContaBalancete,
  LinhaRazao,
  DRE,
} from './contabilidade.interface';

// ---------------------------------------------------------------------------
// Tipos de caixa (fonte única para WS C)
// ---------------------------------------------------------------------------
export type {
  RegistarMovimentoCaixaInput, // A9: valor: Prisma.Decimal | string
  ICaixaService,
  Ctx as CaixaCtx,
  SessaoCaixa,
  MovimentoCaixa,
  StatusSessaoCaixa,
  TipoMovimentoCaixa,
} from './caixa.interface';

// ---------------------------------------------------------------------------
// Tipos de faturação + numeração (fonte única para WS A, B, C, E, F)
// ---------------------------------------------------------------------------
export type {
  IFaturacaoService,
  Ctx as FaturacaoCtx,
  Fatura,
  FaturaCompleta,
  SerieDocumento,
  StatusFatura,
  StatusNotaCredito,
  StatusNotaDebito,
  StatusProforma,
  StatusCotacaoComercial,
  TipoSerieDocumento, // B6: enum unificado com TODOS os documentos sequenciais
} from './faturacao.interface';

// Mapas de transição — para uso em property tests (Wave 2)
export {
  TRANSICOES_LANCAMENTO,
  transitarLancamento,
} from './contabilidade.interface';

export {
  TRANSICOES_SESSAO_CAIXA,
  transitarSessaoCaixa,
} from './caixa.interface';

export {
  TRANSICOES_FATURA,
  TRANSICOES_NOTA_CREDITO,
  TRANSICOES_NOTA_DEBITO,
  TRANSICOES_PROFORMA,
  TRANSICOES_COTACAO_COMERCIAL,
  transitarFatura,
  transitarNotaCredito,
  transitarNotaDebito,
  transitarProforma,
  transitarCotacaoComercial,
} from './faturacao.interface';

// Funções transaccionais (B6) — chamar dentro de prismaBase.$transaction
export { proximoNumeroSerie } from './faturacao.service';
