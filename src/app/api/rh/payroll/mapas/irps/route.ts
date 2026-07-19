/**
 * GET /api/rh/payroll/mapas/irps?mes=&ano= — Mapa mensal de IRPS retido na
 * fonte (CSV) para submissão às autoridades (Spec 06).
 */
import { withApi } from '@/lib/api/with-api';
import { PayrollService } from '@/server/services/pessoas-projetos/payroll.service';
import { ProcessarFolhaSchema } from '@/lib/validations/payroll';
import { ValidationError } from '@/lib/errors';

export const GET = withApi(
  async (req, ctx) => {
    const url = new URL(req.url);
    const parsed = ProcessarFolhaSchema.safeParse({
      mes: url.searchParams.get('mes'),
      ano: url.searchParams.get('ano'),
    });
    if (!parsed.success) {
      throw new ValidationError('Parâmetros mes/ano inválidos', parsed.error.flatten());
    }
    const { mes, ano } = parsed.data;

    const { linhas } = await PayrollService.mapaMensal('IRPS', mes, ano, ctx);
    const cabecalho = 'Codigo;Nome;NUIT;SalarioBruto;IRPS_Retido';
    const corpo = linhas.map((l) =>
      [
        l.colaboradorCodigo,
        `"${l.colaboradorNome.replace(/"/g, '""')}"`,
        l.nuit,
        l.salarioBruto.toFixed(2),
        l.irps.toFixed(2),
      ].join(';'),
    );
    const csv = `﻿${[cabecalho, ...corpo].join('\r\n')}`;

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="mapa-irps-${ano}-${String(mes).padStart(2, '0')}.csv"`,
      },
    });
  },
  { permission: 'rh:payroll:read' },
);
