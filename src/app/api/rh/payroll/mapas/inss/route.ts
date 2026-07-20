/**
 * GET /api/rh/payroll/mapas/inss?mes=&ano= — Mapa mensal de contribuições
 * INSS (CSV) para submissão às autoridades (Spec 06).
 */
import { withApi } from '@/lib/api/with-api';
import { PayrollService } from '@/server/services/pessoas-projetos/payroll.service';
import { ProcessarFolhaSchema } from '@/lib/validations/payroll';
import { ValidationError } from '@/lib/errors';
import { exportLimiter, rateLimitedResponse } from '@/server/security/rate-limiter';

export const GET = withApi(
  async (req, ctx) => {
    // Rate limiting: 20 exportações por utilizador por hora
    const rl = await exportLimiter.consume(`${ctx.userId}::export`);
    if (rl.limited) return rateLimitedResponse(rl.retryAfterSec);

    const url = new URL(req.url);
    const parsed = ProcessarFolhaSchema.safeParse({
      mes: url.searchParams.get('mes'),
      ano: url.searchParams.get('ano'),
    });
    if (!parsed.success) {
      throw new ValidationError('Parâmetros mes/ano inválidos', parsed.error.flatten());
    }
    const { mes, ano } = parsed.data;

    const { linhas } = await PayrollService.mapaMensal('INSS', mes, ano, ctx);
    const cabecalho = 'Codigo;Nome;NUIT;NISS;SalarioBruto;INSS_Trabalhador_3;INSS_Entidade_4;INSS_Total';
    const corpo = linhas.map((l) =>
      [
        l.colaboradorCodigo,
        `"${l.colaboradorNome.replace(/"/g, '""')}"`,
        l.nuit,
        l.niss ?? '',
        l.salarioBruto.toFixed(2),
        l.inssTrabalhador.toFixed(2),
        l.inssEntidade.toFixed(2),
        l.inssTrabalhador.plus(l.inssEntidade).toFixed(2),
      ].join(';'),
    );
    const csv = `﻿${[cabecalho, ...corpo].join('\r\n')}`;

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="mapa-inss-${ano}-${String(mes).padStart(2, '0')}.csv"`,
      },
    });
  },
  { permission: 'rh:payroll:read' },
);
