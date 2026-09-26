/** Nova série de documento — Server Component; formulário em componente-folha (#149, ticket 7). */
import { PageHeader } from '@/components/patterns';
import { anosPermitidos } from '@/lib/series-documento';
import { acessoSeries, SemPermissao } from '../_components/acesso';
import { SerieForm } from '../_components/serie-form';

export default async function NovaSeriePage() {
  const acesso = await acessoSeries();
  const cabecalho = (
    <PageHeader
      title="Nova série"
      description="Numeração {prefixo}/{ano}/{número com 6 algarismos}"
      breadcrumbs={[
        { label: 'Faturação', href: '/faturacao' },
        { label: 'Séries', href: '/faturacao/series' },
        { label: 'Nova' },
      ]}
    />
  );
  if (!acesso.podeEscrever) {
    return (
      <div className="p-6 space-y-6">
        {cabecalho}
        <SemPermissao mensagem="Não tem permissão para configurar as séries de documento." />
      </div>
    );
  }
  return (
    <div className="p-6 space-y-6">
      {cabecalho}
      <SerieForm modo="criar" anos={anosPermitidos(new Date())} />
    </div>
  );
}
