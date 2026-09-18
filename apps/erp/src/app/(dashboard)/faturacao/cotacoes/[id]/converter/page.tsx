/**
 * Converter cotação em proforma — Server Component (shell).
 *
 * Só uma cotação ACEITE se converte: a máquina de estados do serviço recusa o
 * resto, e aqui evita-se que o formulário sequer apareça.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { TRANSICOES_COTACAO_COMERCIAL } from '@/server/services/financas/faturacao.interface';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';
import { listarSeriesParaSelecao } from '../../../_lib/series';
import { ConverterDocumentoForm } from '../../../_components/converter-documento-form';

export default async function ConverterCotacaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const { id } = await params;
  const ctx = { tenantId, userId };

  const cotacao = await runWithTenantContext(ctx, () =>
    faturacaoService.obterCotacaoComercial(id, ctx)
  );
  if (!cotacao) notFound();

  const detalhe = `/faturacao/cotacoes/${cotacao.id}`;

  const cabecalho = (
    <PageHeader
      title={`Converter ${cotacao.numero}`}
      description="Gera uma proforma com as mesmas linhas e valores"
      breadcrumbs={[
        { label: 'Faturação', href: '/faturacao' },
        { label: 'Cotações', href: '/faturacao/cotacoes' },
        { label: cotacao.numero, href: detalhe },
        { label: 'Converter' },
      ]}
    />
  );

  if (!TRANSICOES_COTACAO_COMERCIAL[cotacao.status].includes('CONVERTIDA')) {
    return (
      <div className="p-6 space-y-6">
        {cabecalho}
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-6 text-sm">
          <p>
            {cotacao.status === 'CONVERTIDA'
              ? 'Esta cotação já foi convertida. A proforma que dela nasceu está no detalhe.'
              : 'Só uma cotação aceite pelo cliente se converte em proforma. Envie-a e registe a aceitação primeiro.'}
          </p>
          <Button asChild size="sm" variant="outline" className="mt-4">
            <Link href={detalhe}>Voltar à cotação</Link>
          </Button>
        </div>
      </div>
    );
  }

  const series = await runWithTenantContext(ctx, () => listarSeriesParaSelecao('PROFORMA', ctx));

  return (
    <div className="p-6 space-y-6">
      {cabecalho}

      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="font-medium">
          {cotacao.numero} · {formatarData(cotacao.dataEmissao)} ·{' '}
          {formatMZN(cotacao.total.toString())}
        </p>
        <p className="mt-1 text-muted-foreground">
          Passam {cotacao.linhas.length} linha(s) para a proforma, com os mesmos valores. A cotação
          fica CONVERTIDA e não volta atrás.
        </p>
      </div>

      <ConverterDocumentoForm
        tipo="cotacao"
        documentoId={cotacao.id}
        numero={cotacao.numero}
        series={series}
        voltarHref={detalhe}
      />
    </div>
  );
}
