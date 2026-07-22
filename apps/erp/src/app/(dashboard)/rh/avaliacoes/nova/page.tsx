/**
 * Nova Avaliação de Desempenho — Server Component wrapper.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import NovaAvaliacaoForm from './_components/nova-avaliacao-form';

export default async function NovaAvaliacaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const colaboradores = await runWithTenantContext(ctx, () =>
    prisma.colaborador.findMany({
      where: { tenantId, status: 'ACTIVO' },
      select: { id: true, nome: true, codigo: true },
      orderBy: { nome: 'asc' },
    })
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Avaliação de Desempenho"
        description="Registar avaliação de desempenho de colaborador"
        breadcrumbs={[
          { label: 'RH', href: '/rh' },
          { label: 'Avaliações', href: '/rh/avaliacoes' },
          { label: 'Nova' },
        ]}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/rh/avaliacoes">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Cancelar
            </Link>
          </Button>
        }
      />
      <NovaAvaliacaoForm colaboradores={colaboradores} avaliadorId={userId} />
    </div>
  );
}
