/**
 * Editar Benefício (#162) — Server Component (NUNCA 'use client').
 *
 * Carrega o benefício do serviço e entrega os valores ao BeneficioForm partilhado com o
 * «novo». Editar mexe só no catálogo: as atribuições já feitas guardam os seus valores.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { BeneficioService } from '@/server/services/pessoas-projetos/beneficios.service';
import { NotFoundError } from '@/lib/errors';
import { PageHeader } from '@/components/patterns';
import { BeneficioForm } from '../../_components/beneficio-form';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarBeneficioPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;
  const ctx = { tenantId, userId };

  let beneficio: Awaited<ReturnType<typeof BeneficioService.obter>>;
  try {
    beneficio = await runWithTenantContext(ctx, () => BeneficioService.obter(id, ctx));
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Editar ${beneficio.nome}`}
        description="Actualize os dados do benefício. As atribuições já feitas mantêm os seus valores."
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Benefícios', href: '/rh/beneficios' },
          { label: beneficio.nome, href: `/rh/beneficios/${id}` },
          { label: 'Editar' },
        ]}
      />

      <BeneficioForm
        beneficioId={id}
        defaultValues={{
          nome: beneficio.nome,
          tipo: beneficio.tipo,
          descricao: beneficio.descricao ?? '',
          fornecedor: beneficio.fornecedor ?? '',
          custoTotal: beneficio.custoTotal.toString(),
          comparticipacaoEmpresa: beneficio.comparticipacaoEmpresa.toString(),
          descontoColaborador: beneficio.descontoColaborador.toString(),
          periodicidade: beneficio.periodicidade,
          tributavel: beneficio.tributavel ? 'true' : 'false',
        }}
      />
    </div>
  );
}
