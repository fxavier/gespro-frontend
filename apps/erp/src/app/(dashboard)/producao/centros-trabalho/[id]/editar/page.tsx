/**
 * Editar Centro de Trabalho — Server Component wrapper. #165.
 * Desactivar é desligar «Activo» aqui (não há apagar).
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import { CentroTrabalhoForm } from '../../_components/centro-trabalho-form';

export default async function EditarCentroTrabalhoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const centro = await runWithTenantContext(ctx, () =>
    prisma.centroTrabalho.findFirst({ where: { id, tenantId } }),
  );
  if (!centro) notFound();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Editar ${centro.codigo}`}
        description={centro.nome}
        breadcrumbs={[
          { label: 'Produção', href: '/producao' },
          { label: 'Centros de Trabalho', href: '/producao/centros-trabalho' },
          { label: centro.codigo },
        ]}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/producao/centros-trabalho">
              <ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Voltar
            </Link>
          </Button>
        }
      />
      <CentroTrabalhoForm
        centroId={centro.id}
        valoresIniciais={{
          codigo: centro.codigo,
          nome: centro.nome,
          tipo: centro.tipo,
          descricao: centro.descricao ?? '',
          custoHora: Number(centro.custoHora.toString()),
          capacidadeHorasDia: centro.capacidadeHorasDia ? Number(centro.capacidadeHorasDia.toString()) : undefined,
          ativo: centro.ativo,
        }}
      />
    </div>
  );
}
