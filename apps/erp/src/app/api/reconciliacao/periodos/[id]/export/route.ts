/**
 * GET /api/reconciliacao/periodos/[id]/export?formato=csv|xlsx — mapa de fecho
 * (RF §17) e as correspondências do período. Route Handler via `withApi`; a
 * permissão é a de reconciliar, não `financas:leitura` (ADR-0038): exportar
 * uma reconciliação expõe o mesmo que fazê-la.
 */
import type { NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { ValidationError } from '@/lib/errors';
import { exportResponse, isFormatoExport } from '@/lib/reporting';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { exportLimiter, rateLimitedResponse } from '@/server/security/rate-limiter';
import { obterFechoPeriodo } from '@/server/services/reconciliacao/consulta.service';

export const runtime = 'nodejs';

export const GET = withApi(
  async (req: NextRequest, ctx) => {
    const rl = await exportLimiter.consume(`${ctx.userId}::export`);
    if (rl.limited) return rateLimitedResponse(rl.retryAfterSec);

    const formato = new URL(req.url).searchParams.get('formato') ?? 'csv';
    if (!isFormatoExport(formato)) throw new ValidationError('Formato inválido — use csv ou xlsx');

    const c = { tenantId: ctx.tenantId, userId: ctx.userId };
    const { periodo, mapa, aoVivo } = await runWithTenantContext(c, () => obterFechoPeriodo(String(ctx.params.id), c));

    const linhas: [string, number | { toString(): string }][] = [
      ['Saldo inicial (extracto)', periodo.saldoInicialBanco],
      ['Movimentos bancários no período', mapa.totalMovimentosBanco],
      ['Movimentos contabilísticos no período', mapa.totalMovimentosContabilisticos],
      ['Movimentos reconciliados', mapa.totalReconciliados],
      ['Contabilísticos por reflectir no banco (em trânsito)', mapa.valorEmTransito],
      ['Bancários por contabilizar', mapa.valorBancoSemContabilizacao],
      ['Diferenças de valor aceites', mapa.valorDiferencas],
      ['Diferença de abertura', mapa.diferencaAbertura],
      ['Saldo final (extracto)', periodo.saldoFinalBanco],
      ['Saldo final (contabilidade)', mapa.saldoFinalContabil],
      ['Saldo reconciliado', mapa.saldoReconciliado],
      ['Diferença residual', mapa.diferencaResidual],
    ];

    return exportResponse(
      {
        nome: `reconciliacao-${periodo.id}`,
        colunas: [
          { key: 'rubrica', header: 'Rubrica' },
          { key: 'valor', header: 'Valor', type: 'text' },
        ],
        linhas: linhas.map(([rubrica, valor]) => ({ rubrica, valor: valor.toString() })),
        meta: [
          ['Estado', periodo.estado],
          ['Mapa', aoVivo ? 'calculado no momento da exportação' : 'gravado no fecho'],
          ...(periodo.justificacao ? ([['Justificação', periodo.justificacao]] as [string, string][]) : []),
        ],
      },
      formato,
    );
  },
  { permission: 'financas:banca:reconciliacao' },
);
