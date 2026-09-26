/**
 * GET /api/contabilidade/dfc/export?dataInicio=aaaa-mm-dd&dataFim=aaaa-mm-dd
 * — Demonstração de Fluxos de Caixa em PDF (nó `export` do grafo `dfc`,
 * ticket 9.1; ADR-0037 §7 com a Emenda 2026-09-25, E4: só PDF).
 *
 * Route Handler via `withApi` (sessão → permissão → contexto de tenant),
 * nunca Server Action. Permissão `financas:exportar`. É um `GET`, logo passa
 * em modo Leitura sem declarar nada (ADR-0032: exportar nunca se trava).
 *
 * O pedido tem a MESMA forma que a página `/contabilidade/dfc`: as datas da
 * URL resolvem-se para os períodos que as contêm com `resolverIntervaloDFC`
 * sobre `listarPeriodos`, exactamente como a página — o PDF é do intervalo que
 * o utilizador está a ver, incluindo o alargamento a períodos completos. A
 * rota depende SÓ de `listarPeriodos` e `gerarDFC`.
 *
 * Respostas:
 *  - intervalo irresolúvel (data inválida, dia sem período) ⇒ `ValidationError`, 422 JSON;
 *  - impedimentos (contas com movimento e sem mapeamento, I7) ⇒ 422 JSON com
 *    TODAS as frases e contas (código `DFC_COM_IMPEDIMENTOS`), sem PDF;
 *  - `BusinessRuleError` do serviço (`DFC_NAO_ARTICULA`, `DFC_ENTRE_EXERCICIOS`,
 *    `DFC_INTERVALO_INVERTIDO`) ⇒ 409 pelo `withApi`, com o código; `NotFoundError`
 *    ⇒ 404. Não se apanham aqui: um mapa que não articula não sai, nem em PDF;
 *  - o mapa ⇒ 200 `application/pdf`, anexo.
 *
 * `runtime = 'nodejs'`: o motor de PDF (`@react-pdf/renderer`) não corre em Edge.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { ValidationError } from '@/lib/errors';
import { resolverIntervaloDFC } from '@/lib/dfc-intervalo';
import { renderDfcPdf } from '@/lib/documents/pdf/dfc-pdf';
import { safeFilename } from '@/lib/reporting';
import { exportLimiter, rateLimitedResponse } from '@/server/security/rate-limiter';
import { listarPeriodos } from '@/server/services/financas/contabilidade.service';
import { gerarDFC } from '@/server/services/financas/dfc.service';
import { temImpedimentos } from '@/server/services/financas/dfc.interface';

export const runtime = 'nodejs';

/** Código do envelope 422 quando o mapa não sai por contas não mapeadas (§4). */
const DFC_COM_IMPEDIMENTOS = 'DFC_COM_IMPEDIMENTOS';

export const GET = withApi(
  async (req: NextRequest, api) => {
    const rl = await exportLimiter.consume(`${api.userId}::export`);
    if (rl.limited) return rateLimitedResponse(rl.retryAfterSec);

    // O tenant vem da sessão (`withApi`), nunca da query.
    const ctx = { tenantId: api.tenantId, userId: api.userId };
    const qs = req.nextUrl.searchParams;
    const um = (v: string | null) => v || undefined;

    const periodos = await listarPeriodos({}, ctx);
    const intervalo = resolverIntervaloDFC(
      periodos,
      { dataInicio: um(qs.get('dataInicio')), dataFim: um(qs.get('dataFim')) },
      new Date(),
    );
    if (!intervalo.ok) throw new ValidationError(intervalo.motivo);

    const resultado = await gerarDFC(
      { periodoInicioId: intervalo.inicio.id, periodoFimId: intervalo.fim.id },
      ctx,
    );

    if (temImpedimentos(resultado)) {
      return NextResponse.json(
        {
          error: {
            code: DFC_COM_IMPEDIMENTOS,
            message:
              'A DFC não pode ser exportada: há contas com movimento sem mapeamento a uma rubrica. ' +
              resultado.impedimentos.join(' '),
            details: {
              impedimentos: resultado.impedimentos,
              contasNaoMapeadas: resultado.contasNaoMapeadas.map((c) => ({
                conta: c.conta,
                movimento: c.movimento.toFixed(2),
                saldoFinal: c.saldoFinal.toFixed(2),
                comparativo: c.comparativo,
              })),
              avisos: resultado.avisos,
            },
          },
        },
        { status: 422, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const pdf = await renderDfcPdf(resultado, new Date());
    const nome = safeFilename(`dfc-${intervalo.inicio.codigo}-a-${intervalo.fim.codigo}`);

    return new Response(pdf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nome}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  },
  { permission: 'financas:exportar' },
);
