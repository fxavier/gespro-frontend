/**
 * Reconciliação bancária (ADR-0038) — uma linha por conta, com o que falta
 * fazer em cada uma. O trabalho faz-se no workspace da conta, por estado.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Landmark } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { listarContasReconciliacao, VISTAS } from '@/server/services/reconciliacao/consulta.service';
import { Button } from '@/components/ui/button';
import { PageHeader, TableSkeleton } from '@/components/patterns';
import { ContasTable, type ContaReconciliacaoRow } from './_components/contas-table';

const soma = (c: Partial<Record<string, number>>, estados: readonly string[]) =>
  estados.reduce((a, e) => a + (c[e] ?? 0), 0);

async function Contas({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const contas = await runWithTenantContext(ctx, () => listarContasReconciliacao(ctx));
  const rows: ContaReconciliacaoRow[] = contas.map((c) => ({
    id: c.id,
    conta: `${c.banco} — ${c.numeroConta}`,
    contaPgc: `${c.contaContabil.codigo} ${c.contaContabil.nome}`,
    pgcPartilhada: c.pgcPartilhada,
    excecoes: soma(c.contagens.banco, VISTAS.excecoes) + soma(c.contagens.contabilidade, VISTAS.excecoes),
    sugestoes: c.contagens.sugestoes,
    emTransito: soma(c.contagens.contabilidade, ['EM_TRANSITO']),
    periodo: c.periodoActivo && {
      estado: c.periodoActivo.estado,
      dataInicio: c.periodoActivo.dataInicio.toISOString(),
      dataFim: c.periodoActivo.dataFim.toISOString(),
    },
  }));
  return <ContasTable data={rows} />;
}

export default async function ReconciliacaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Reconciliação Bancária"
        description="O que a contabilidade registou já apareceu no banco? O que o banco mostra já foi registado?"
        breadcrumbs={[{ label: 'Contabilidade', href: '/contabilidade' }, { label: 'Reconciliação Bancária' }]}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/contabilidade/contas-bancarias">
              <Landmark className="h-4 w-4 mr-2" />
              Contas Bancárias
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<TableSkeleton rows={4} cols={5} />}>
        <Contas tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
