'use server';
import { createSafeAction } from '@/server/safe-action';
import {
  ProcessarFolhaSchema,
  MarcarProcessadaSchema,
  MarcarPagaSchema,
  CancelarFolhaSchema,
  RecalcularPayrollSchema,
  AjusteLinhaSchema,
  FilterPayrollSchema,
  TabelaINSSSchema,
  CriarEscaloesIRPSSchema,
} from '@/lib/validations/payroll';
import { PayrollService } from '@/server/services/pessoas-projetos/payroll.service';

const REVALIDATE = { paths: ['/rh/payroll'] };

// ─────────────────────────────────────────────────────────────────────────────
// Ciclo de vida da folha mensal
// ─────────────────────────────────────────────────────────────────────────────

export const processarFolhaMesAction = createSafeAction({
  schema: ProcessarFolhaSchema,
  permission: 'rh:payroll:processar',
  revalidate: REVALIDATE,
  handler: (input, ctx) => PayrollService.processarFolhaMes(input, ctx),
});

export const marcarProcessadaAction = createSafeAction({
  schema: MarcarProcessadaSchema,
  permission: 'rh:payroll:processar',
  revalidate: REVALIDATE,
  handler: ({ folhaId }, ctx) => PayrollService.marcarProcessada(folhaId, ctx),
});

export const marcarPagaAction = createSafeAction({
  schema: MarcarPagaSchema,
  permission: 'rh:payroll:pagar',
  revalidate: REVALIDATE,
  handler: (input, ctx) => PayrollService.marcarPaga(input, ctx),
});

export const cancelarFolhaAction = createSafeAction({
  schema: CancelarFolhaSchema,
  permission: 'rh:payroll:cancelar',
  revalidate: REVALIDATE,
  handler: ({ folhaId, motivo }, ctx) => PayrollService.cancelar(folhaId, motivo, ctx),
});

// ─────────────────────────────────────────────────────────────────────────────
// Payroll individual
// ─────────────────────────────────────────────────────────────────────────────

export const recalcularPayrollAction = createSafeAction({
  schema: RecalcularPayrollSchema,
  permission: 'rh:payroll:processar',
  revalidate: REVALIDATE,
  handler: ({ payrollId }, ctx) => PayrollService.recalcularPayroll(payrollId, ctx),
});

export const ajustarLinhaManualAction = createSafeAction({
  schema: AjusteLinhaSchema,
  permission: 'rh:payroll:processar',
  revalidate: REVALIDATE,
  handler: (input, ctx) => PayrollService.ajustarLinhaManual(input, ctx),
});

export const listarPayrollsAction = createSafeAction({
  schema: FilterPayrollSchema,
  permission: 'rh:payroll:read',
  handler: (filter, ctx) => PayrollService.listarPayrolls(filter, ctx),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tabelas paramétricas (admin) — versionadas por vigência
// ─────────────────────────────────────────────────────────────────────────────

export const criarTabelaINSSAction = createSafeAction({
  schema: TabelaINSSSchema,
  permission: 'rh:payroll:tabelas',
  revalidate: REVALIDATE,
  handler: (input, ctx) => PayrollService.criarTabelaINSS(input, ctx),
});

export const criarEscaloesIRPSAction = createSafeAction({
  schema: CriarEscaloesIRPSSchema,
  permission: 'rh:payroll:tabelas',
  revalidate: REVALIDATE,
  handler: (input, ctx) => PayrollService.criarEscaloesIRPS(input, ctx),
});

export const listarTabelasINSSAction = createSafeAction({
  permission: 'rh:payroll:tabelas',
  handler: (_input, ctx) => PayrollService.listarTabelasINSS(ctx),
});

export const listarEscaloesIRPSAction = createSafeAction({
  permission: 'rh:payroll:tabelas',
  handler: (_input, ctx) => PayrollService.listarEscaloesIRPS(ctx),
});
