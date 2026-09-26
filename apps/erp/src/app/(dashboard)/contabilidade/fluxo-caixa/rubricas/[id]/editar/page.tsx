/** Editar uma rubrica da DFC — Server Component (ticket 7.3). Alheia ou apagada ⇒ 404. */
import { notFound } from 'next/navigation';
import { NotFoundError } from '@/lib/errors';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { obterRubrica } from '@/server/services/financas/dfc.service';
import { PageHeader } from '@/components/patterns';
import { acessoDFC, lerVoltar, SemPermissao } from '../../_components/acesso';
import { BREADCRUMBS_BASE } from '../../_components/rotulos';
import { RubricaForm } from '../../_components/rubrica-form';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EditarRubricaPage({ params, searchParams }: PageProps) {
  const acesso = await acessoDFC();
  if (!acesso.podeConfigurar) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title="Editar rubrica" breadcrumbs={[...BREADCRUMBS_BASE, { label: 'Editar' }]} />
        <SemPermissao mensagem="Não tem permissão para configurar as rubricas da DFC." />
      </div>
    );
  }
  const { id } = await params;
  const { ctx } = acesso;
  let rubrica;
  try {
    rubrica = await runWithTenantContext(ctx, () => obterRubrica(id, ctx));
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const voltar = lerVoltar((await searchParams).voltar);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Editar ${rubrica.codigo}`}
        description={rubrica.designacao}
        breadcrumbs={[...BREADCRUMBS_BASE, { label: rubrica.codigo }]}
      />
      <RubricaForm
        voltar={voltar}
        rubrica={{
          id: rubrica.id,
          codigo: rubrica.codigo,
          designacao: rubrica.designacao,
          atividade: rubrica.atividade,
          sinal: rubrica.sinal,
          ordem: rubrica.ordem,
          ativo: rubrica.ativo,
          origem: rubrica.origem,
        }}
      />
    </div>
  );
}
