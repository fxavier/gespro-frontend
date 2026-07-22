/**
 * Novo Registo de Assiduidade — Server Component wrapper.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import NovaAssiduidadeForm from './_components/nova-assiduidade-form';

export default async function NovaAssiduidadePage() {
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
        title="Registar Assiduidade"
        description="Registar presença e horário de colaborador"
        breadcrumbs={[
          { label: 'RH', href: '/rh' },
          { label: 'Assiduidade', href: '/rh/assiduidade' },
          { label: 'Novo' },
        ]}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/rh/assiduidade">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Cancelar
            </Link>
          </Button>
        }
      />
      <NovaAssiduidadeForm colaboradores={colaboradores} />
    </div>
  );
}
