/**
 * Dashboard de RH — Server Component (NUNCA 'use client').
 * KPIs reais via prisma + Suspense.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Users,
  UserCheck,
  UserX,
  Calendar,
  Award,
  Clock,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { PageHeader, KpiCard } from '@/components/patterns';
import { Button } from '@/components/ui/button';

async function RhKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const hoje = new Date();
  const inicioPeriodo = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const [
    totalColaboradores,
    activos,
    inactivos,
    feriasPendentes,
    avaliacoesPendentes,
    ausenciasHoje,
  ] = await runWithTenantContext(ctx, () =>
    Promise.all([
      prisma.colaborador.count({ where: { tenantId } }),
      prisma.colaborador.count({ where: { tenantId, status: 'ACTIVO' } }),
      prisma.colaborador.count({ where: { tenantId, status: { not: 'ACTIVO' } } }),
      prisma.solicitacaoFerias.count({
        where: { tenantId, status: 'PENDENTE' },
      }),
      prisma.avaliacao.count({
        where: { tenantId, status: 'PENDENTE' },
      }),
      prisma.ausencia.count({
        where: {
          tenantId,
          dataInicio: { lte: hoje },
          dataFim: { gte: hoje },
        },
      }),
    ])
  );

  const kpis = [
    { title: 'Total Colaboradores', value: String(totalColaboradores), icon: <Users className="h-4 w-4" /> },
    { title: 'Activos', value: String(activos), icon: <UserCheck className="h-4 w-4" /> },
    { title: 'Inactivos', value: String(inactivos), icon: <UserX className="h-4 w-4" /> },
    { title: 'Férias Pendentes', value: String(feriasPendentes), icon: <Calendar className="h-4 w-4" /> },
    { title: 'Avaliações Pendentes', value: String(avaliacoesPendentes), icon: <Award className="h-4 w-4" /> },
    { title: 'Ausências Hoje', value: String(ausenciasHoje), icon: <Clock className="h-4 w-4" /> },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {kpis.map((k) => (
        <KpiCard key={k.title} title={k.title} value={k.value} icon={k.icon} />
      ))}
    </div>
  );
}

async function ColaboradoresRecentes({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const colaboradores = await runWithTenantContext(ctx, () =>
    prisma.colaborador.findMany({
      where: { tenantId, status: 'ACTIVO' },
      select: {
        id: true,
        nome: true,
        codigo: true,
        cargo: { select: { nome: true } },
        departamento: { select: { nome: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })
  );

  if (colaboradores.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Colaboradores Recentes
      </h3>
      <div className="divide-y border rounded-lg">
        {colaboradores.map((c) => (
          <div key={c.id} className="flex items-center justify-between p-3">
            <div>
              <p className="text-sm font-medium">{c.nome}</p>
              <p className="text-xs text-muted-foreground">
                {c.cargo?.nome ?? '—'} · {c.departamento?.nome ?? '—'}
              </p>
            </div>
            <span className="text-xs text-muted-foreground font-mono">{c.codigo}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function DashboardRHPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Recursos Humanos"
        description="Visão geral da gestão de pessoas"
        actions={
          <Button size="sm" asChild>
            <Link href="/rh/colaboradores/novo">Novo Colaborador</Link>
          </Button>
        }
      />

      <Suspense
        fallback={
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 animate-pulse">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 bg-muted rounded-lg" />
            ))}
          </div>
        }
      >
        <RhKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Suspense fallback={<div className="h-60 bg-muted rounded-lg animate-pulse" />}>
          <ColaboradoresRecentes tenantId={tenantId} userId={userId} />
        </Suspense>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Acesso Rápido
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Colaboradores', href: '/rh/colaboradores' },
              { label: 'Assiduidade', href: '/rh/assiduidade' },
              { label: 'Férias', href: '/rh/ferias' },
              { label: 'Avaliações', href: '/rh/avaliacoes' },
              { label: 'Salários', href: '/rh/payroll' },
              { label: 'Formações', href: '/rh/formacoes' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 p-3 border rounded-lg text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
