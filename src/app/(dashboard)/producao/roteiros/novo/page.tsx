/**
 * Novo Roteiro — Server Component wrapper.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import NovoRoteiroForm from './_components/novo-roteiro-form';

export default async function NovoRoteiroPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const [estruturas, centrosTrabalho] = await runWithTenantContext(ctx, () =>
    Promise.all([
      prisma.estruturaProduto.findMany({
        where: { tenantId },
        select: { id: true, codigo: true, nome: true },
        orderBy: { nome: 'asc' },
      }),
      prisma.centroTrabalho.findMany({
        where: { tenantId, ativo: true },
        select: { id: true, codigo: true, nome: true },
        orderBy: { nome: 'asc' },
      }),
    ])
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Roteiro"
        description="Criar roteiro de produção com sequência de operações"
        breadcrumbs={[
          { label: 'Produção', href: '/producao' },
          { label: 'Roteiros', href: '/producao/roteiros' },
          { label: 'Novo' },
        ]}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/producao/roteiros">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Cancelar
            </Link>
          </Button>
        }
      />
      <NovoRoteiroForm estruturas={estruturas} centrosTrabalho={centrosTrabalho} />
    </div>
  );
}
