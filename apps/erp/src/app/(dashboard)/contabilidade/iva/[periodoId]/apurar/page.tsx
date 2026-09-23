/**
 * Apurar IVA de um período — página de confirmação e execução.
 *
 * Servidor: verifica o período. Cliente: formulário de confirmação com
 * tratamento especial dos quatro códigos de recusa (ADR-0034 §4).
 *
 * NUNCA 'use client': gate-sc.mjs recusa esta página.
 */

import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { PageHeader } from '@/components/patterns';
import { ApurarIvaForm } from './_components/apurar-iva-form';

export default async function ApurarIvaPage({
  params,
}: {
  params: Promise<{ periodoId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { periodoId } = await params;
  const { tenantId, id: userId } = session.user;

  const ctx = { tenantId, userId };

  const periodos = await runWithTenantContext(ctx, () =>
    contabilidadeService.listarPeriodos({}, ctx)
  );
  const periodo = periodos.find((p) => p.id === periodoId);
  if (!periodo) notFound();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Apurar IVA"
        description={`Calcular e lançar o apuramento do IVA para o período ${periodo.codigo}`}
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Apuramento de IVA', href: '/contabilidade/iva' },
          { label: periodo.codigo, href: `/contabilidade/iva/${periodoId}` },
          { label: 'Apurar' },
        ]}
      />
      <ApurarIvaForm periodoId={periodoId} periodoCodigo={periodo.codigo} />
    </div>
  );
}
