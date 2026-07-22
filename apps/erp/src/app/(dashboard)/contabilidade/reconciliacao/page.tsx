/**
 * Reconciliação Bancária — Server Component (listagem).
 * Criação em rota separada /reconciliacao/nova (sem modais).
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Landmark, Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { Button } from '@/components/ui/button';
import { PageHeader, TableSkeleton } from '@/components/patterns';
import { ReconciliacoesTable, type ReconciliacaoRow } from './_components/reconciliacoes-table';

const fmtData = (d: Date) => d.toLocaleDateString('pt-PT');

async function ReconciliacoesSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const recs = await runWithTenantContext(ctx, () =>
    contabilidadeService.listarReconciliacoes(ctx),
  );

  const rows: ReconciliacaoRow[] = recs.map((r) => ({
    id: r.id,
    contaLabel: `${r.contaBancaria.banco} — ${r.contaBancaria.numeroConta}`,
    periodo: `${fmtData(r.dataInicio)} — ${fmtData(r.dataFim)}`,
    saldoFinalBanco: r.saldoFinalBanco.toFixed(2),
    saldoFinalContabil: r.saldoFinalContabil.toFixed(2),
    diferencaNaoConciliada: r.diferencaNaoConciliada.toFixed(2),
    status: r.status,
  }));

  return <ReconciliacoesTable data={rows} />;
}

export default async function ReconciliacaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Reconciliação Bancária"
        description="Conciliação entre extractos bancários e lançamentos contabilísticos"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Reconciliação Bancária' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/contabilidade/contas-bancarias">
                <Landmark className="h-4 w-4 mr-2" />
                Contas Bancárias
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/contabilidade/reconciliacao/nova">
                <Plus className="h-4 w-4 mr-2" />
                Nova Reconciliação
              </Link>
            </Button>
          </div>
        }
      />

      <Suspense fallback={<TableSkeleton rows={6} cols={6} />}>
        <ReconciliacoesSection tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
