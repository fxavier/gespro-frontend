import { redirect } from 'next/navigation';

/**
 * Redirect /projetos/[id] → /projetos/lista/[id]
 * Mantém compatibilidade com links que usem a rota curta.
 */
export default async function ProjetoRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/projetos/lista/${id}`);
}
