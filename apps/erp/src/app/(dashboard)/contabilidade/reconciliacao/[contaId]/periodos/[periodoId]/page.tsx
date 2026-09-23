/**
 * Período de reconciliação e o seu mapa de fecho (RF §16, §17). Em curso, o
 * mapa é calculado agora; fechado, é o que ficou gravado e aprovado.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Download } from 'lucide-react';
import { auth } from '@/lib/auth';
import { NotFoundError } from '@/lib/errors';
import { formatarData, formatarDataHora } from '@/lib/format-date';
import { formatMZN } from '@/lib/format-currency';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { obterContaReconciliacao, obterFechoPeriodo } from '@/server/services/reconciliacao/consulta.service';
import { Button } from '@/components/ui/button';
import { KpiCard, PageHeader, StatusBadge } from '@/components/patterns';
import { FecharPeriodo } from './_components/fechar-periodo';

export default async function PeriodoPage({ params }: { params: Promise<{ contaId: string; periodoId: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const { contaId, periodoId } = await params;
  const [conta, fecho] = await runWithTenantContext(ctx, () =>
    Promise.all([obterContaReconciliacao(contaId, ctx), obterFechoPeriodo(periodoId, ctx)]),
  ).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const { periodo, mapa, aoVivo } = fecho;
  if (periodo.contaBancariaId !== contaId) notFound();

  const base = `/contabilidade/reconciliacao/${contaId}`;
  const titulo = `${conta.banco} — ${conta.numeroConta}`;
  const mzn = (d: { toString(): string }) => formatMZN(d.toString());
  const comDiferenca = !mapa.diferencaResidual.isZero();

  const linhas: [string, string][] = [
    ['Saldo inicial (extracto)', mzn(periodo.saldoInicialBanco)],
    ['Movimentos bancários no período', String(mapa.totalMovimentosBanco)],
    ['Movimentos contabilísticos no período', String(mapa.totalMovimentosContabilisticos)],
    ['Movimentos reconciliados', String(mapa.totalReconciliados)],
    ['Contabilísticos por reflectir no banco (em trânsito)', mzn(mapa.valorEmTransito)],
    ['Bancários por contabilizar', mzn(mapa.valorBancoSemContabilizacao)],
    ['Diferenças de valor aceites', mzn(mapa.valorDiferencas)],
    ['Diferença de abertura', mzn(mapa.diferencaAbertura)],
    ['Saldo final (extracto)', mzn(periodo.saldoFinalBanco)],
    ['Saldo final (contabilidade)', mzn(mapa.saldoFinalContabil)],
    ['Saldo reconciliado', mzn(mapa.saldoReconciliado)],
  ];

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Período ${formatarData(periodo.dataInicio)} — ${formatarData(periodo.dataFim)}`}
        description={titulo}
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Reconciliação Bancária', href: '/contabilidade/reconciliacao' },
          { label: titulo, href: base },
          { label: 'Períodos', href: `${base}/periodos` },
          { label: formatarData(periodo.dataInicio) },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={periodo.estado} />
            <Button asChild size="sm" variant="outline">
              <a href={`/api/reconciliacao/periodos/${periodo.id}/export?formato=xlsx`}>
                <Download className="h-4 w-4 mr-2" /> XLSX
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`/api/reconciliacao/periodos/${periodo.id}/export?formato=csv`}>
                <Download className="h-4 w-4 mr-2" /> CSV
              </a>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard title="Saldo reconciliado" value={mzn(mapa.saldoReconciliado)} description={aoVivo ? 'Calculado agora' : 'Gravado no fecho'} />
        <KpiCard title="Saldo contabilístico" value={mzn(mapa.saldoFinalContabil)} />
        <KpiCard
          title="Diferença residual"
          value={mzn(mapa.diferencaResidual)}
          description={comDiferenca ? 'Por explicar — fechar exige justificação' : 'Reconciliação OK'}
        />
      </div>

      <section aria-labelledby="mapa" className="space-y-2">
        <h2 id="mapa" className="text-sm font-semibold">Mapa de fecho</h2>
        <dl className="divide-y rounded-lg border text-sm">
          {linhas.map(([rotulo, valor]) => (
            <div key={rotulo} className="flex justify-between gap-4 px-4 py-2">
              <dt className="text-muted-foreground">{rotulo}</dt>
              <dd className="tabular-nums">{valor}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 px-4 py-2 font-semibold">
            <dt>Diferença residual</dt>
            <dd className={comDiferenca ? 'tabular-nums text-destructive' : 'tabular-nums'}>{mzn(mapa.diferencaResidual)}</dd>
          </div>
        </dl>
        {!aoVivo && periodo.fechadoEm && (
          <p className="text-xs text-muted-foreground">
            Fechado em {formatarDataHora(periodo.fechadoEm)}
            {periodo.justificacao && <> · Justificação: {periodo.justificacao}</>}
          </p>
        )}
      </section>

      {aoVivo && (
        <>
          <p className="text-sm text-muted-foreground">
            Antes de fechar, resolva as <Link className="underline" href={base}>excepções</Link> e confirme as{' '}
            <Link className="underline" href={`${base}?vista=sugestoes`}>sugestões</Link>.
          </p>
          <FecharPeriodo periodoId={periodo.id} contaId={contaId} comDiferenca={comDiferenca} />
        </>
      )}
    </div>
  );
}
