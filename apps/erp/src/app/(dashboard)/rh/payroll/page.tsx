/**
 * Payroll — Server Component (NUNCA 'use client').
 * Folhas mensais (lotes com ciclo de vida) + payrolls individuais, lidos
 * através do PayrollService (Spec 06) — sem prisma cru na página.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Users, CheckCircle, Clock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { PayrollService } from '@/server/services/pessoas-projetos/payroll.service';
import { FilterPayrollSchema, type FilterPayrollInput } from '@/lib/validations/payroll';
import { Button } from '@/components/ui/button';
import {
  PageHeader,
  FilterBar,
  TableSkeleton,
  KpiCard,
} from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { PayrollTable } from './_components/payroll-table';
import type { PayrollRow } from './_components/payroll-table';
import { FolhasSection, type FolhaRow } from './_components/folhas-section';

const FILTROS_DEFAULT: FilterPayrollInput = { take: 25 };

function fmt(v: { toString(): string }): string {
  return Number(v.toString()).toLocaleString('pt-PT', { minimumFractionDigits: 2 });
}

async function PayrollKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const agora = new Date();
  const mesAtual = agora.getMonth() + 1;
  const anoAtual = agora.getFullYear();

  const [doMes, pagos, pendentes] = await runWithTenantContext(ctx, () =>
    Promise.all([
      PayrollService.listarPayrolls({ mes: mesAtual, ano: anoAtual, take: 100 }, ctx),
      PayrollService.listarPayrolls({ status: 'PAGO', take: 100 }, ctx),
      PayrollService.listarPayrolls({ status: 'PENDENTE', take: 100 }, ctx),
    ])
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KpiCard
        title="Processados Este Mês"
        value={String(doMes.items.length)}
        icon={<Users className="h-4 w-4" />}
      />
      <KpiCard
        title="Pagos"
        value={String(pagos.items.length)}
        icon={<CheckCircle className="h-4 w-4" />}
      />
      <KpiCard
        title="Pendentes"
        value={String(pendentes.items.length)}
        icon={<Clock className="h-4 w-4" />}
      />
    </div>
  );
}

async function FolhasSectionServer({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const page = await runWithTenantContext(ctx, () =>
    PayrollService.listarFolhas({ take: 12 }, ctx)
  );

  const folhas: FolhaRow[] = page.items.map((f) => ({
    id: f.id,
    mesReferencia: f.mesReferencia,
    anoReferencia: f.anoReferencia,
    status: f.status,
    totalBruto: fmt(f.totalBruto),
    totalLiquido: fmt(f.totalLiquido),
    totalCustoEntidade: fmt(f.totalCustoEntidade),
    totalColaboradores: f._count.payrolls,
  }));

  return <FolhasSection folhas={folhas} />;
}

async function PayrollTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FilterPayrollInput;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const page = await runWithTenantContext(ctx, () =>
    PayrollService.listarPayrolls(filtros, ctx)
  );

  const data: PayrollRow[] = page.items.map((p) => ({
    id: p.id,
    colaboradorNome: p.colaborador.nome,
    mesReferencia: p.mesReferencia,
    anoReferencia: p.anoReferencia,
    salarioBruto: fmt(p.salarioBruto),
    salarioLiquido: fmt(p.salarioLiquido),
    status: p.status,
  }));

  return <PayrollTable data={data} nextCursor={page.nextCursor} />;
}

const FILTER_CONFIG: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    options: [
      { label: 'Pendente', value: 'PENDENTE' },
      { label: 'Processado', value: 'PROCESSADO' },
      { label: 'Pago', value: 'PAGO' },
      { label: 'Cancelado', value: 'CANCELADO' },
    ],
  },
];

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawParams)) {
    if (typeof v === 'string') flatParams[k] = v;
    else if (Array.isArray(v)) flatParams[k] = v[0] ?? '';
  }

  const parseResult = FilterPayrollSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Processamento de Salários"
        description="Folha salarial mensal — cálculo estatutário INSS/IRPS, contabilização e pagamento"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Salários' },
        ]}
        actions={
          <Button size="sm" asChild>
            <Link href="/rh/payroll/novo">
              <Plus className="h-4 w-4 mr-1.5" />
              Processar Folha do Mês
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-pulse">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-muted rounded-lg" />)}</div>}>
        <PayrollKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Folhas mensais</h2>
        <Suspense fallback={<div className="h-32 bg-muted rounded-lg animate-pulse" />}>
          <FolhasSectionServer tenantId={tenantId} userId={userId} />
        </Suspense>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Payrolls individuais</h2>
        <FilterBar filters={FILTER_CONFIG} />
        <Suspense
          key={JSON.stringify(filtros)}
          fallback={<TableSkeleton rows={8} cols={5} />}
        >
          <PayrollTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
        </Suspense>
      </section>
    </div>
  );
}
