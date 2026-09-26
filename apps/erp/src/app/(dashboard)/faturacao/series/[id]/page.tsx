/**
 * `/faturacao/series/[id]` não tem conteúdo próprio: uma série não tem página
 * de detalhe, só a de edição. Existe para o fio de Ariadne do topo, que liga
 * cada segmento do caminho — sem página, a ligação dava 404 e o prefetch dela
 * ficava pendente (mesmo padrão de `rubricas/[id]/page.tsx`).
 *
 * A autorização e o 404 de uma série alheia ficam com a página de edição.
 */
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SeriePage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/faturacao/series/${encodeURIComponent(id)}/editar`);
}
