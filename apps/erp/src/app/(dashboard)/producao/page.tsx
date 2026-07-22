/**
 * Dashboard de Produção — Server Component (NUNCA 'use client').
 * KPIs reais + ligações para sub-módulos. Sem cores hardcoded.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ClipboardList,
  Component,
  Route,
  Calculator,
  Gauge,
  Users,
  DollarSign,
  ShieldCheck,
  FileBarChart2,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';

const MODULOS = [
  {
    titulo: 'Estrutura de Produto (BOM)',
    descricao: 'Gestão de listas de materiais e estruturas hierárquicas',
    icon: Component,
    href: '/producao/estrutura',
  },
  {
    titulo: 'Roteiros de Produção',
    descricao: 'Definição de processos e operações produtivas',
    icon: Route,
    href: '/producao/roteiros',
  },
  {
    titulo: 'Ordens de Produção',
    descricao: 'Controlo e gestão das ordens de fabrico',
    icon: ClipboardList,
    href: '/producao/ordens',
  },
  {
    titulo: 'Planeamento (MRP)',
    descricao: 'Planeamento de necessidades de materiais',
    icon: Calculator,
    href: '/producao/planeamento',
  },
  {
    titulo: 'Capacidade (CRP)',
    descricao: 'Gestão da capacidade produtiva',
    icon: Gauge,
    href: '/producao/capacidade',
  },
  {
    titulo: 'Mão de Obra',
    descricao: 'Gestão de operadores e eficiência',
    icon: Users,
    href: '/producao/mao-obra',
  },
  {
    titulo: 'Custos de Produção',
    descricao: 'Cálculo e análise de custos',
    icon: DollarSign,
    href: '/producao/custos',
  },
  {
    titulo: 'Qualidade',
    descricao: 'Controlo de qualidade e rastreabilidade',
    icon: ShieldCheck,
    href: '/producao/qualidade',
  },
  {
    titulo: 'Relatórios',
    descricao: 'Dashboards e relatórios de produção',
    icon: FileBarChart2,
    href: '/producao/relatorios',
  },
] as const;

export default async function ProducaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Produção"
        description="Sistema completo de gestão da produção industrial"
        breadcrumbs={[{ label: 'Produção' }]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODULOS.map((modulo) => {
          const Icon = modulo.icon;
          return (
            <Button
              key={modulo.href}
              variant="outline"
              className="h-auto p-4 justify-start gap-4"
              asChild
            >
              <Link href={modulo.href}>
                <Icon className="h-8 w-8 flex-shrink-0 text-muted-foreground" />
                <div className="text-left">
                  <p className="font-semibold text-sm">{modulo.titulo}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {modulo.descricao}
                  </p>
                </div>
              </Link>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
