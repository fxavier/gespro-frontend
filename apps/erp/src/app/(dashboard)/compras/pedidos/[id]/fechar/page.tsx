/**
 * Fechar Pedido de Compra em falta (#567) — Server Component (NUNCA 'use client').
 *
 * O fornecedor entregou parte e não vai entregar o resto: RECEBIDO_PARCIAL → FECHADO_EM_FALTA.
 * Rota própria porque recolhe o motivo (campo de texto é formulário, não AlertDialog). Só um
 * pedido RECEBIDO_PARCIAL se fecha, com a permissão `compras:pedido:cancelar`; o resto volta ao
 * detalhe. O fecho não lança nada: cada recepção já reconheceu a sua dívida.
 */

import { notFound, redirect } from 'next/navigation';
import { exigirSessaoDeTenant } from '@/server/auth/sessao-tenant';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { FecharPedidoForm } from './_components/fechar-pedido-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FecharPedidoCompraPage({ params }: Props) {
  const { id } = await params;

  const { session } = await exigirSessaoDeTenant();

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
  if (pedido.status !== 'RECEBIDO_PARCIAL' || !permissions.includes('compras:pedido:cancelar')) {
    redirect(detalhe);
  }

  const emFalta = pedido.itens
    .map((i) => ({ descricao: i.descricao, falta: i.quantidade - i.quantidadeRecebida, unidade: i.unidadeMedida }))
    .filter((i) => i.falta > 0);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Fechar pedido ${pedido.numero} em falta`}
        description={`Pedido de compra a ${pedido.fornecedorNome}`}
        breadcrumbs={[
          { label: 'Compras', href: '/compras' },
          { label: 'Pedidos', href: '/compras/pedidos' },
          { label: pedido.numero, href: detalhe },
          { label: 'Fechar em falta' },
        ]}
        badge={<StatusBadge status={pedido.status} />}
      />

      <FecharPedidoForm id={id} emFalta={emFalta} />
    </div>
  );
}
