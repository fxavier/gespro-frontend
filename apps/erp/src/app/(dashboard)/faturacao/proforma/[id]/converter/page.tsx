/**
 * Converter proforma em factura — Server Component (shell).
 *
 * Do outro lado nasce um documento fiscal já EMITIDO, numerado pela série
 * escolhida. Só uma proforma ACEITE se converte.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { TRANSICOES_PROFORMA } from '@/server/services/financas/faturacao.interface';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';
import { listarSeriesParaSelecao } from '../../../_lib/series';
import { ConverterDocumentoForm } from '../../../_components/converter-documento-form';

export default async function ConverterProformaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const { id } = await params;
  const ctx = { tenantId, userId };

  const proforma = await runWithTenantContext(ctx, () => faturacaoService.obterProforma(id, ctx));
  if (!proforma) notFound();

  const detalhe = `/faturacao/proforma/${proforma.id}`;

  const cabecalho = (
    <PageHeader
      title={`Converter ${proforma.numero}`}
      description="Emite a factura com as mesmas linhas e valores"
      breadcrumbs={[
        { label: 'Faturação', href: '/faturacao' },
        { label: 'Proformas', href: '/faturacao/proforma' },
        { label: proforma.numero, href: detalhe },
        { label: 'Converter' },
      ]}
    />
  );

  if (!TRANSICOES_PROFORMA[proforma.status].includes('CONVERTIDA')) {
    return (
      <div className="p-6 space-y-6">
        {cabecalho}
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-6 text-sm">
          <p>
            {proforma.status === 'CONVERTIDA'
              ? 'Esta proforma já foi convertida. A factura que dela nasceu está no detalhe.'
              : 'Só uma proforma aceite pelo cliente se converte em factura. Envie-a e registe a aceitação primeiro.'}
          </p>
          <Button asChild size="sm" variant="outline" className="mt-4">
            <Link href={detalhe}>Voltar à proforma</Link>
          </Button>
        </div>
      </div>
    );
  }

  const series = await runWithTenantContext(ctx, () => listarSeriesParaSelecao('FATURA', ctx));

  return (
    <div className="p-6 space-y-6">
      {cabecalho}

      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="font-medium">
          {proforma.numero} · {formatarData(proforma.dataEmissao)} ·{' '}
          {formatMZN(proforma.total.toString())}
        </p>
        <p className="mt-1 text-muted-foreground">
          Passam {proforma.linhas.length} linha(s) para a factura, com os mesmos valores. A factura
          nasce EMITIDA e é append-only: corrige-se por nota de crédito, não se apaga.
        </p>
      </div>

      <ConverterDocumentoForm
        tipo="proforma"
        documentoId={proforma.id}
        numero={proforma.numero}
        series={series}
        voltarHref={detalhe}
      />
    </div>
  );
}
