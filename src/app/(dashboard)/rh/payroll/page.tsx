/**
 * Payroll — Server Component (NUNCA 'use client').
 * Lista processamentos de salário com DataTable + FilterBar.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, DollarSign, Users, CheckCircle, Clock } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
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

const FiltroUrlSchema = z.object({
  status: z.string().optional(),
  ano: z.coerce.number().int().positive().optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

async function PayrollKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const agora = new Date();
  const mesAtual = agora.getMonth() + 1;
  const anoAtual = agora.getFullYear();

  const [totalMesAtual, totalPago, pendentes] = await runWithTenantContext(ctx, () =>
    Promise.all([
      prisma.payroll.count({ where: { tenantId, mesReferencia: mesAtual, anoReferencia: anoAtual } }),
      prisma.payroll.count({ where: { tenantId, status: 'PAGO' } }),
      prisma.payroll.count({ where: { tenantId, status: 'PENDENTE' } }),
    ])
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KpiCard
        title="Processados Este Mês"
        value={String(totalMesAtual)}
        icon={<Users className="h-4 w-4" />}
      />
      <KpiCard
        title="Pagos"
        value={String(totalPago)}
        icon={<CheckCircle className="h-4 w-4" />}
      />
      <KpiCard
        title="Pendentes"
        value={String(pendentes)}
        icon={<Clock className="h-4 w-4" />}
      />
    </div>
  );
}

async function PayrollTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: Filtro;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };

  const rows = await runWithTenantContext(ctx, () =>
    prisma.payroll.findMany({
      where: {
        tenantId,
        ...(filtros.status ? { status: filtros.status as never } : {}),
        ...(filtros.ano ? { anoReferencia: filtros.ano } : {}),
        ...(filtros.mes ? { mesReferencia: filtros.mes } : {}),
      },
      select: {
        id: true,
        mesReferencia: true,
        anoReferencia: true,
        salarioBruto: true,
        salarioLiquido: true,
        status: true,
        colaborador: { select: { nome: true } },
      },
      orderBy: [{ anoReferencia: 'desc' }, { mesReferencia: 'desc' }],
      take: filtros.take,
      ...(filtros.cursor ? { cursor: { id: filtros.cursor }, skip: 1 } : {}),
    })
  );

  const data: PayrollRow[] = rows.map((p) => ({
    id: p.id,
    colaboradorNome: p.colaborador.nome,
    mesReferencia: p.mesReferencia,
    anoReferencia: p.anoReferencia,
    salarioBruto: Number(p.salarioBruto).toLocaleString('pt-PT', { minimumFractionDigits: 2 }),
    salarioLiquido: Number(p.salarioLiquido).toLocaleString('pt-PT', { minimumFractionDigits: 2 }),
    status: p.status,
  }));

  const nextCursor = data.length === filtros.take ? data[data.length - 1]?.id : undefined;

  return <PayrollTable data={data} nextCursor={nextCursor} />;
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

  const parseResult = FiltroUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Processamento de Salários"
        description="Gerir processamento de salários dos colaboradores"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Salários' },
        ]}
        actions={
          <Button size="sm" asChild>
            <Link href="/rh/payroll/novo">
              <Plus className="h-4 w-4 mr-1.5" />
              Processar Salário
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-pulse">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-muted rounded-lg" />)}</div>}>
        <PayrollKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={5} />}
      >
        <PayrollTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
