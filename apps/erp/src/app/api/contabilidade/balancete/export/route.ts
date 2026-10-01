/**
 * GET /api/contabilidade/balancete/export?formato=csv|xlsx&<parâmetros da página>
 * — exportação do Balancete de Verificação (S5, issue #285; ADR-0040).
 *
 * Route Handler via `withApi` (sessão → permissão → contexto de tenant), como a
 * exportação da DFC. Permissão `financas:exportar`; é um `GET`, logo passa em
 * modo Leitura (ADR-0032: exportar nunca se trava). O tenant vem da sessão.
 *
 * Os parâmetros lêem-se com `lerParametrosBalancete` — a MESMA regra da página —
 * e o balancete passa pelo mesmo `balanceteApresentado`: o ficheiro é a tabela
 * que o utilizador está a ver, com a linha «Total» do balancete completo.
 * Sem exercício ⇒ 404 JSON. `formato` ausente ou inválido ⇒ CSV.
 */
import type { NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { NotFoundError } from '@/lib/errors';
import { datasetBalancete, descreverFiltros, lerParametrosBalancete } from '@/lib/balancete-params';
import { exportResponse, isFormatoExport } from '@/lib/reporting';
import { exportLimiter, rateLimitedResponse } from '@/server/security/rate-limiter';
import { listarExercicios, periodoFiscalDe } from '@/server/services/financas/contabilidade.service';
import { balanceteApresentado } from '@/server/services/financas/balancete-apresentado';

export const runtime = 'nodejs';

export const GET = withApi(
  async (req: NextRequest, api) => {
    const rl = await exportLimiter.consume(`${api.userId}::export`);
    if (rl.limited) return rateLimitedResponse(rl.retryAfterSec);

    const ctx = { tenantId: api.tenantId, userId: api.userId };
    const qs = req.nextUrl.searchParams;
    const mesAtual = parseInt(periodoFiscalDe(new Date()).split('-')[1] ?? '12', 10);

    const p = lerParametrosBalancete(qs, { exercicios: await listarExercicios(ctx), mesAtual });
    if ('semExercicio' in p) throw new NotFoundError('Sem exercício contabilístico');

    const { balancete, linhas } = await balanceteApresentado(p, ctx);
    const ds = datasetBalancete({ totais: balancete.totais, linhas }, p.tipo, {
      exercicio: p.exercicio.codigo,
      periodoInicial: p.filtroServico.periodoInicial,
      periodoFinal: p.filtroServico.periodoFinal,
        incluir13: p.filtroServico.incluir13,
        filtros: descreverFiltros(p),
      });
    const formato = qs.get('formato');
    return exportResponse(ds, isFormatoExport(formato) ? formato : 'csv');
  },
  { permission: 'financas:exportar' },
);
