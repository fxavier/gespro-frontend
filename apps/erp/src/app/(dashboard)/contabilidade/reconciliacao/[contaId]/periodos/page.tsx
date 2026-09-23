import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { NotFoundError } from '@/lib/errors';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { listarPeriodos, obterContaReconciliacao } from '@/server/services/reconciliacao/consulta.service';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import { PeriodosTable, type PeriodoRow } from './_components/periodos-table';

export default async function PeriodosPage({ params }: { params: Promise<{ contaId: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const { contaId } = await params;
  const [conta, periodos] = await runWithTenantContext(ctx, () =>
    Promise.all([obterContaReconciliacao(contaId, ctx), listarPeriodos(contaId, ctx)]),
  ).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const titulo = `${conta.banco} — ${conta.numeroConta}`;
  const base = `/contabilidade/reconciliacao/${contaId}`;
  const rows: PeriodoRow[] = periodos.map((p) => ({
    id: p.id,
    contaId,
    dataInicio: p.dataInicio.toISOString(),
    dataFim: p.dataFim.toISOString(),
    estado: p.estado,
    saldoFinalBanco: p.saldoFinalBanco.toString(),
    // O mapa só fica gravado no fecho; antes disso o residual é o do mapa ao vivo.
    diferencaResidual: p.estado === 'RECONCILIADO' ? p.diferencaResidual.toString() : null,
  }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Períodos de reconciliação"
        description={titulo}
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Reconciliação Bancária', href: '/contabilidade/reconciliacao' },
          { label: titulo, href: base },
          { label: 'Períodos' },
        ]}
        actions={
          !conta.periodoActivo && (
            <Button asChild size="sm">
              <Link href={`${base}/periodos/novo`}>
                <Plus className="h-4 w-4 mr-2" /> Abrir período
              </Link>
            </Button>
          )
        }
      />
      <PeriodosTable data={rows} />
    </div>
  );
}
