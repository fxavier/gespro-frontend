/**
 * Cancelar Pedido de Compra (#110) — Server Component (NUNCA 'use client').
 *
 * Rota própria porque recolhe dados (o motivo): um campo de texto é formulário, logo é rota,
 * não AlertDialog. Só RASCUNHO, ENVIADO e CONFIRMADO se cancelam, com a permissão
 * `compras:pedido:cancelar`; os outros voltam ao detalhe.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { CancelarPedidoForm } from './_components/cancelar-pedido-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CancelarPedidoCompraPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId, permissions } = session.user;

  let pedido;
  try {
    pedido = await runWithTenantContext({ tenantId, userId }, () =>
      comprasService.obterPedido(id, { tenantId, userId })
    );
  } catch {
    notFound();
  }
  if (!pedido) notFound();

  const detalhe = `/compras/pedidos/${id}`;
  if (
    !['RASCUNHO', 'ENVIADO', 'CONFIRMADO'].includes(pedido.status) ||
    !permissions.includes('compras:pedido:cancelar')
  ) {
    redirect(detalhe);
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Cancelar pedido ${pedido.numero}`}
        description={`Pedido de compra a ${pedido.fornecedorNome}`}
        breadcrumbs={[
          { label: 'Compras', href: '/compras' },
          { label: 'Pedidos', href: '/compras/pedidos' },
          { label: pedido.numero, href: detalhe },
          { label: 'Cancelar' },
        ]}
        badge={<StatusBadge status={pedido.status} />}
      />

      <CancelarPedidoForm id={id} />
    </div>
  );
}
