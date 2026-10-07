/** Nova regra de sugestão — Server Component; formulário em componente-folha (issue #140). */
import { PageHeader } from '@/components/patterns';
import { acessoRegras } from '../_components/acesso';
import { SemPermissao } from '@/components/patterns/sem-permissao';
import { opcoesFormularioRegra } from '../_components/opcoes';
import { RegraForm } from '../_components/regra-form';

export default async function NovaRegraSugestaoPage() {
  const acesso = await acessoRegras();
  const cabecalho = (
    <PageHeader
      title="Nova regra de sugestão"
      description="Quando a descrição do extracto contiver uma das palavras, a reconciliação sugere esta contrapartida"
      breadcrumbs={[
        { label: 'Contabilidade', href: '/contabilidade' },
        { label: 'Reconciliação Bancária', href: '/contabilidade/reconciliacao' },
        { label: 'Regras de sugestão', href: '/contabilidade/reconciliacao/regras' },
        { label: 'Nova' },
      ]}
    />
  );
  if (!acesso.podeEscrever) {
    return (
      <div className="p-6 space-y-6">
        {cabecalho}
        <SemPermissao testId="regras-sem-permissao" mensagem="Não tem permissão para configurar as regras de sugestão." />
      </div>
    );
  }
  const opcoes = await opcoesFormularioRegra(acesso.ctx);
  return (
    <div className="p-6 space-y-6">
      {cabecalho}
      <RegraForm {...opcoes} />
    </div>
  );
}
