/**
 * Nova Ordem de Produção — Server Component wrapper.
 * Carrega dados de referência para o formulário CC.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import NovaOrdemForm from './_components/nova-ordem-form';

export default async function NovaOrdemPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const roteiros = await runWithTenantContext(ctx, () =>
    prisma.roteiro.findMany({
      where: { tenantId, status: 'ATIVO' },
      select: { id: true, codigo: true, nome: true },
      orderBy: { nome: 'asc' },
    })
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Ordem de Produção"
        description="Criar uma nova ordem de produção"
        breadcrumbs={[
          { label: 'Produção', href: '/producao' },
          { label: 'Ordens', href: '/producao/ordens' },
          { label: 'Nova' },
        ]}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/producao/ordens">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Cancelar
            </Link>
          </Button>
        }
      />
      <NovaOrdemForm roteiros={roteiros} />
    </div>
  );
}
