/**
 * Reconciliação Bancária — Server Component (listagem).
 * Criação em rota separada /reconciliacao/nova (sem modais).
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const fmtMZN = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });
const fmtDate = (s: string) => new Date(s).toLocaleDateString('pt-PT');

async function ReconciliacoesSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  try {
    // No filtro means listing all reconciliacoes — service returns list keyed by contaBancariaId
    const contas = await runWithTenantContext({ tenantId, userId }, () =>
      contabilidadeService.listarContasBancarias({ tenantId, userId })
    );

    if (!contas || contas.length === 0) {
      return (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          Sem contas bancárias configuradas. Configure as contas bancárias primeiro.
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {contas.map((conta: any) => (
          <Card key={conta.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{conta.nome ?? conta.numeroConta}</CardTitle>
                  <CardDescription>
                    {conta.banco} — {conta.numeroConta}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={conta.ativo ? 'default' : 'secondary'}>
                    {conta.ativo ? 'Activa' : 'Inactiva'}
                  </Badge>
                  <Button asChild size="sm">
                    <Link href={`/contabilidade/reconciliacao/nova?contaBancariaId=${conta.id}`}>
                      <Plus className="h-4 w-4 mr-1" />
                      Reconciliar
                    </Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Saldo contabilístico: <span className="font-mono tabular-nums font-medium">{fmtMZN.format(parseFloat(conta.saldoContabilistico?.toString() ?? '0'))}</span>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  } catch {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        Erro ao carregar contas bancárias.
      </div>
    );
  }
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
          <Button asChild size="sm">
            <Link href="/contabilidade/reconciliacao/nova">
              <Plus className="h-4 w-4 mr-2" />
              Nova Reconciliação
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<TableSkeleton rows={4} cols={3} />}>
        <ReconciliacoesSection tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
