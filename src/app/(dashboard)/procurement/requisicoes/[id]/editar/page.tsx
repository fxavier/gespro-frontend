import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProcurementEditarRequisicaoPage({ params }: Props) {
  const { id } = await params;
  redirect(`/compras/requisicoes/${id}/editar`);
}
