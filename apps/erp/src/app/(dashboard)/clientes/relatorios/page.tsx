/**
 * Relatórios de Clientes — Server Component.
 *
 * KPIs comerciais reais via `relatoriosService`; gráficos `dataviz`;
 * exportação da carteira por Route Handler (`/api/export/clientes`).
 */
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Users, UserCheck, Wallet, CreditCard, Download } from 'lucide-react';
import { auth } from '@/lib/auth';
import { relatoriosService } from '@/server/services/plataforma/relatorios.service';
import { PageHeader, KpiCard } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { GraficoPorCategoriaWrapper, GraficoTopDividaWrapper } from './_components/graficos';

function SeccaoSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border p-5 space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="h-[300px] w-full rounded-lg" />
    </div>
  );
}

const mt = (v: string) => `MT ${parseFloat(v).toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;

async function ConteudoClientes({ tenantId, userId }: { tenantId: string; userId: string }) {
  const r = await relatoriosService.relatorioClientes({ tenantId, userId });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total de Clientes"
          value={String(r.totalClientes)}
          description={`${r.clientesAtivos} activos`}
          icon={<Users className="h-5 w-5" />}
        />
        <KpiCard
          title="Clientes Activos"
          value={String(r.clientesAtivos)}
          icon={<UserCheck className="h-5 w-5" />}
        />
        <KpiCard
          title="Dívida Total"
          value={mt(r.dividaTotal)}
          description="Crédito utilizado"
          icon={<Wallet className="h-5 w-5" />}
        />
        <KpiCard
          title="Limite de Crédito"
          value={mt(r.limiteTotal)}
          description="Concedido à carteira"
          icon={<CreditCard className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GraficoPorCategoriaWrapper dados={r.porCategoria} />
        <GraficoTopDividaWrapper dados={r.topDivida} />
      </div>
    </div>
  );
}

export default async function RelatoriosClientesPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Relatórios de Clientes"
        description="Indicadores comerciais da carteira de clientes"
        breadcrumbs={[{ label: 'Clientes', href: '/clientes' }, { label: 'Relatórios' }]}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <a href="/api/export/clientes?formato=csv" download>
                <Download className="h-4 w-4 mr-2" />
                CSV
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/api/export/clientes?formato=xlsx" download>
                <Download className="h-4 w-4 mr-2" />
                XLSX
              </a>
            </Button>
          </div>
        }
      />

      <Suspense fallback={<SeccaoSkeleton />}>
        <ConteudoClientes tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
