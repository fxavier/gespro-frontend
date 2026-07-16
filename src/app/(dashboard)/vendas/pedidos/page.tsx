/**
 * Pedidos de Venda — Server Component.
 * Funcionalidade em desenvolvimento (WS-C Wave 4).
 */

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, EmptyState } from '@/components/patterns';

export default function PedidosVendaPage() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Pedidos de Venda"
        description="Gestão de pedidos e encomendas de clientes"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Pedidos' },
        ]}
      />

      <EmptyState
        icon={<ShoppingBag className="h-8 w-8" />}
        title="Módulo de pedidos em desenvolvimento"
        description="A gestão de pedidos de venda está em desenvolvimento. Por ora, utilize o POS para vendas imediatas ou emita uma proforma para encomendas."
        action={
          <div className="flex gap-3 justify-center">
            <Button asChild variant="outline">
              <Link href="/vendas/faturas">Ver Faturas</Link>
            </Button>
            <Button asChild>
              <Link href="/pos">POS</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
