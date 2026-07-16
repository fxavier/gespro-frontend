/**
 * Relatórios de Produção — Server Component (NUNCA 'use client').
 * Funcionalidade analítica em desenvolvimento.
 */

import { BarChart3 } from 'lucide-react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader, EmptyState } from '@/components/patterns';

export default async function RelatoriosProducaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Relatórios de Produção"
        description="Análises de eficiência, custos e desempenho da produção"
        breadcrumbs={[
          { label: 'Produção', href: '/producao' },
          { label: 'Relatórios' },
        ]}
      />
      <EmptyState
        icon={<BarChart3 className="h-8 w-8" />}
        title="Relatórios em breve"
        description="Os relatórios analíticos de produção — eficiência, custos por ordem, rendimento por centro de trabalho — estarão disponíveis brevemente."
      />
    </div>
  );
}
