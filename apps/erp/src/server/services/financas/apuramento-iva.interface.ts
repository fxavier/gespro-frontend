import 'server-only';
import type { Prisma } from '@prisma/client';
import type { Ctx } from './contabilidade.interface';

// ---------------------------------------------------------------------------
// Tipos de domínio
// ---------------------------------------------------------------------------

export type EstadoApuramentoIva = 'APURADO' | 'ESTORNADO' | 'DECLARADO';
export type TipoPartidaIva = 'DEBITO' | 'CREDITO';

export interface LinhaApuramentoIva {
  id: string;
  tenantId: string;
  apuramentoId: string;
  contaCodigo: string;
  contaNome: string;
  tipoMovimento: TipoPartidaIva;
  baseImponivel: Prisma.Decimal | null;
  taxaAplicada: Prisma.Decimal | null;
  valorImposto: Prisma.Decimal;
  divergenciaBase: Prisma.Decimal | null;
}

export interface ApuramentoIva {
  id: string;
  tenantId: string;
  periodoId: string;
  versao: number;
  estado: EstadoApuramentoIva;
  lancamentoId: string | null;
  totalIvaLiquidado: Prisma.Decimal;
  totalIvaDedutivel: Prisma.Decimal;
  totalRegularizacoes: Prisma.Decimal;
  saldoApuramento: Prisma.Decimal;
  creditoReportado: Prisma.Decimal;
  declaradoPorId: string | null;
  declaradoEm: Date | null;
  referenciaEntrega: string | null;
  apuradoPorId: string;
  keycloakSub: string;
  requestId: string | null;
  createdAt: Date;
}

export interface ApuramentoIvaComLinhas extends ApuramentoIva {
  linhas: LinhaApuramentoIva[];
}

// ---------------------------------------------------------------------------
// Inputs de serviço
// ---------------------------------------------------------------------------

export interface ApurarIvaInput {
  periodoId: string;
}

export interface EstornarApuramentoInput {
  apuramentoId: string;
  motivo: string;
}

export interface MarcarDeclaradoInput {
  apuramentoId: string;
  declaradoEm: Date;
  referenciaEntrega: string;
}

// ---------------------------------------------------------------------------
// Máquina de estado (ADR-0034 §7)
// ---------------------------------------------------------------------------

export const TRANSICOES_APURAMENTO: Record<EstadoApuramentoIva, EstadoApuramentoIva[]> = {
  APURADO: ['ESTORNADO', 'DECLARADO'],
  ESTORNADO: [],   // terminal
  DECLARADO: [],   // terminal
};

export function transitarApuramento(
  atual: EstadoApuramentoIva,
  alvo: EstadoApuramentoIva,
): void {
  const permitidos = TRANSICOES_APURAMENTO[atual] ?? [];
  if (!permitidos.includes(alvo)) {
    const err = new Error(
      `Transição inválida de apuramento: ${atual} → ${alvo}. Permitidas: [${permitidos.join(', ')}]`,
    ) as Error & { code: string };
    err.code = 'TRANSICAO_INVALIDA';
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Mapa de contas IVA (prefixos PGC — usados no serviço e nos testes)
// ---------------------------------------------------------------------------

/** Prefixo de cada família de contas IVA. */
export const IVA_PREFIXOS = {
  liquidado: '4433',    // 44331/44332/44333
  dedutivel: '4432',    // 44321/44322/44323
  regularizacoes: '4434', // 44341/44342/44343
  apuramento: '4435',
  aPagar: '4437',
  aRecuperar: '4438',
  reembolsos: '4439',
} as const;

/** Mapa TipoAquisicaoIva → código de conta dedutível. */
export const CONTA_DEDUTIVEL: Record<string, string> = {
  INVENTARIOS: '44321',
  ATIVOS: '44322',
  OUTROS_BENS_SERVICOS: '44323',
};

// ---------------------------------------------------------------------------
// Interface do serviço (NIT)
// ---------------------------------------------------------------------------

export type { Ctx };

export interface IApuramentoIvaService {
  apurarIva(input: ApurarIvaInput, ctx: Ctx): Promise<ApuramentoIvaComLinhas>;
  estornarApuramento(input: EstornarApuramentoInput, ctx: Ctx): Promise<ApuramentoIva>;
  marcarDeclarado(input: MarcarDeclaradoInput, ctx: Ctx): Promise<ApuramentoIva>;
  obterApuramento(periodoId: string, ctx: Ctx): Promise<ApuramentoIvaComLinhas | null>;
}
