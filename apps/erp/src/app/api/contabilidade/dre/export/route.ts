/**
 * GET /api/contabilidade/dre/export?dataInicio=aaaa-mm-dd&dataFim=aaaa-mm-dd[&centroCustoId=…][&formato=pdf]
 * — a Demonstração de Resultados em PDF (ADR-0035 §8, issue #365).
 *
 * `withApi`, permissão `financas:exportar` (GET: passa em Leitura). As datas lêem-se pelo
 * MESMO `FiltroDRESchema` da página (dia civil de Maputo inteiro: início às 00:00, fim às
 * 23:59:59.999) — o ficheiro é a DRE que o utilizador está a ver. Datas inválidas ⇒ 400.
 */
import type { NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { ValidationError } from '@/lib/errors';
import { renderDrePdf } from '@/lib/documents/pdf/dre-pdf';
import { safeFilename } from '@/lib/reporting';
import { FiltroDRESchema } from '@/lib/validations/contabilidade';
import { gerarDRE } from '@/server/services/financas/contabilidade.service';
import { emissaoDosMapas } from '@/server/services/financas/emissao-mapas';
import { respostaPdf } from '../../_lib/pdf-resposta';

export const runtime = 'nodejs';

export const GET = withApi(
  async (req: NextRequest, api) => {
    const ctx = { tenantId: api.tenantId, userId: api.userId };
    const qs = req.nextUrl.searchParams;
    const lido = FiltroDRESchema.safeParse({
      dataInicio: qs.get('dataInicio') ?? undefined,
      dataFim: qs.get('dataFim') ?? undefined,
      centroCustoId: qs.get('centroCustoId') || undefined,
    });
    if (!lido.success) throw new ValidationError('Período inválido', lido.error.flatten());

    const dre = await gerarDRE(lido.data, ctx);
    const { entidade, emissao } = await emissaoDosMapas(ctx);
    const pdf = await renderDrePdf({ entidade, dre }, emissao);
    return respostaPdf(pdf, safeFilename(`dre-${qs.get('dataInicio')}-${qs.get('dataFim')}`));
  },
  { permission: 'financas:exportar', limitarExportacao: true },
);
