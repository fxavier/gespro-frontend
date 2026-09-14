/**
 * Detalhe de uma conta do plano PGC-NIRF — Server Component.
 *
 * A listagem oferecia «Ver detalhe» e linhas clicáveis para esta rota, que não
 * existia. Mostra a identidade da conta, onde ela está na hierarquia e quanto
 * movimento tem no exercício; o extracto completo vive no razão, que já filtra
 * por conta — não se duplica aqui.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Edit, ScrollText } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader, StatusBadge, EmptyState } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { DesactivarConta } from '../_components/desactivar-conta';

const CLASSE_LABEL: Record<string, string> = {
  CLASSE_1: 'Classe 1 — Meios financeiros',
  CLASSE_2: 'Classe 2 — Contas a receber/pagar',
  CLASSE_3: 'Classe 3 — Existências',
  CLASSE_4: 'Classe 4 — Investimentos',
  CLASSE_5: 'Classe 5 — Capital próprio',
  CLASSE_6: 'Classe 6 — Gastos',
  CLASSE_7: 'Classe 7 — Rendimentos',
  CLASSE_8: 'Classe 8 — Resultados',
};

const TIPO_LABEL: Record<string, string> = {
  ATIVO: 'Activo',
  PASSIVO: 'Passivo',
  CAPITAL_PROPRIO: 'Capital próprio',
  RENDIMENTO: 'Rendimento',
  GASTO: 'Gasto',
  RESULTADO: 'Resultado',
};

/** Exercício corrente — é o período em que um contabilista pensa por omissão. */
function exercicioCorrente() {
  const ano = new Date().getFullYear();
  return {
    ano,
    dataInicio: new Date(Date.UTC(ano, 0, 1)),
    dataFim: new Date(Date.UTC(ano, 11, 31, 23, 59, 59)),
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function ContaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const { id } = await params;
  const ctx = { tenantId, userId };
  const exercicio = exercicioCorrente();

  const detalhe = await runWithTenantContext(ctx, () =>
    contabilidadeService.obterContaDetalhe(id, exercicio, ctx)
  );
  if (!detalhe) notFound();

  const { conta, contaMae, subContas, debitos, creditos, saldo, movimentos, movimentosTotais } =
    detalhe;

  const identidade: { label: string; value: React.ReactNode }[] = [
    { label: 'Código', value: <span className="font-mono">{conta.codigo}</span> },
    { label: 'Classe', value: CLASSE_LABEL[conta.classe] ?? conta.classe },
    { label: 'Tipo', value: TIPO_LABEL[conta.tipo] ?? conta.tipo },
    { label: 'Natureza', value: conta.natureza === 'DEVEDORA' ? 'Devedora' : 'Credora' },
    { label: 'Nível', value: String(conta.nivel) },
    {
      label: 'Aceita lançamentos',
      value: conta.aceitaLancamento ? 'Sim' : 'Não — conta de agregação',
    },
  ];

  const movimento: { label: string; value: string; className?: string }[] = [
    { label: 'Débitos', value: formatMZN(debitos.toString()) },
    { label: 'Créditos', value: formatMZN(creditos.toString()) },
    {
      label: `Saldo ${conta.natureza === 'DEVEDORA' ? 'devedor' : 'credor'}`,
      value: formatMZN(saldo.toString()),
      className: Number(saldo) < 0 ? 'text-destructive' : undefined,
    },
    { label: 'Movimentos', value: movimentos.toLocaleString('pt-MZ') },
  ];

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`${conta.codigo} — ${conta.nome}`}
        description={conta.descricao ?? 'Conta do plano PGC-NIRF'}
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Plano de Contas', href: '/contabilidade/plano-contas' },
          { label: conta.codigo },
        ]}
        badge={<StatusBadge status={conta.ativo ? 'ATIVO' : 'INATIVO'} />}
        actions={
          <>
            {conta.aceitaLancamento && (
              <Button asChild size="sm" variant="outline">
                <Link
                  href={`/contabilidade/razao-geral?contaId=${conta.id}&dataInicio=${iso(exercicio.dataInicio)}&dataFim=${iso(exercicio.dataFim)}`}
                >
                  <ScrollText className="h-4 w-4 mr-2" />
                  Ver razão
                </Link>
              </Button>
            )}
            {conta.ativo && (
              <DesactivarConta
                id={conta.id}
                codigo={conta.codigo}
                nome={conta.nome}
                movimentos={movimentosTotais}
              />
            )}
            <Button asChild size="sm">
              <Link href={`/contabilidade/plano-contas/${conta.id}/editar`}>
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </Link>
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
            {identidade.map((campo) => (
              <div key={campo.label} className="space-y-1">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {campo.label}
                </dt>
                <dd className="text-sm font-medium">{campo.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Movimento do exercício{' '}
          <span className="text-muted-foreground tabular-nums">{exercicio.ano}</span>
        </h2>
        <Card>
          <CardContent className="pt-6">
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
              {movimento.map((campo) => (
                <div key={campo.label} className="space-y-1">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    {campo.label}
                  </dt>
                  <dd className={`text-sm font-medium tabular-nums ${campo.className ?? ''}`}>
                    {campo.value}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Hierarquia</h2>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Conta mãe</p>
              {contaMae ? (
                <Link
                  href={`/contabilidade/plano-contas/${contaMae.id}`}
                  className="text-sm font-medium underline underline-offset-4 hover:text-primary"
                >
                  <span className="font-mono">{contaMae.codigo}</span> — {contaMae.nome}
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma — é uma conta de raiz.</p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Sub-contas ({subContas.length})
              </p>
              {subContas.length === 0 ? (
                <EmptyState
                  title="Sem sub-contas"
                  description="Esta conta não desdobra em contas de nível inferior."
                />
              ) : (
                <ul className="divide-y rounded-lg border">
                  {subContas.map((sub) => (
                    <li key={sub.id}>
                      <Link
                        href={`/contabilidade/plano-contas/${sub.id}`}
                        className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm hover:bg-muted/50"
                      >
                        <span className="min-w-0">
                          <span className="font-mono text-primary">{sub.codigo}</span>{' '}
                          <span className="truncate">{sub.nome}</span>
                        </span>
                        {!sub.ativo && <StatusBadge status="INATIVO" />}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
