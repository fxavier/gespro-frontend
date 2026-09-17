/**
 * Registar pagamento de uma conta a pagar — Server Component (shell).
 *
 * Rota dedicada e não modal (regra da casa): recolhe valor, data, forma e
 * referência. Só contas com valor por pagar chegam ao formulário; as pagas e
 * as canceladas recebem a explicação em vez do ecrã — o serviço recusaria na
 * mesma, mas o utilizador não tem de descobrir isso a submeter.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { contaPagarService } from '@/server/services/compras/conta-pagar.service';
import { Button } from '@/components/ui/button';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';
import { RegistarPagamentoForm } from './_components/registar-pagamento-form';

export default async function RegistarPagamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const { id } = await params;
  const ctx = { tenantId, userId };

  let conta;
  try {
    conta = await runWithTenantContext(ctx, () => contaPagarService.obter(id, ctx));
  } catch {
    notFound();
  }
  if (!conta) notFound();

  const detalhe = `/fornecedores/contas-pagar/${conta.id}`;
  const emAberto = conta.status === 'ABERTA' || conta.status === 'PARCIALMENTE_PAGA' || conta.status === 'VENCIDA';

  const cabecalho = (
    <PageHeader
      title={`Registar pagamento — ${conta.numero}`}
      description={conta.descricao}
      breadcrumbs={[
        { label: 'Fornecedores', href: '/fornecedores' },
        { label: 'Contas a Pagar', href: '/fornecedores/contas-pagar' },
        { label: conta.numero, href: detalhe },
        { label: 'Registar pagamento' },
      ]}
      badge={<StatusBadge status={conta.status} />}
    />
  );

  if (!emAberto) {
    return (
      <div className="p-6 space-y-6">
        {cabecalho}
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-6 text-sm">
          <p>
            {conta.status === 'PAGA'
              ? 'Esta conta já está liquidada: não há valor por pagar.'
              : 'Esta conta foi cancelada e não aceita pagamentos.'}
          </p>
          <Button asChild size="sm" variant="outline" className="mt-4">
            <Link href={detalhe}>Voltar à conta</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {cabecalho}

      <div className="rounded-xl border bg-secondary/60 p-4 text-sm">
        <p className="font-medium">
          {conta.fornecedorNome} · vence a {formatarData(conta.dataVencimento)}
        </p>
        <p className="mt-1 text-muted-foreground">
          Original {formatMZN(conta.valorOriginal)} · pago {formatMZN(conta.valorPago)} ·{' '}
          <span className="font-medium text-foreground">restante {formatMZN(conta.valorRestante)}</span>.
          O pagamento gera o lançamento contabilístico (421 Fornecedores c/c a débito, 121 Depósitos
          à ordem a crédito) no diário de banco.
        </p>
      </div>

      <RegistarPagamentoForm contaPagarId={conta.id} valorRestante={conta.valorRestante} />
    </div>
  );
}
