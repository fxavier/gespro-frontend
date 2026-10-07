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
import { PageHeader, type ComboboxOption } from '@/components/patterns';
import { ContaForm } from '../../_components/conta-form';

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
  const { detalhe, opcoesIniciais } = await runWithTenantContext(ctx, async () => {
    const detalhe = await contabilidadeService.obterContaDetalhe(
      id,
      { dataInicio: new Date(Date.UTC(ano, 0, 1)), dataFim: new Date(Date.UTC(ano, 11, 31)) },
      ctx,
    );
    if (!detalhe) return { detalhe: null, opcoesIniciais: [] as ComboboxOption[] };

    // Primeira página (50 contas) + conta mãe actual (pode estar fora das primeiras 50).
    // Sem a própria conta nem as descendentes: qualquer delas criaria um ciclo (#296).
    const excluirIds = [id, ...(await contabilidadeService.idsDescendentes(id, ctx))];
    const { items } = await contabilidadeService.listarContas({ take: 50 }, ctx, { excluirIds });

    // Merge por id: primeira página + conta mãe actual (sem duplicados).
    const mapaContas = new Map<string, ComboboxOption>(
      items.map((c) => [c.id, { value: c.id, label: `${c.codigo} — ${c.nome}` }]),
    );
    const contaMaeActual = detalhe.contaMae;
    if (contaMaeActual) {
      mapaContas.set(contaMaeActual.id, {
        value: contaMaeActual.id,
        label: `${contaMaeActual.codigo} — ${contaMaeActual.nome}`,
      });
    }

    return {
      detalhe,
      opcoesIniciais: [...mapaContas.values()],
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
        opcoesIniciais={opcoesIniciais}
        contaId={conta.id}
        trancado={movimentosTotais > 0}
        valoresIniciais={{
          codigo: conta.codigo,
          nome: conta.nome,
          classe: conta.classe,
          tipo: conta.tipo,
          natureza: conta.natureza,
          nivel: conta.nivel,
          contaMaeId: conta.contaMaeId,
          aceitaLancamento: conta.aceitaLancamento,
          descricao: conta.descricao ?? '',
        }}
      />
    </div>
  );
}
