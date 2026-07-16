/**
 * Devoluções — Server Component.
 * Gestão de devoluções integrada no módulo de notas de crédito.
 */

import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, EmptyState } from '@/components/patterns';

export default function DevolucaoPage() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Devoluções"
        description="Gestão de devoluções e reembolsos"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Devoluções' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/vendas/notas-credito/nova">
              Nova Nota de Crédito
            </Link>
          </Button>
        }
      />

      <EmptyState
        icon={<RotateCcw className="h-8 w-8" />}
        title="Devoluções geridas via Notas de Crédito"
        description="As devoluções são processadas através de notas de crédito referenciadas à fatura original. Crie uma nota de crédito para registar uma devolução."
        action={
          <div className="flex gap-3 justify-center">
            <Button asChild variant="outline">
              <Link href="/vendas/notas-credito">Ver Notas de Crédito</Link>
            </Button>
            <Button asChild>
              <Link href="/vendas/notas-credito/nova">Nova Nota de Crédito</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
