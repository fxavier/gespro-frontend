/**
 * Rejeitar cotação — Server Component (shell).
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
import { RejeitarCotacaoForm } from './_components/rejeitar-cotacao-form';

export default async function RejeitarCotacaoPage({
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
      title={`Rejeitar ${cotacao.numero}`}
      description="Regista a recusa do cliente"
      breadcrumbs={[
        { label: 'Faturação', href: '/faturacao' },
        { label: 'Cotações', href: '/faturacao/cotacoes' },
        { label: cotacao.numero, href: detalhe },
        { label: 'Rejeitar' },
      ]}
    />
  );

  if (!TRANSICOES_COTACAO_COMERCIAL[cotacao.status].includes('REJEITADA')) {
    return (
      <div className="p-6 space-y-6">
        {cabecalho}
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-6 text-sm">
          <p>
            Só se rejeita uma cotação que esteja no cliente — ou seja, ENVIADA. Esta está{' '}
            {cotacao.status}.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-4">
            <Link href={detalhe}>Voltar à cotação</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {cabecalho}

      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="font-medium">
          {cotacao.numero} · {formatarData(cotacao.dataEmissao)} ·{' '}
          {formatMZN(cotacao.total.toString())}
        </p>
      </div>

      <RejeitarCotacaoForm cotacaoId={cotacao.id} numero={cotacao.numero} />
    </div>
  );
}
