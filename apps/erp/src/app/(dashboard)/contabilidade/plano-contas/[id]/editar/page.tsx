/**
 * Editar Conta PGC — Server Component.
 *
 * Com lançamentos registados, os campos estruturais chegam ao formulário já
 * trancados (o servidor recusa à mesma — ver `atualizarConta`).
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { PageHeader } from '@/components/patterns';
import { ContaForm, type ContaMaeOption } from '../../_components/conta-form';

export default async function EditarContaPGCPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const { id } = await params;
  const ctx = { tenantId, userId };

  const ano = new Date().getFullYear();
  const { detalhe, contasMae } = await runWithTenantContext(ctx, async () => {
    const detalhe = await contabilidadeService.obterContaDetalhe(
      id,
      { dataInicio: new Date(Date.UTC(ano, 0, 1)), dataFim: new Date(Date.UTC(ano, 11, 31)) },
      ctx,
    );
    if (!detalhe) return { detalhe: null, contasMae: [] as ContaMaeOption[] };

    const { items } = await contabilidadeService.listarContas({ take: 200 }, ctx);
    return {
      detalhe,
      contasMae: items
        // Uma conta não pode ser mãe de si própria.
        .filter((c: { id: string }) => c.id !== id)
        .map((c: { id: string; codigo: string; nome: string }) => ({
          id: c.id,
          label: `${c.codigo} — ${c.nome}`,
        })),
    };
  });
  if (!detalhe) notFound();

  const { conta, movimentosTotais } = detalhe;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Editar ${conta.codigo} — ${conta.nome}`}
        description="Actualizar dados da conta do plano PGC-NIRF"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Plano de Contas', href: '/contabilidade/plano-contas' },
          { label: conta.codigo, href: `/contabilidade/plano-contas/${conta.id}` },
          { label: 'Editar' },
        ]}
      />

      <ContaForm
        contasMae={contasMae}
        contaId={conta.id}
        trancado={movimentosTotais > 0}
        valoresIniciais={{
          codigo: conta.codigo,
          nome: conta.nome,
          classe: conta.classe,
          tipo: conta.tipo,
          natureza: conta.natureza,
          nivel: conta.nivel,
          contaMaeId: conta.contaMaeId ?? undefined,
          aceitaLancamento: conta.aceitaLancamento,
          descricao: conta.descricao ?? '',
        }}
      />
    </div>
  );
}
