/**
 * Dashboard de Faturação — Server Component.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Receipt, FileText, TrendingUp, Clock, CheckCircle, AlertTriangle, Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { Button } from '@/components/ui/button';
import { PageHeader, KpiCard } from '@/components/patterns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/patterns';

const fmtMZN = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });
const n = (v: any) => parseFloat(v?.toString() ?? '0');

async function DashboardContent({ tenantId, userId }: { tenantId: string; userId: string }) {
  try {
    const [todas, pagas, pendentes, vencidas] = await Promise.all([
      runWithTenantContext({ tenantId, userId }, () =>
        faturacaoService.listarFaturas({ take: 1000 } as any, { tenantId, userId })
      ),
      runWithTenantContext({ tenantId, userId }, () =>
        faturacaoService.listarFaturas({ statusFatura: 'PAGA', take: 1000 } as any, { tenantId, userId })
      ),
      runWithTenantContext({ tenantId, userId }, () =>
        faturacaoService.listarFaturas({ statusFatura: 'EMITIDA', take: 1000 } as any, { tenantId, userId })
      ),
      runWithTenantContext({ tenantId, userId }, () =>
        faturacaoService.listarFaturas({ statusFatura: 'VENCIDA', take: 1000 } as any, { tenantId, userId })
      ),
    ]);

    const totalFaturado = todas.items.reduce((s: number, f: any) => s + n(f.total), 0);
    const totalPago = pagas.items.reduce((s: number, f: any) => s + n(f.total), 0);
    const totalPendente = pendentes.items.reduce((s: number, f: any) => s + n(f.total), 0);
    const nVencidas = vencidas.items.length;

    // Latest 5 faturas
    const recentes = todas.items.slice(0, 5);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Total Faturado"
            value={fmtMZN.format(totalFaturado)}
            icon={<Receipt className="h-5 w-5" />}
          />
          <KpiCard
            title="Recebido"
            value={fmtMZN.format(totalPago)}
            icon={<CheckCircle className="h-5 w-5" />}
          />
          <KpiCard
            title="Pendente"
            value={fmtMZN.format(totalPendente)}
            icon={<Clock className="h-5 w-5" />}
          />
          <KpiCard
            title="Vencidas"
            value={String(nVencidas)}
            icon={<AlertTriangle className="h-5 w-5" />}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Últimas Faturas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentes.map((f: any) => (
                <div key={f.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm font-medium">{f.serie?.numero ?? f.id}</p>
                    <p className="text-xs text-muted-foreground truncate">{f.cliente?.nome ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="tabular-nums text-sm font-semibold">{fmtMZN.format(n(f.total))}</span>
                    <StatusBadge status={f.statusFatura} />
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/faturacao/${f.id}`}>Ver</Link>
                    </Button>
                  </div>
                </div>
              ))}
              {recentes.length === 0 && (
                <p className="text-center text-muted-foreground py-8">Sem faturas emitidas</p>
              )}
            </div>
            <Button asChild variant="outline" className="w-full mt-4">
              <Link href="/faturacao">Ver todas as faturas</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  } catch {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        Erro ao carregar dados do dashboard.
      </div>
    );
  }
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
      <div className="h-64 rounded-lg bg-muted animate-pulse" />
    </div>
  );
}

export default async function FaturacaoDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Dashboard de Faturação"
        description="Visão geral das faturas e receitas"
        breadcrumbs={[
          { label: 'Faturação', href: '/faturacao' },
          { label: 'Dashboard' },
        ]}
        actions={
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/faturacao/cotacoes">
                <FileText className="h-4 w-4 mr-2" />
                Cotações
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/faturacao/nova">
                <Plus className="h-4 w-4 mr-2" />
                Nova Fatura
              </Link>
            </Button>
          </div>
        }
      />

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
