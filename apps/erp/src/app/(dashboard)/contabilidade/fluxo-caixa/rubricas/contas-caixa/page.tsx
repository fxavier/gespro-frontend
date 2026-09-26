/** Contas de caixa e equivalentes (ADR-0037 E2) — Server Component (ticket 7.3). */
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { listarContas } from '@/server/services/financas/contabilidade.service';
import { painelConfiguracao } from '@/server/services/financas/dfc.service';
import { PageHeader } from '@/components/patterns';
import { acessoDFC, lerVoltar, SemPermissao } from '../_components/acesso';
import { BREADCRUMBS_BASE } from '../_components/rotulos';
import { ContasCaixaForm } from '../_components/contas-caixa-form';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ContasCaixaPage({ searchParams }: PageProps) {
  const acesso = await acessoDFC();
  const cabecalho = (
    <PageHeader
      title="Contas de caixa"
      description="As contas cuja variação é o Δcaixa da DFC"
      breadcrumbs={[...BREADCRUMBS_BASE, { label: 'Contas de caixa' }]}
    />
  );
  if (!acesso.podeConfigurar) {
    return (
      <div className="p-6 space-y-6">
        {cabecalho}
        <SemPermissao mensagem="Não tem permissão para configurar as contas de caixa da DFC." />
      </div>
    );
  }
  const { ctx } = acesso;
  const voltar = lerVoltar((await searchParams).voltar);
  const [painel, contas] = await runWithTenantContext(ctx, () =>
    Promise.all([
      painelConfiguracao(ctx),
      listarContas({ classe: 'CLASSE_1', aceitaLancamento: true, ativo: true, take: 50 }, ctx),
    ]),
  );
  const actuais = painel.rubricas
    .filter((r) => r.rubrica.atividade === 'CAIXA')
    .flatMap((r) => r.contas)
    .map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nome}` }));

  return (
    <div className="p-6 space-y-6">
      {cabecalho}
      <ContasCaixaForm
        voltar={voltar}
        actuais={actuais}
        contasIniciais={contas.items.map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nome}` }))}
      />
    </div>
  );
}
