/**
 * Rejeitar ausência (#94) — Server Component. Recolhe o motivo, logo é rota própria
 * (regra sem modais), não um diálogo.
 */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { formatarData } from '@/lib/format-date';
import { Button } from '@/components/ui/button';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { RejeitarAusenciaForm } from './_components/rejeitar-ausencia-form';

export default async function RejeitarAusenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const { id } = await params;

  const ausencia = await runWithTenantContext({ tenantId, userId }, () =>
    prisma.ausencia.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        status: true,
        dataInicio: true,
        dataFim: true,
        diasAusencia: true,
        colaborador: { select: { nome: true } },
      },
    })
  );
  if (!ausencia) notFound();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Rejeitar Ausência"
        description={`${ausencia.colaborador?.nome ?? '—'} · ${formatarData(ausencia.dataInicio)} a ${formatarData(ausencia.dataFim)} (${ausencia.diasAusencia} dia(s))`}
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Ausências', href: '/rh/ausencias' },
          { label: 'Rejeitar' },
        ]}
      />
      {ausencia.status === 'PENDENTE' ? (
        <RejeitarAusenciaForm id={ausencia.id} />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Esta ausência já não está pendente: <StatusBadge status={ausencia.status} />
          </p>
          <Button variant="outline" asChild>
            <Link href="/rh/ausencias">Voltar às ausências</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
