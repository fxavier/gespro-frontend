/**
 * Mapear / reatribuir uma conta — Server Component (ticket 7.3).
 * `?contaId=` fixa a conta (reatribuir, ou o «Mapear» dos impedimentos da
 * DFC); `?voltar=` (só `/contabilidade/…`) é o destino depois de gravar.
 */
import { notFound } from 'next/navigation';
import { NotFoundError } from '@/lib/errors';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { listarContas } from '@/server/services/financas/contabilidade.service';
import { listarRubricas, obterContaParaMapear } from '@/server/services/financas/dfc.service';
import { PageHeader } from '@/components/patterns';
import { acessoDFC, lerVoltar, SemPermissao } from '../_components/acesso';
import { BREADCRUMBS_BASE, ROTULO_ATIVIDADE } from '../_components/rotulos';
import { MapearContaForm } from '../_components/mapear-conta-form';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MapearContaPage({ searchParams }: PageProps) {
  const acesso = await acessoDFC();
  const cabecalho = (
    <PageHeader
      title="Mapear conta"
      description="Atribuir uma conta PGC a uma rubrica da Demonstração de Fluxos de Caixa"
      breadcrumbs={[...BREADCRUMBS_BASE, { label: 'Mapear conta' }]}
    />
  );
  if (!acesso.podeConfigurar) {
    return (
      <div className="p-6 space-y-6">
        {cabecalho}
        <SemPermissao mensagem="Não tem permissão para configurar o mapeamento da DFC." />
      </div>
    );
  }

  const sp = await searchParams;
  const contaId = Array.isArray(sp.contaId) ? sp.contaId[0] : sp.contaId;
  const voltar = lerVoltar(sp.voltar);
  const { ctx } = acesso;

  let conta = null;
  if (contaId) {
    try {
      conta = await runWithTenantContext(ctx, () => obterContaParaMapear(contaId, ctx));
    } catch (e) {
      if (e instanceof NotFoundError) notFound();
      throw e;
    }
  }

  const [rubricas, contas] = await runWithTenantContext(ctx, () =>
    Promise.all([
      listarRubricas(ctx),
      conta ? Promise.resolve(null) : listarContas({ aceitaLancamento: true, ativo: true, take: 50 }, ctx),
    ]),
  );

  const actual = conta?.rubricaId ? rubricas.find((r) => r.id === conta.rubricaId) : undefined;
  const rotuloActual = actual
    ? `${actual.codigo} · ${actual.designacao} (${ROTULO_ATIVIDADE[actual.atividade]})`
    : conta?.rubricaId
      ? 'uma rubrica inactiva ou inexistente'
      : null;

  return (
    <div className="p-6 space-y-6">
      {cabecalho}
      <MapearContaForm
        voltar={voltar}
        conta={
          conta
            ? {
                id: conta.id,
                label: `${conta.codigo} · ${conta.nome}`,
                // Só pré-selecciona uma rubrica que se possa escolher (activa e não de caixa).
                rubricaId: rubricas.some((r) => r.id === conta.rubricaId && r.atividade !== 'CAIXA') ? conta.rubricaId : null,
                rubricaActual: rotuloActual,
              }
            : null
        }
        rubricas={rubricas
          .filter((r) => r.atividade !== 'CAIXA')
          .map((r) => ({
            id: r.id,
            label: `${r.codigo} · ${r.designacao} (${ROTULO_ATIVIDADE[r.atividade]})`,
            grupo: r.atividade,
          }))}
        contasIniciais={(contas?.items ?? []).map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nome}` }))}
      />
    </div>
  );
}
