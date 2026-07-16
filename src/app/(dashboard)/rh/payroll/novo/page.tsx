/**
 * Novo Processamento Salarial — Server Component wrapper.
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
  const ctx = { tenantId, userId };

  const rawColaboradores = await runWithTenantContext(ctx, () =>
    prisma.colaborador.findMany({
      where: { tenantId, status: 'ACTIVO' },
      select: { id: true, nome: true, salarioBase: true },
      orderBy: { nome: 'asc' },
    })
  );
  const colaboradores = rawColaboradores.map((c) => ({
    id: c.id,
    nome: c.nome,
    salarioBase: c.salarioBase !== null ? Number(c.salarioBase) : null,
  }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Processar Salário"
        description="Criar novo processamento salarial"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Salários', href: '/rh/payroll' },
          { label: 'Novo' },
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
      <NovoPayrollForm colaboradores={colaboradores} />
    </div>
  );
}
