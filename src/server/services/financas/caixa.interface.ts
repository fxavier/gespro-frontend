import 'server-only'; // A5: serviços são server-only
import type { Prisma } from '@prisma/client';
import type {
  AbrirSessaoCaixaInput,
  FecharSessaoCaixaInput,
  SangriaInput,
  ReforcoInput,
  FiltroSessaoCaixaInput,
  FiltroMovimentoCaixaInput,
} from '@/lib/validations/caixa';

// ---------------------------------------------------------------------------
// Contexto (injectado pela action — nunca vem do cliente)
// ---------------------------------------------------------------------------

export interface Ctx {
  tenantId: string;
  userId: string;
}

// ---------------------------------------------------------------------------
// Tipos de domínio (espelham o que Prisma gerará após generate)
// ---------------------------------------------------------------------------

export type StatusSessaoCaixa = 'ABERTA' | 'FECHADA' | 'CANCELADA';

export type TipoMovimentoCaixa =
  | 'ABERTURA'
  | 'VENDA'
  | 'RECEBIMENTO'
  | 'SANGRIA'
  | 'REFORCO'
  | 'DEVOLUCAO'
  | 'FECHAMENTO'
  | 'AJUSTE';

export interface SessaoCaixa {
  id: string;
  tenantId: string;
  responsavelId: string;
  numero: string;
  dataAbertura: Date;
  dataFechamento: Date | null;
  fundoInicial: Prisma.Decimal;
  fundoFinal: Prisma.Decimal | null;
  totalEntradas: Prisma.Decimal;
  totalSaidas: Prisma.Decimal;
  diferenca: Prisma.Decimal | null;
  status: StatusSessaoCaixa;
  observacoes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MovimentoCaixa {
  id: string;
  tenantId: string;
  sessaoCaixaId: string;
  tipo: TipoMovimentoCaixa;
  valor: Prisma.Decimal;
  descricao: string;
  documentoOrigemId: string | null;
  documentoOrigemTipo: string | null;
  responsavelId: string;
  dataMovimento: Date;
  observacoes: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Máquina de estado: SessaoCaixa
// ---------------------------------------------------------------------------

/**
 * Mapa de transições válidas por estado.
 * Toda a transição fora deste mapa lança BusinessRuleError('TRANSICAO_INVALIDA').
 *
 * ABERTA    → FECHADA   (fecho normal com conferência)
 * ABERTA    → CANCELADA (cancelamento administrativo sem movimentos)
 * FECHADA   → []        (terminal — imutável)
 * CANCELADA → []        (terminal — imutável)
 */
export const TRANSICOES_SESSAO_CAIXA: Record<StatusSessaoCaixa, StatusSessaoCaixa[]> = {
  ABERTA: ['FECHADA', 'CANCELADA'],
  FECHADA: [],
  CANCELADA: [],
};

/** Valida transição de estado. Lança BusinessRuleError se inválida. */
export function transitarSessaoCaixa(
  actual: StatusSessaoCaixa,
  alvo: StatusSessaoCaixa,
): void {
  const permitidas = TRANSICOES_SESSAO_CAIXA[actual];
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

export interface SessaoCaixaComMovimentos extends SessaoCaixa {
  movimentos: MovimentoCaixa[];
}

export interface ResumoSessaoCaixa {
  sessaoCaixaId: string;
  fundoInicial: Prisma.Decimal;
  totalEntradas: Prisma.Decimal;
  totalSaidas: Prisma.Decimal;
  saldoEsperado: Prisma.Decimal;
  fundoFinal: Prisma.Decimal | null;
  diferenca: Prisma.Decimal | null;
}

export interface PaginacaoCaixa<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

// ---------------------------------------------------------------------------
// Contrato cross-domínio: RegistarMovimentoCaixaInput (A9 + fonte única)
// ---------------------------------------------------------------------------

/**
 * Input canónico para registar movimento de caixa dentro de uma $transaction.
 * `valor` é Prisma.Decimal | string para evitar imprecisão de float JS (ADR A9).
 * WS C importa ESTE tipo — não define espelho local.
 */
export interface RegistarMovimentoCaixaInput {
  sessaoCaixaId: string;
  tipo: TipoMovimentoCaixa;
  /** Decimal string ou Prisma.Decimal — nunca number JS (ADR A9) */
  valor: Prisma.Decimal | string;
  descricao: string;
  documentoOrigemId?: string;
  documentoOrigemTipo?: string; // ex.: 'Venda', 'Fatura', 'NotaCredito'
  observacoes?: string;
}

// ---------------------------------------------------------------------------
// Interface do serviço de caixa
// ---------------------------------------------------------------------------

/**
 * ICaixaService — contrato de serviço para operações de caixa.
 *
 * Regras de negócio:
 *  - Só pode existir UMA SessaoCaixa ABERTA por responsável por tenant de cada vez.
 *  - Fecho bloqueia se existirem documentos de venda pendentes ligados à sessão
 *    (`BusinessRuleError('CAIXA_COM_PENDENCIAS')`).
 *  - Sangria/Reforço só possíveis em sessão ABERTA.
 *  - Todos os movimentos são imutáveis; erros corrigem-se com AJUSTE.
 */
export interface ICaixaService {
  // Operações de sessão
  abrirSessao(input: AbrirSessaoCaixaInput, ctx: Ctx): Promise<SessaoCaixa>;
  fecharSessao(input: FecharSessaoCaixaInput, ctx: Ctx): Promise<SessaoCaixa>;
  cancelarSessao(sessaoCaixaId: string, motivo: string, ctx: Ctx): Promise<SessaoCaixa>;
  obterSessaoAtual(ctx: Ctx): Promise<SessaoCaixa | null>;
  obterSessao(id: string, ctx: Ctx): Promise<SessaoCaixaComMovimentos | null>;
  listarSessoes(
    filtro: FiltroSessaoCaixaInput,
    ctx: Ctx,
  ): Promise<PaginacaoCaixa<SessaoCaixa>>;

  // Operações de movimento
  registarSangria(input: SangriaInput, ctx: Ctx): Promise<MovimentoCaixa>;
  registarReforco(input: ReforcoInput, ctx: Ctx): Promise<MovimentoCaixa>;
  listarMovimentos(
    filtro: FiltroMovimentoCaixaInput,
    ctx: Ctx,
  ): Promise<PaginacaoCaixa<MovimentoCaixa>>;

  // Resumo e conferência
  resumoSessao(sessaoCaixaId: string, ctx: Ctx): Promise<ResumoSessaoCaixa>;

  // ------------------------------------------------------------------
  // Contrato exposto a WS C — chamado dentro de $transaction
  // tx é o 1.º parâmetro (ADR decisão 6)
  // ------------------------------------------------------------------
  registarMovimentoCaixa(
    tx: Prisma.TransactionClient,
    input: RegistarMovimentoCaixaInput,
    ctx: Ctx,
  ): Promise<MovimentoCaixa>;
}
