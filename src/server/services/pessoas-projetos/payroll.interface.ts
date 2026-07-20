/**
 * Payroll (Spec 06) — tipos e máquina de estados.
 * Sem 'server-only': módulo de tipos/constantes puro, partilhado por serviço,
 * testes e (via `import type`) componentes.
 */
import type { Prisma } from '@prisma/client';

export type StatusPayroll = 'PENDENTE' | 'PROCESSADO' | 'PAGO' | 'CANCELADO';
export type TipoLinhaPayroll = 'PROVENTO' | 'DESCONTO';
export type NaturezaLinhaPayroll =
  | 'BASE'
  | 'SUBSIDIO'
  | 'HORAS_EXTRAS'
  | 'COMISSAO'
  | 'BONUS'
  | 'INSS'
  | 'IRPS'
  | 'FALTA'
  | 'ADIANTAMENTO'
  | 'PENHORA'
  | 'OUTRO';

// ---------------------------------------------------------------------------
// Máquina de estados (folha e payroll individual partilham o ciclo)
// PENDENTE → PROCESSADO → PAGO; CANCELADO a partir de PENDENTE/PROCESSADO.
// PAGO e CANCELADO são terminais. Espelhada em src/lib/state-machines.ts
// (client-safe) para a UI.
// ---------------------------------------------------------------------------
export const TRANSICOES_PAYROLL: Record<StatusPayroll, StatusPayroll[]> = {
  PENDENTE: ['PROCESSADO', 'CANCELADO'],
  PROCESSADO: ['PAGO', 'CANCELADO'],
  PAGO: [],
  CANCELADO: [],
};

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface FolhaPagamentoDto {
  id: string;
  mesReferencia: number;
  anoReferencia: number;
  status: StatusPayroll;
  totalBruto: Prisma.Decimal;
  totalInssTrabalhador: Prisma.Decimal;
  totalInssEntidade: Prisma.Decimal;
  totalIrps: Prisma.Decimal;
  totalOutrosDescontos: Prisma.Decimal;
  totalLiquido: Prisma.Decimal;
  totalCustoEntidade: Prisma.Decimal;
  lancamentoId: string | null;
  dataProcessamento: Date | null;
  dataPagamento: Date | null;
  totalColaboradores: number;
}

export interface LinhaPayrollDto {
  id: string;
  tipo: TipoLinhaPayroll;
  natureza: NaturezaLinhaPayroll;
  descricao: string;
  valor: Prisma.Decimal;
  manual: boolean;
}

export interface PayrollResumoDto {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  mesReferencia: number;
  anoReferencia: number;
  salarioBruto: Prisma.Decimal;
  salarioLiquido: Prisma.Decimal;
  status: StatusPayroll;
}

export interface ReciboDados {
  payroll: {
    id: string;
    mesReferencia: number;
    anoReferencia: number;
    status: StatusPayroll;
    salarioBruto: Prisma.Decimal;
    descontoInss: Prisma.Decimal;
    descontoIrps: Prisma.Decimal;
    descontoOutros: Prisma.Decimal;
    salarioLiquido: Prisma.Decimal;
    encargoInssEntidade: Prisma.Decimal;
    custoTotalEntidade: Prisma.Decimal;
    dataPagamento: Date | null;
  };
  colaborador: {
    codigo: string;
    nome: string;
    nuit: string;
    niss: string | null;
    cargo: string | null;
    departamento: string | null;
    bancoNib: string | null;
  };
  empresa: {
    nome: string;
    nuit: string;
  };
  linhas: LinhaPayrollDto[];
}
