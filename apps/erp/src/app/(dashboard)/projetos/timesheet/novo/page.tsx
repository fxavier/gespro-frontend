/**
 * Novo Registo de Tempo — Server Component wrapper.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import NovoTimesheetForm from './_components/novo-timesheet-form';

export default async function NovoTimesheetPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const [projetos, colaboradores] = await runWithTenantContext(ctx, () =>
    Promise.all([
      prisma.projeto.findMany({
        where: { tenantId },
        select: { id: true, nome: true, codigo: true },
        orderBy: { nome: 'asc' },
      }),
      prisma.colaborador.findMany({
        where: { tenantId, status: 'ACTIVO' },
        select: { id: true, nome: true, codigo: true },
        orderBy: { nome: 'asc' },
      }),
    ])
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Registar Tempo"
        description="Novo registo de horas no timesheet"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Timesheet', href: '/projetos/timesheet' },
          { label: 'Novo' },
        ]}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/projetos/timesheet">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Cancelar
            </Link>
          </Button>
        }
      />
      <NovoTimesheetForm projetos={projetos} colaboradores={colaboradores} />
    </div>
  );
}
