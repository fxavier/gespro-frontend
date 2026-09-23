import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { NotFoundError } from '@/lib/errors';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { listarPeriodos, obterContaReconciliacao } from '@/server/services/reconciliacao/consulta.service';
import { diaCivilEmMaputo } from '@/server/services/financas/contabilidade.service';
import { PageHeader } from '@/components/patterns';
import { AbrirPeriodoForm } from './_components/abrir-periodo-form';

const MS_POR_DIA = 86_400_000;

export default async function NovoPeriodoPage({ params }: { params: Promise<{ contaId: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const { contaId } = await params;
  const base = `/contabilidade/reconciliacao/${contaId}`;
  const [conta, periodos] = await runWithTenantContext(ctx, () =>
    Promise.all([obterContaReconciliacao(contaId, ctx), listarPeriodos(contaId, ctx)]),
  ).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (conta.periodoActivo) redirect(`${base}/periodos/${conta.periodoActivo.id}`);

  // Sugere o dia seguinte ao fim do último período fechado — encadear evita buracos.
  const ultimo = periodos.find((p) => p.estado === 'RECONCILIADO');
  let sugestaoInicio = '';
  if (ultimo) {
    const { ano, mes, dia } = diaCivilEmMaputo(new Date(ultimo.dataFim.getTime() + MS_POR_DIA));
    sugestaoInicio = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }
  const titulo = `${conta.banco} — ${conta.numeroConta}`;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="p-6 pb-0">
        <PageHeader
          title="Abrir período de reconciliação"
          description={titulo}
          breadcrumbs={[
            { label: 'Contabilidade', href: '/contabilidade' },
            { label: 'Reconciliação Bancária', href: '/contabilidade/reconciliacao' },
            { label: titulo, href: base },
            { label: 'Períodos', href: `${base}/periodos` },
            { label: 'Novo' },
          ]}
        />
      </div>
      <AbrirPeriodoForm contaBancariaId={contaId} sugestaoInicio={sugestaoInicio} />
    </div>
  );
}
