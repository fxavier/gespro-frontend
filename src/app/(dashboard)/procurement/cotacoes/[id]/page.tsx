import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProcurementCotacaoDetalhePage({ params }: Props) {
  const { id } = await params;
  redirect(`/compras/cotacoes/${id}`);
}
