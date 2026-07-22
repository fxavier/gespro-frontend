/**
 * Atribuir Benefício — Server Component.
 * Pode ser chamada com ?beneficioId=<id> a partir do detalhe do benefício.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { BeneficioService } from '@/server/services/pessoas-projetos/beneficios.service';
import { PageHeader } from '@/components/patterns';
import { AtribuirBeneficioForm } from './_components/atribuir-beneficio-form';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AtribuirBeneficioPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const params = await searchParams;
  const beneficioIdParam = Array.isArray(params.beneficioId)
    ? params.beneficioId[0]
    : params.beneficioId;

  let beneficioNome: string | undefined;
  if (beneficioIdParam) {
    try {
      const b = await runWithTenantContext(ctx, () =>
        BeneficioService.obter(beneficioIdParam, ctx)
      );
      beneficioNome = (b as { nome: string }).nome;
    } catch {
      // ID inválido — ignora e mostra campo livre
    }
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Atribuir Benefício"
        description="Associar um benefício a um colaborador"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Benefícios', href: '/rh/beneficios' },
          ...(beneficioIdParam
            ? [
                { label: beneficioNome ?? 'Benefício', href: `/rh/beneficios/${beneficioIdParam}` },
              ]
            : []),
          { label: 'Atribuir' },
        ]}
      />

      <AtribuirBeneficioForm
        beneficioIdPreenchido={beneficioIdParam}
        beneficioNome={beneficioNome}
      />
    </div>
  );
}
