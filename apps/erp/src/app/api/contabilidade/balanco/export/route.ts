/**
 * GET /api/contabilidade/balanco/export?exercicioId=…[&periodoFinal=1..13][&formato=pdf]
 * — o balanço simples por classes em PDF (ADR-0035 §8, issue #365).
 *
 * Route Handler via `withApi` (sessão → permissão → contexto de tenant), como o balancete.
 * Permissão `financas:exportar`; é um `GET`, logo passa em modo Leitura (ADR-0032). O tenant
 * vem da sessão; um exercício de outro tenant dá 404. Só há PDF: `formato` diferente de `pdf`
 * (ou ausente) dá o PDF na mesma — o balanço tem dezenas de linhas, não precisa de folha.
 * `periodoFinal` ausente ⇒ a omissão do serviço (13 encerrado, 12 aberto).
 */
import type { NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { ValidationError } from '@/lib/errors';
import { renderBalancoPdf } from '@/lib/documents/pdf/balanco-pdf';
import { safeFilename } from '@/lib/reporting';
import { gerarBalanco } from '@/server/services/financas/balanco.service';
import { emissaoDosMapas } from '@/server/services/financas/emissao-mapas';
import { respostaPdf } from '../../_lib/pdf-resposta';

export const runtime = 'nodejs';

export const GET = withApi(
  async (req: NextRequest, api) => {
    const ctx = { tenantId: api.tenantId, userId: api.userId };
    const qs = req.nextUrl.searchParams;
    const exercicioId = (qs.get('exercicioId') ?? '').trim();
    if (!exercicioId) throw new ValidationError('Indique o exercício (exercicioId)');
    const bruto = qs.get('periodoFinal');
    const periodoFinal = bruto ? Number(bruto) : undefined;

    const balanco = await gerarBalanco({ exercicioId, periodoFinal }, ctx);
    const { entidade, emissao } = await emissaoDosMapas(ctx);
    const pdf = await renderBalancoPdf(
      { entidade, exercicio: balanco.exercicio.codigo, periodoFinal: balanco.periodoFinal, balanco },
      emissao,
    );
    return respostaPdf(pdf, safeFilename(`balanco-${balanco.exercicio.codigo}-p${balanco.periodoFinal}`));
  },
  { permission: 'financas:exportar', limitarExportacao: true },
);
