/**
 * Novo Pedido de Compra — Server Component shell.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovoPedidoForm } from './_components/novo-pedido-form';

export default async function NovoPedidoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Pedido de Compra"
        description="Emissão de pedido de compra a fornecedor"
        breadcrumbs={[
          { label: 'Compras', href: '/compras' },
          { label: 'Pedidos', href: '/compras/pedidos' },
          { label: 'Novo Pedido' },
        ]}
      />
      <NovoPedidoForm />
    </div>
  );
}
