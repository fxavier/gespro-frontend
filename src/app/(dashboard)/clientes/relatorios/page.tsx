/**
 * Relatórios de Clientes — Server Component.
 * Módulo de relatórios analíticos em desenvolvimento.
 */

import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, EmptyState } from '@/components/patterns';

export default function RelatoriosClientesPage() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Relatórios de Clientes"
        description="Análises e relatórios sobre a carteira de clientes"
        breadcrumbs={[
          { label: 'Clientes', href: '/clientes' },
          { label: 'Relatórios' },
        ]}
      />

      <EmptyState
        icon={<BarChart3 className="h-8 w-8" />}
        title="Relatórios em breve"
        description="O módulo de relatórios analíticos está em desenvolvimento. Por ora, consulte a listagem de clientes com os filtros disponíveis."
        action={
          <Button asChild>
            <Link href="/clientes">Ver Listagem de Clientes</Link>
          </Button>
        }
      />
    </div>
  );
}
