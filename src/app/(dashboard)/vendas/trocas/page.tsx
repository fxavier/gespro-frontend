/**
 * Trocas — Server Component.
 * Funcionalidade em desenvolvimento.
 */

import Link from 'next/link';
import { ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, EmptyState } from '@/components/patterns';

export default function TrocasPage() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Trocas"
        description="Gestão de trocas de produtos"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Trocas' },
        ]}
      />

      <EmptyState
        icon={<ArrowRightLeft className="h-8 w-8" />}
        title="Módulo de trocas em breve"
        description="O módulo de gestão de trocas está em desenvolvimento. Por ora, utilize notas de crédito para devoluções e emita uma nova venda para a troca."
        action={
          <div className="flex gap-3 justify-center">
            <Button asChild variant="outline">
              <Link href="/vendas/notas-credito">Notas de Crédito</Link>
            </Button>
            <Button asChild>
              <Link href="/pos">POS — Nova Venda</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
