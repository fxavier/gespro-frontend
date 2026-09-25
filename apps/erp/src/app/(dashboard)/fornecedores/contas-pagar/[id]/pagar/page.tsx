/**
 * Registar pagamento de uma conta a pagar — Server Component (shell).
 *
 * Rota dedicada e não modal (regra da casa): recolhe valor, data, forma,
 * conta bancária (para formas não numerário) e referência.
 * Só contas com valor por pagar chegam ao formulário; as pagas e
 * as canceladas recebem a explicação em vez do ecrã — o serviço recusaria na
 * mesma, mas o utilizador não tem de descobrir isso a submeter.
 *
 * O comportamento do pagamento depende da forma escolhida:
 * - NUMERARIO             → D 421 / C 111 Caixa, diário CAIXA, movimento PAGAMENTO
 *                           na sessão de caixa do utilizador.
 * - TRANSFERENCIA_BANCARIA / CHEQUE → D 421 / C <PGC da ContaBancaria CORRENTE/POUPANCA/DEPOSITO_PRAZO>,
 *                           diário BANCO, sem movimento de caixa.
 * - M-PESA / E-MOLA       → idem, mas ContaBancaria tem de ser CARTEIRA_MOVEL.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { contaPagarService } from '@/server/services/compras/conta-pagar.service';
import { listarContasBancarias } from '@/server/services/financas/contabilidade.service';
import { obterSessaoAtual } from '@/server/services/financas/caixa.service';
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

  // Carregar contas bancárias activas do tenant e sessão de caixa do utilizador
  const [contasBancarias, sessaoCaixa] = await runWithTenantContext(ctx, () =>
    Promise.all([
      listarContasBancarias(ctx),
      obterSessaoAtual(ctx),
    ]),
  );

  // Serializar para o cliente: só os campos necessários
  const contasBancariasOpts = contasBancarias
    .filter((c: any) => c.ativo)
    .map((c: any) => ({
      id: c.id as string,
      label: `${c.banco} — ${c.numeroConta}` as string,
      tipoConta: c.tipoConta as string,
    }));

  const sessaoCaixaInfo = sessaoCaixa
    ? { id: sessaoCaixa.id as string, numero: sessaoCaixa.numero as string }
    : null;

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
          O pagamento gera um lançamento contabilístico (421 Fornecedores c/c a débito) no
          diário correspondente à forma de pagamento escolhida.
        </p>
      </div>

      <RegistarPagamentoForm
        contaPagarId={conta.id}
        valorRestante={conta.valorRestante}
        contasBancarias={contasBancariasOpts}
        sessaoCaixa={sessaoCaixaInfo}
      />
    </div>
  );
}
