/**
 * Relatórios de Inventário — Server Component (NUNCA 'use client').
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Package,
  Wrench,
  TrendingDown,
  BarChart3,
  ArrowRight,
  FileText,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const RELATORIOS = [
  {
    titulo: 'Inventário de Ativos',
    descricao: 'Lista completa de ativos com valores e estado actual',
    href: '/inventario/ativos',
    icon: Package,
  },
  {
    titulo: 'Manutenções',
    descricao: 'Histórico e previsões de manutenção por ativo',
    href: '/inventario/manutencao',
    icon: Wrench,
  },
  {
    titulo: 'Amortizações',
    descricao: 'Valores líquidos contabilísticos e planos de amortização',
    href: '/inventario/amortizacao',
    icon: TrendingDown,
  },
  {
    titulo: 'Ativos Abatidos',
    descricao: 'Registo histórico de ativos baixados e abatidos',
    href: '/inventario/abate',
    icon: FileText,
  },
  {
    titulo: 'Inventários Físicos',
    descricao: 'Resultados das contagens e reconciliações realizadas',
    href: '/inventario/reconciliacao',
    icon: BarChart3,
  },
];

export default async function RelatoriosPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Relatórios de Inventário"
        description="Aceda aos relatórios e exportações do módulo de inventário"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Relatórios' },
        ]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {RELATORIOS.map(({ titulo, descricao, href, icon: Icon }) => (
          <Card key={href} className="group hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-base">{titulo}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{descricao}</p>
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link href={href}>
                  Ver Relatório
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
