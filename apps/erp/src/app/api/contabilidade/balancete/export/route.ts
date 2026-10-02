/**
 * GET /api/contabilidade/balancete/export?formato=csv|xlsx|pdf&<parâmetros da página>
 * — exportação do Balancete de Verificação (S5 #285 CSV/Excel, S6 #286 PDF; ADR-0040).
 *
 * Route Handler via `withApi` (sessão → permissão → contexto de tenant), como a
 * exportação da DFC. Permissão `financas:exportar`; é um `GET`, logo passa em
 * modo Leitura (ADR-0032: exportar nunca se trava). O tenant vem da sessão.
 *
 * Os parâmetros lêem-se com `lerParametrosBalancete` — a MESMA regra da página —
 * e o balancete passa pelo mesmo `balanceteApresentado`: o ficheiro é a tabela
 * que o utilizador está a ver, com a linha «Total» do balancete completo.
 * Sem exercício ⇒ 404 JSON. `formato` ausente ou inválido ⇒ CSV.
 *
 * PDF (A4 horizontal, `renderBalancetePdf`): a entidade (nome, NUIT) vem do tenant
 * da sessão por `tenantAdminService.obter`, como os documentos fiscais; o «por» é o
 * nome do utilizador lido da base (a sessão não o traz), ou o email se não tiver nome.
 * Acima de `MAX_LINHAS_PDF` linhas mostradas o PDF é recusado com 422 (o CSV/Excel não
 * têm tecto). `runtime = 'nodejs'`: o motor de PDF não corre em Edge.
 */
import type { NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { AppError, NotFoundError } from '@/lib/errors';
import { datasetBalancete, descreverFiltros, lerParametrosBalancete } from '@/lib/balancete-params';
import { renderBalancetePdf } from '@/lib/documents/pdf/balancete-pdf';
import { exportResponse, isFormatoExport, safeFilename } from '@/lib/reporting';
import { exportLimiter, rateLimitedResponse } from '@/server/security/rate-limiter';
import { listarExercicios, periodoFiscalDe } from '@/server/services/financas/contabilidade.service';
import { balanceteApresentado } from '@/server/services/financas/balancete-apresentado';
import { tenantAdminService } from '@/server/services/plataforma/tenant-admin.service';
import { somarLinhasQueContam, zeros } from '@/lib/documents/balancete-paginas';
import { prisma } from '@/server/db/client';

export const runtime = 'nodejs';

/** Tecto do PDF em linhas mostradas (subtotais incluídos): acima disto, CSV/Excel ou filtros. */
const MAX_LINHAS_PDF = 3000;

const COLUNAS_TOTAIS = ['movD', 'movC', 'acumD', 'acumC', 'saldoDevedor', 'saldoCredor'] as const;

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
    const cabecalho = {
      exercicio: p.exercicio.codigo,
      periodoInicial: p.filtroServico.periodoInicial,
      periodoFinal: p.filtroServico.periodoFinal,
      incluir13: p.filtroServico.incluir13,
      filtros: descreverFiltros(p),
    };
    const formato = qs.get('formato');

    if (formato === 'pdf') {
      if (linhas.length > MAX_LINHAS_PDF) {
        throw new AppError(
          'BALANCETE_PDF_DEMASIADO_GRANDE',
          `O balancete tem ${linhas.length} linhas e o PDF aceita até ${MAX_LINHAS_PDF}. ` +
            'Exporte em CSV ou Excel, ou aplique filtros (classe, intervalo de contas, grau máximo).',
          422,
        );
      }
      const [tenant, utilizador] = await Promise.all([
        tenantAdminService.obter(ctx.tenantId),
        prisma.user.findFirst({
          where: { id: ctx.userId, tenantId: ctx.tenantId },
          select: { nome: true, email: true },
        }),
      ]);
      // A soma do que se mostra deixa de ser a do balancete: por filtros que tiram linhas,
      // ou pelos dados (nivel/razão escondem órfãs e mostram saldos líquidos após roll-up).
      const f = p.filtros;
      const mostradas = somarLinhasQueContam(zeros(), linhas);
      const filtrosTiramLinhas =
        Boolean(f.classe || f.contaInicial || f.contaFinal || f.excluir?.length || f.apenasComSaldo || f.pesquisa) ||
        COLUNAS_TOTAIS.some((k) => !mostradas[k].equals(balancete.totais[k]));
      const pdf = await renderBalancetePdf(
        {
          ...cabecalho,
          entidade: { nome: tenant.nome, nuit: tenant.nuit },
          tipo: p.tipo,
          linhas,
            totais: balancete.totais,
            equilibrio: balancete.equilibrio,
            filtrosTiramLinhas,
          },
          { em: new Date(), por: utilizador?.nome?.trim() || utilizador?.email || 'utilizador desconhecido' },
      );
      const nome = safeFilename(`balancete-${cabecalho.exercicio}-${cabecalho.periodoInicial}-${cabecalho.periodoFinal}`);
      return new Response(pdf as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${nome}.pdf"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const ds = datasetBalancete({ totais: balancete.totais, linhas }, p.tipo, cabecalho);
    return exportResponse(ds, isFormatoExport(formato) ? formato : 'csv');
  },
  { permission: 'financas:exportar' },
);
