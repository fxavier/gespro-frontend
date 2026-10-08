/**
 * Reprovar a qualidade de uma Ordem de Produção (#166) — Server Component (NUNCA 'use client').
 *
 * Rota própria porque recolhe dados (o motivo): um campo de texto é formulário, logo é rota,
 * não AlertDialog. Fora de EM_PRODUCAO, ou sem `producao:ordens:update`, volta ao detalhe.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { OrdemProducaoService } from '@/server/services/pessoas-projetos/producao.service';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { ReprovarQualidadeForm } from './_components/reprovar-qualidade-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReprovarQualidadePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId, permissions } = session.user;
  const ctx = { tenantId, userId };

  let ordem;
  try {
    ordem = await runWithTenantContext(ctx, () => OrdemProducaoService.obter(id, ctx));
  } catch {
    notFound();
  }

  if (ordem.status !== 'EM_PRODUCAO' || !permissions.includes('producao:ordens:update')) {
    redirect(`/producao/ordens/${id}`);
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Reprovar qualidade — ${ordem.numero}`}
        description="A ordem continua em produção para retrabalho e nova inspecção"
        breadcrumbs={[
          { label: 'Produção', href: '/producao' },
          { label: 'Ordens de Produção', href: '/producao/ordens' },
          { label: ordem.numero, href: `/producao/ordens/${id}` },
          { label: 'Reprovar qualidade' },
        ]}
        badge={<StatusBadge status={ordem.status} />}
      />

      <ReprovarQualidadeForm id={id} />
    </div>
  );
}
