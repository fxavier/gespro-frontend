/**
 * Registar recepção de mercadoria (#111) — Server Component (NUNCA 'use client').
 *
 * Rota própria porque recolhe dados (quantidades por item e localização): é formulário, logo é
 * rota, não modal. Só um pedido EM_TRANSITO ou RECEBIDO_PARCIAL se recebe, com a permissão
 * `compras:recebimento:registar`; os outros voltam ao detalhe. Grava pela
 * `registarRecebimentoAction` (entrada de stock + conta a pagar no RECEBIDO_TOTAL).
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { listarLocalizacoes } from '@/server/services/inventario/stock.service';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { diaIsoMaputo } from '@/lib/format-date';
import { RegistarRecepcaoForm } from './_components/registar-recepcao-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReceberPedidoCompraPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId, permissions } = session.user;
  const ctx = { tenantId, userId };

  let pedido;
  try {
    pedido = await runWithTenantContext(ctx, () => comprasService.obterPedido(id, ctx));
  } catch {
    notFound();
  }
  if (!pedido) notFound();

  const detalhe = `/compras/pedidos/${id}`;
  if (
    !['EM_TRANSITO', 'RECEBIDO_PARCIAL'].includes(pedido.status) ||
    !permissions.includes('compras:recebimento:registar')
  ) {
    redirect(detalhe);
  }

  // Todas as localizações activas, página a página: o número é limitado pelo plano (armazéns),
  // e nenhuma fica inalcançável por estar fora da primeira página.
  const localizacoes: { value: string; label: string }[] = [];
  await runWithTenantContext(ctx, async () => {
    let cursor: string | undefined;
    do {
      const pagina = await listarLocalizacoes({ ativa: true, take: 100, cursor }, ctx);
      localizacoes.push(...pagina.items.map((l) => ({ value: l.id, label: `${l.nome} (${l.codigo})` })));
      cursor = pagina.nextCursor ?? undefined;
    } while (cursor);
  });

  const itens = pedido.itens
    .map((i) => ({
      id: i.id,
      descricao: i.descricao,
      unidadeMedida: i.unidadeMedida,
      comProduto: Boolean(i.produtoId),
      pedida: i.quantidade,
      recebida: i.quantidadeRecebida,
      emFalta: Math.max(0, i.quantidade - i.quantidadeRecebida),
    }))
    .filter((i) => i.emFalta > 0.0001);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Registar recepção — ${pedido.numero}`}
        description={`Mercadoria do pedido de compra a ${pedido.fornecedorNome}`}
        breadcrumbs={[
          { label: 'Compras', href: '/compras' },
          { label: 'Pedidos', href: '/compras/pedidos' },
          { label: pedido.numero, href: detalhe },
          { label: 'Registar recepção' },
        ]}
        badge={<StatusBadge status={pedido.status} />}
      />

      <RegistarRecepcaoForm
        pedidoCompraId={pedido.id}
        hoje={diaIsoMaputo()}
        itens={itens}
        localizacoes={localizacoes}
      />
    </div>
  );
}
