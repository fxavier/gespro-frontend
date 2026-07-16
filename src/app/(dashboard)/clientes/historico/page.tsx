/**
 * Histórico de Transacções de Clientes — Server Component.
 * O histórico de compras por cliente está disponível em /clientes/[id] (tab vendas)
 * e em /vendas com filtro por clienteId.
 */

import Link from 'next/link';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, EmptyState } from '@/components/patterns';

export default function HistoricoClientesPage() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Histórico de Transacções"
        description="Histórico de compras e pagamentos por cliente"
        breadcrumbs={[
          { label: 'Clientes', href: '/clientes' },
          { label: 'Histórico' },
        ]}
      />

      <EmptyState
        icon={<History className="h-8 w-8" />}
        title="Histórico por cliente disponível no detalhe"
        description="Consulte o histórico de transacções de um cliente específico no seu perfil, ou filtre as vendas por cliente na listagem de vendas."
        action={
          <div className="flex gap-3 justify-center">
            <Button asChild variant="outline">
              <Link href="/clientes">Ver Clientes</Link>
            </Button>
            <Button asChild>
              <Link href="/vendas">Ver Vendas</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
