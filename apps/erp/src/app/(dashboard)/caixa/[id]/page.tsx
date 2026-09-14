/**
 * Detalhe de Sessão de Caixa — Server Component.
 *
 * A listagem já oferecia «Ver detalhe» e linhas clicáveis para esta rota;
 * faltava a página. Mostra o resumo financeiro calculado pelo servidor
 * (`resumoSessao` — nunca recalculado no cliente) e o extracto de movimentos.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as caixaService from '@/server/services/financas/caixa.service';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { formatarDataExtensa } from '@/lib/format-date';
import { MovimentosTable, type MovimentoCaixaResumo } from '../_components/movimentos-table';

export default async function SessaoCaixaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const { id } = await params;
  const ctx = { tenantId, userId };

  const dados = await runWithTenantContext(ctx, async () => {
    const sessao = await caixaService.obterSessao(id, ctx);
    if (!sessao) return null;
    return { sessao, resumo: await caixaService.resumoSessao(sessao.id, ctx) };
  });
  if (!dados) notFound();

  const { sessao, resumo } = dados;
  const aberta = sessao.status === 'ABERTA';

  // Decimal → string na fronteira SC→CC.
  const movimentos: MovimentoCaixaResumo[] = sessao.movimentos.map((m) => ({
    id: m.id,
    tipo: m.tipo,
    valor: m.valor.toString(),
    descricao: m.descricao,
    observacoes: m.observacoes ?? null,
    dataMovimento: m.dataMovimento.toISOString(),
  }));

  const diferenca = resumo.diferenca ? Number(resumo.diferenca) : null;

  const valores: { label: string; value: string; className?: string }[] = [
    { label: 'Fundo inicial', value: formatMZN(resumo.fundoInicial.toString()) },
    {
      label: 'Entradas',
      value: formatMZN(resumo.totalEntradas.toString()),
      className: 'text-success',
    },
    {
      label: 'Saídas',
      value: formatMZN(resumo.totalSaidas.toString()),
      className: 'text-destructive',
    },
    {
      label: aberta ? 'Saldo esperado' : 'Saldo esperado ao fecho',
      value: formatMZN(resumo.saldoEsperado.toString()),
    },
    {
      label: 'Contagem física',
      value: resumo.fundoFinal ? formatMZN(resumo.fundoFinal.toString()) : '—',
    },
    {
      label: 'Diferença',
      value: diferenca === null ? '—' : `${diferenca > 0 ? '+' : ''}${formatMZN(String(diferenca))}`,
      className:
        diferenca === null || diferenca === 0
          ? undefined
          : diferenca > 0
            ? 'text-info'
            : 'text-destructive',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Sessão ${sessao.numero}`}
        description={`Aberta a ${formatarDataExtensa(sessao.dataAbertura)}${
          sessao.dataFechamento ? ` · fechada a ${formatarDataExtensa(sessao.dataFechamento)}` : ''
        }`}
        breadcrumbs={[{ label: 'Caixa', href: '/caixa' }, { label: sessao.numero }]}
        badge={<StatusBadge status={sessao.status} />}
        actions={
          aberta ? (
            <Button asChild size="sm">
              <Link href={`/caixa/fechamento?sessaoId=${sessao.id}`}>
                <Lock className="h-4 w-4 mr-2" />
                Fechar caixa
              </Link>
            </Button>
          ) : null
        }
      />

      <Card>
        <CardContent className="pt-6">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
            {valores.map((v) => (
              <div key={v.label} className="space-y-1">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{v.label}</dt>
                <dd className={`text-sm font-medium tabular-nums ${v.className ?? ''}`}>
                  {v.value}
                </dd>
              </div>
            ))}
          </dl>

          {sessao.observacoes && (
            <p className="mt-6 border-t pt-4 text-sm text-muted-foreground">{sessao.observacoes}</p>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Movimentos <span className="text-muted-foreground">({movimentos.length})</span>
        </h2>
        <MovimentosTable data={movimentos} />
      </section>
    </div>
  );
}
