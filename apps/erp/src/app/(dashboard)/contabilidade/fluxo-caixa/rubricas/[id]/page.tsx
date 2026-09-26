/**
 * `/contabilidade/fluxo-caixa/rubricas/[id]` não tem conteúdo próprio: uma
 * rubrica não tem página de detalhe, só a de edição. Existe para o fio de
 * Ariadne do topo, que liga cada segmento do caminho — sem página, a ligação
 * dava 404 e o prefetch dela ficava pendente (a edição nunca chegava a
 * `networkidle`; achado 2 do nó `e2e-v`). Mesmo padrão de `fluxo-caixa/page.tsx`.
 *
 * A autorização e o 404 de uma rubrica alheia ficam com a página de edição.
 */
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RubricaPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/contabilidade/fluxo-caixa/rubricas/${encodeURIComponent(id)}/editar`);
}
