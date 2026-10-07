/**
 * Pagar a folha de salários — Server Component (shell) (#96, molde: /faturacao/[id]/pagamento).
 *
 * O pagamento lança D 4622 / C conta do meio na data escolhida e, em numerário, sai da
 * sessão de caixa aberta do utilizador. Numerário exige `caixa:operar`; as outras formas
 * exigem `financas:banca:escrita` — as mesmas regras do pagamento de factura.
 *
 * Uma folha que já não está PROCESSADO volta à lista.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { NotFoundError } from '@/lib/errors';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { PayrollService } from '@/server/services/pessoas-projetos/payroll.service';
import { listarContasBancarias } from '@/server/services/financas/contabilidade.service';
import type { ContaBancaria } from '@/server/services/financas/contabilidade.interface';
import { obterSessaoAtual } from '@/server/services/financas/caixa.service';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { formatMZN } from '@/lib/format-currency';
import { diaIsoMaputo, formatarData } from '@/lib/format-date';
import { FORMAS_PAGAMENTO, type FormaPagamento } from '@/lib/meios-pagamento';
import { PagarFolhaForm } from './_components/pagar-folha-form';

const LISTA = '/rh/payroll';
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export default async function PagarFolhaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId, permissions } = session.user;
  const ctx = { tenantId, userId };
  const tem = (p: string) => permissions.includes(p);

  const folha = await runWithTenantContext(ctx, () => PayrollService.obterFolha(id, ctx)).catch((e) => {
    if (e instanceof NotFoundError) return null;
    throw e;
  });
  if (!folha) notFound();
  if (folha.status !== 'PROCESSADO') redirect(LISTA);

  const periodo = `${MESES[folha.mesReferencia - 1]} ${folha.anoReferencia}`;
  const cabecalho = (
    <PageHeader
      title={`Pagar folha de salários — ${periodo}`}
      description="Liquida as remunerações a pagar (4622) pelo meio escolhido, na data do pagamento"
      breadcrumbs={[
        { label: 'RH', href: '/rh/colaboradores' },
        { label: 'Salários', href: LISTA },
        { label: 'Pagar folha' },
      ]}
      badge={<StatusBadge status={folha.status} />}
    />
  );

  if (!tem('rh:payroll:pagar')) {
    return (
      <div className="p-6 space-y-6">
        {cabecalho}
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm">
          <p className="font-medium text-destructive">Sem permissão</p>
          <p className="mt-1 text-muted-foreground">Pagar a folha de salários exige a permissão rh:payroll:pagar.</p>
          <Button asChild size="sm" variant="outline" className="mt-4">
            <Link href={LISTA}>Voltar aos salários</Link>
          </Button>
        </div>
      </div>
    );
  }

  const podeCaixa = tem('caixa:operar');
  const podeBanca = tem('financas:banca:escrita');

  const [contasBancarias, sessaoCaixa] = await runWithTenantContext(ctx, () =>
    Promise.all([
      podeBanca ? listarContasBancarias(ctx) : Promise.resolve([] as ContaBancaria[]),
      podeCaixa ? obterSessaoAtual(ctx) : Promise.resolve(null),
    ]),
  );

  const formasPermitidas: FormaPagamento[] = FORMAS_PAGAMENTO.map((f) => f.value).filter((f) =>
    f === 'NUMERARIO' ? podeCaixa : podeBanca,
  );

  return (
    <div className="p-6 space-y-6">
      {cabecalho}

      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="font-medium">
          {periodo} · {folha._count.payrolls} colaborador(es)
          {folha.dataProcessamento ? ` · processada a ${formatarData(folha.dataProcessamento)}` : ''}
        </p>
        <p className="mt-1 text-muted-foreground">
          Líquido a pagar{' '}
          <span className="font-medium text-foreground tabular-nums">
            {formatMZN(folha.totalLiquido.toString())}
          </span>
          .
        </p>
      </div>

      <PagarFolhaForm
        folhaId={folha.id}
        periodo={periodo}
        formasPermitidas={formasPermitidas}
        contasBancarias={contasBancarias
          .filter((c) => c.ativo)
          .map((c) => ({ id: c.id, label: `${c.banco} — ${c.numeroConta}`, tipoConta: c.tipoConta }))}
        sessaoCaixa={sessaoCaixa ? { numero: String(sessaoCaixa.numero) } : null}
        hoje={diaIsoMaputo()}
        minimo={folha.dataProcessamento ? diaIsoMaputo(0, folha.dataProcessamento) : undefined}
      />
    </div>
  );
}
