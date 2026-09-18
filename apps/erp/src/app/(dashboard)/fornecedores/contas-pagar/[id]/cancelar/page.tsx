/**
 * Cancelar uma conta a pagar — Server Component (shell).
 *
 * Rota e não AlertDialog porque recolhe um motivo (um campo de texto é
 * formulário, logo é rota). Só contas com valor por pagar se cancelam: a
 * máquina de estados do serviço recusa PAGA e CANCELADA; aqui evita-se que
 * o formulário sequer apareça.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { contaPagarService } from '@/server/services/compras/conta-pagar.service';
import { Button } from '@/components/ui/button';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { CancelarContaForm } from './_components/cancelar-conta-form';

export default async function CancelarContaPagarPage({
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
      title={`Cancelar ${conta.numero}`}
      description={conta.descricao}
      breadcrumbs={[
        { label: 'Fornecedores', href: '/fornecedores' },
        { label: 'Contas a Pagar', href: '/fornecedores/contas-pagar' },
        { label: conta.numero, href: detalhe },
        { label: 'Cancelar' },
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
              ? 'Esta conta já está liquidada e não se cancela — um pagamento feito corrige-se por estorno do lançamento, não por cancelamento da conta.'
              : 'Esta conta já está cancelada.'}
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

      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <p className="font-medium">
          {conta.fornecedorNome} · restante {formatMZN(conta.valorRestante)}
        </p>
        <p className="mt-1 text-muted-foreground">
          A conta deixa de contar como obrigação e sai dos vencimentos. O que já foi pago (
          {formatMZN(conta.valorPago)}) fica registado com os seus lançamentos; esta acção não o
          reverte. O motivo fica nas observações da conta.
        </p>
      </div>

      <CancelarContaForm contaPagarId={conta.id} numero={conta.numero} />
    </div>
  );
}
