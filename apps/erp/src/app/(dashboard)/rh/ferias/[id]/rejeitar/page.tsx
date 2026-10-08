/**
 * Rejeitar pedido de férias (#156) — Server Component. Recolhe o motivo, logo é rota
 * própria (regra sem modais), não um diálogo. Molde: rejeitar ausência (#94).
 */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { formatarData } from '@/lib/format-date';
import { Button } from '@/components/ui/button';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { RejeitarFeriasForm } from './_components/rejeitar-ferias-form';

export default async function RejeitarFeriasPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const { id } = await params;

  const sol = await runWithTenantContext({ tenantId, userId }, () =>
    prisma.solicitacaoFerias.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        status: true,
        dataInicio: true,
        dataFim: true,
        diasSolicitados: true,
        ferias: { select: { colaborador: { select: { nome: true } } } },
      },
    })
  );
  if (!sol) notFound();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Rejeitar Pedido de Férias"
        description={`${sol.ferias?.colaborador?.nome ?? '—'} · ${formatarData(sol.dataInicio)} a ${formatarData(sol.dataFim)} (${sol.diasSolicitados} dia(s))`}
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Férias', href: '/rh/ferias' },
          { label: 'Rejeitar' },
        ]}
      />
      {sol.status === 'PENDENTE' ? (
        <RejeitarFeriasForm solicitacaoId={sol.id} />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Este pedido já não está pendente: <StatusBadge status={sol.status} />
          </p>
          <Button variant="outline" asChild>
            <Link href="/rh/ferias">Voltar às férias</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
