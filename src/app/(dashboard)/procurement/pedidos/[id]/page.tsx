import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProcurementPedidoDetalhePage({ params }: Props) {
  const { id } = await params;
  redirect(`/compras/pedidos/${id}`);
}
