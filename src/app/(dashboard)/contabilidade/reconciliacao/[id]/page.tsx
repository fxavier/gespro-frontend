/**
 * Workspace de reconciliação bancária — Server Component.
 * Saldos (banco vs contabilístico vs diferença) + matching em duas colunas.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { PageHeader, KpiCard, StatusBadge } from '@/components/patterns';
import { MatchingBoard, type ReconciliacaoSerializada } from './_components/matching-board';

const fmtMZN = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });
const fmtData = (d: Date) => d.toLocaleDateString('pt-PT');

export default async function ReconciliacaoWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const { id } = await params;
  const ctx = { tenantId, userId };

  const rec = await runWithTenantContext(ctx, () =>
    contabilidadeService.obterReconciliacao(id, ctx),
  );
  if (!rec) notFound();

  const serializarItem = (i: (typeof rec.itensRazao)[number]) => ({
    id: i.id,
    tipo: i.tipo as 'LANCAMENTO_CONTABIL' | 'EXTRATO_BANCARIO',
    data: i.data.toISOString(),
    descricao: i.descricao,
    valor: i.valor.toFixed(2),
    tipoMovimento: i.tipoMovimento,
    conciliado: i.conciliado,
    itemParId: i.itemParId,
    extratoReferencia: i.extratoReferencia,
  });

  const detalhe: ReconciliacaoSerializada = {
    id: rec.id,
    status: rec.status,
    dataInicio: rec.dataInicio.toISOString(),
    dataFim: rec.dataFim.toISOString(),
    saldoInicialBanco: rec.saldoInicialBanco.toFixed(2),
    saldoFinalBanco: rec.saldoFinalBanco.toFixed(2),
    saldoInicialContabil: rec.saldoInicialContabil.toFixed(2),
    saldoFinalContabil: rec.saldoFinalContabil.toFixed(2),
    diferencaNaoConciliada: rec.diferencaNaoConciliada.toFixed(2),
    observacoes: rec.observacoes,
    contaLabel: `${rec.contaBancaria.banco} — ${rec.contaBancaria.numeroConta}`,
    itensRazao: rec.itensRazao.map(serializarItem),
    itensExtrato: rec.itensExtrato.map(serializarItem),
  };

  const porConciliar =
    rec.itensRazao.filter((i) => !i.conciliado).length +
    rec.itensExtrato.filter((i) => !i.conciliado).length;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Reconciliação · ${detalhe.contaLabel}`}
        description={`Período ${fmtData(rec.dataInicio)} — ${fmtData(rec.dataFim)}`}
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Reconciliação Bancária', href: '/contabilidade/reconciliacao' },
          { label: detalhe.contaLabel },
        ]}
        actions={<StatusBadge status={rec.status} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Saldo final (banco)"
          value={fmtMZN.format(Number(detalhe.saldoFinalBanco))}
          description={`Inicial: ${fmtMZN.format(Number(detalhe.saldoInicialBanco))}`}
        />
        <KpiCard
          title="Saldo final (contabilístico)"
          value={fmtMZN.format(Number(detalhe.saldoFinalContabil))}
          description={`Inicial: ${fmtMZN.format(Number(detalhe.saldoInicialContabil))}`}
        />
        <KpiCard
          title="Diferença não conciliada"
          value={fmtMZN.format(Number(detalhe.diferencaNaoConciliada))}
          description={
            Number(detalhe.diferencaNaoConciliada) === 0 ? 'Balanceada' : 'Por explicar'
          }
        />
        <KpiCard
          title="Itens por conciliar"
          value={porConciliar}
          description={`${rec.itensRazao.length} razão · ${rec.itensExtrato.length} extracto`}
        />
      </div>

      <MatchingBoard rec={detalhe} />
    </div>
  );
}
