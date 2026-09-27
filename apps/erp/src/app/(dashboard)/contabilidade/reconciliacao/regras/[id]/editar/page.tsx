/**
 * Editar uma regra de sugestão — Server Component (issue #140). Regra alheia ou
 * inexistente ⇒ 404 (nunca 403).
 */
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/patterns';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { obterRegraSugestao } from '@/server/services/reconciliacao/regras-sugestao.service';
import { acessoRegras, SemPermissao } from '../../_components/acesso';
import { opcoesFormularioRegra } from '../../_components/opcoes';
import { RegraForm } from '../../_components/regra-form';

interface PageProps {
  params: Promise<{ id: string }>;
}

const BREADCRUMBS = [
  { label: 'Contabilidade', href: '/contabilidade' },
  { label: 'Reconciliação Bancária', href: '/contabilidade/reconciliacao' },
  { label: 'Regras de sugestão', href: '/contabilidade/reconciliacao/regras' },
  { label: 'Editar' },
];

export default async function EditarRegraSugestaoPage({ params }: PageProps) {
  const acesso = await acessoRegras();
  if (!acesso.podeEscrever) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title="Editar regra de sugestão" breadcrumbs={BREADCRUMBS} />
        <SemPermissao mensagem="Não tem permissão para configurar as regras de sugestão." />
      </div>
    );
  }
  const { id } = await params;
  const regra = await runWithTenantContext(acesso.ctx, () => obterRegraSugestao(id, acesso.ctx));
  if (!regra) notFound();

  const opcoes = await opcoesFormularioRegra(acesso.ctx, {
    contaContrapartidaId: regra.contaContrapartidaId,
    contaBancariaId: regra.contaBancariaId,
  });

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Editar regra de sugestão"
        description={regra.descricao ?? regra.padrao}
        breadcrumbs={BREADCRUMBS}
      />
      <RegraForm
        {...opcoes}
        regraId={regra.id}
        valoresIniciais={{
          contaBancariaId: regra.contaBancariaId,
          padrao: regra.padrao,
          natureza: regra.natureza,
          contaContrapartidaId: regra.contaContrapartidaId,
          descricao: regra.descricao ?? '',
          prioridade: regra.prioridade,
        }}
      />
    </div>
  );
}
