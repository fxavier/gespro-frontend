/**
 * Importação de extracto bancário (CSV) — Server Component.
 * O parsing/validação corre no cliente (pré-visualização) e a persistência
 * na Server Action `importarExtrato` (all-or-nothing).
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { PageHeader } from '@/components/patterns';
import { ImportarExtratoForm } from './_components/importar-extrato-form';

export default async function ImportarExtratoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const { id } = await params;
  const ctx = { tenantId, userId };

  const rec = await runWithTenantContext(ctx, () =>
    contabilidadeService.obterReconciliacao(id, ctx),
  );
  if (!rec) notFound();
  if (rec.status !== 'EM_ANDAMENTO') redirect(`/contabilidade/reconciliacao/${id}`);

  const contaLabel = `${rec.contaBancaria.banco} — ${rec.contaBancaria.numeroConta}`;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Importar Extracto Bancário"
        description={`Reconciliação de ${contaLabel} · ${rec.dataInicio.toLocaleDateString('pt-PT')} — ${rec.dataFim.toLocaleDateString('pt-PT')}`}
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Reconciliação Bancária', href: '/contabilidade/reconciliacao' },
          { label: contaLabel, href: `/contabilidade/reconciliacao/${id}` },
          { label: 'Importar Extracto' },
        ]}
      />
      <ImportarExtratoForm reconciliacaoId={id} />
    </div>
  );
}
