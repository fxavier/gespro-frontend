/** Nova rubrica da DFC — Server Component; formulário em componente-folha (ticket 7.3). */
import { PageHeader } from '@/components/patterns';
import { acessoDFC, lerVoltar, SemPermissao } from '../_components/acesso';
import { BREADCRUMBS_BASE } from '../_components/rotulos';
import { RubricaForm } from '../_components/rubrica-form';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NovaRubricaPage({ searchParams }: PageProps) {
  const acesso = await acessoDFC();
  const cabecalho = (
    <PageHeader
      title="Nova rubrica"
      description="Rubrica criada pelo tenant — pode ser eliminada enquanto não tiver contas"
      breadcrumbs={[...BREADCRUMBS_BASE, { label: 'Nova' }]}
    />
  );
  if (!acesso.podeConfigurar) {
    return (
      <div className="p-6 space-y-6">
        {cabecalho}
        <SemPermissao mensagem="Não tem permissão para configurar as rubricas da DFC." />
      </div>
    );
  }
  const voltar = lerVoltar((await searchParams).voltar);
  return (
    <div className="p-6 space-y-6">
      {cabecalho}
      <RubricaForm voltar={voltar} />
    </div>
  );
}
