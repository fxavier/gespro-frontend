/**
 * Detalhe de Pedido de Venda — Server Component.
 * Redireciona para a listagem enquanto o módulo está em desenvolvimento.
 */

import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default async function PedidoDetalhePage({ params }: PageProps) {
  redirect('/vendas/pedidos');
}
