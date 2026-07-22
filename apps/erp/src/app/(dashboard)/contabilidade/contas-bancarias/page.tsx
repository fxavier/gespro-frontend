/**
 * Contas Bancárias — Server Component (listagem). Criação/edição em rotas
 * dedicadas (sem modais).
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { Button } from '@/components/ui/button';
import { PageHeader, TableSkeleton } from '@/components/patterns';
import { ContasBancariasTable, type ContaBancariaRow } from './_components/contas-bancarias-table';

async function ContasSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const { contas, contasPGC } = await runWithTenantContext(ctx, async () => {
    const contas = await contabilidadeService.listarContasBancarias(ctx);
    const contasPGC = await contabilidadeService.listarContas(
      { classe: 'CLASSE_1', aceitaLancamento: true, take: 200 },
      ctx,
    );
    return { contas, contasPGC };
  });

  const pgcPorId = new Map(contasPGC.items.map((c) => [c.id, `${c.codigo} · ${c.nome}`]));
  const rows: ContaBancariaRow[] = contas.map((c) => ({
    id: c.id,
    banco: c.banco,
    agencia: c.agencia,
    numeroConta: c.numeroConta,
    tipoConta: c.tipoConta,
    moeda: c.moeda,
    contaContabil: pgcPorId.get(c.contaContabilId) ?? '—',
    ativo: c.ativo,
  }));

  return <ContasBancariasTable data={rows} />;
}

export default async function ContasBancariasPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Contas Bancárias"
        description="Contas bancárias ligadas ao plano de contas (classe 1)"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Reconciliação Bancária', href: '/contabilidade/reconciliacao' },
          { label: 'Contas Bancárias' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/contabilidade/contas-bancarias/nova">
              <Plus className="h-4 w-4 mr-2" />
              Nova Conta Bancária
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<TableSkeleton rows={4} cols={7} />}>
        <ContasSection tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
