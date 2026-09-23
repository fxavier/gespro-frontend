import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { NotFoundError } from '@/lib/errors';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { obterContaReconciliacao } from '@/server/services/reconciliacao/consulta.service';
import { PageHeader } from '@/components/patterns';
import { ImportarForm } from './_components/importar-form';

export default async function ImportarExtractoPage({ params }: { params: Promise<{ contaId: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const { contaId } = await params;
  const conta = await runWithTenantContext(ctx, () => obterContaReconciliacao(contaId, ctx)).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const titulo = `${conta.banco} — ${conta.numeroConta}`;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="p-6 pb-0">
        <PageHeader
          title="Importar extracto"
          description={titulo}
          breadcrumbs={[
            { label: 'Contabilidade', href: '/contabilidade' },
            { label: 'Reconciliação Bancária', href: '/contabilidade/reconciliacao' },
            { label: titulo, href: `/contabilidade/reconciliacao/${contaId}` },
            { label: 'Importar' },
          ]}
        />
      </div>
      <ImportarForm contaBancariaId={contaId} />
    </div>
  );
}
