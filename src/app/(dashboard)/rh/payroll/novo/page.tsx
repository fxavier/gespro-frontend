/**
 * Processar Folha Mensal — Server Component wrapper (Spec 06).
 * O formulário processa a folha de TODOS os colaboradores activos em lote.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import NovoPayrollForm from './_components/novo-payroll-form';

export default async function NovoPayrollPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const totalColaboradoresActivos = await runWithTenantContext({ tenantId, userId }, () =>
    prisma.colaborador.count({
      where: { tenantId, status: 'ACTIVO', deletedAt: null },
    })
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Processar Folha Mensal"
        description="Processamento em lote da folha salarial de todos os colaboradores activos"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Salários', href: '/rh/payroll' },
          { label: 'Processar' },
        ]}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/rh/payroll">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Cancelar
            </Link>
          </Button>
        }
      />
      <NovoPayrollForm totalColaboradoresActivos={totalColaboradoresActivos} />
    </div>
  );
}
