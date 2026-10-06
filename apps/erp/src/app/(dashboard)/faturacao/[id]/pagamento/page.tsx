/**
 * Registar pagamento de uma factura — Server Component (shell) (P2, fatura-pdf-pagamento).
 *
 * O pagamento lança D conta do meio / C 411 e, em numerário, entra na sessão de caixa
 * aberta do utilizador. Numerário exige `caixa:operar`; as outras formas exigem
 * `financas:banca:escrita` — as mesmas regras da devolução de uma NC.
 *
 * Uma factura que já não aceita pagamento (paga, cancelada, rascunho) volta ao detalhe.
 * Tudo o que o formulário precisa de decidir é calculado aqui e desce por prop.
 */

import { notFound, redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { ESTADOS_FATURA_PAGAVEL } from '@/server/services/financas/faturacao.interface';
import { listarContasBancarias } from '@/server/services/financas/contabilidade.service';
import type { ContaBancaria } from '@/server/services/financas/contabilidade.interface';
import { obterSessaoAtual } from '@/server/services/financas/caixa.service';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { diaIsoMaputo, formatarData } from '@/lib/format-date';
import { FORMAS_PAGAMENTO, type FormaPagamento } from '@/lib/meios-pagamento';
import { PERM, SemPermissao, acessoDocumento } from '../../_components/acesso-documento';
import { RegistarPagamentoFaturaForm } from './_components/registar-pagamento-fatura-form';

export default async function RegistarPagamentoFaturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, tem } = await acessoDocumento();

  const fatura = await runWithTenantContext(ctx, () => faturacaoService.obterFatura(id, ctx));
  if (!fatura) notFound();

  const detalhe = `/faturacao/${fatura.id}`;
  if (!ESTADOS_FATURA_PAGAVEL.includes(fatura.status)) redirect(detalhe);

  const cabecalho = (
    <PageHeader
      title={`Registar pagamento — ${fatura.numero}`}
      description="Recebimento do cliente: lança a entrada no meio escolhido e abate ao saldo da factura"
      breadcrumbs={[
        { label: 'Faturação', href: '/faturacao' },
        { label: fatura.numero, href: detalhe },
        { label: 'Registar pagamento' },
      ]}
      badge={<StatusBadge status={fatura.status} />}
    />
  );

  if (!tem(PERM.faturaPagar)) {
    return (
      <div className="p-6 space-y-6">
        {cabecalho}
        <SemPermissao
          mensagem="Registar o pagamento de uma factura exige a permissão faturacao:fatura:pagar."
          voltar={detalhe}
        />
      </div>
    );
  }

  const podeCaixa = tem(PERM.caixaOperar);
  const podeBanca = tem(PERM.bancaEscrita);

  const [contasBancarias, sessaoCaixa] = await runWithTenantContext(ctx, () =>
    Promise.all([
      podeBanca ? listarContasBancarias(ctx) : Promise.resolve([] as ContaBancaria[]),
      podeCaixa ? obterSessaoAtual(ctx) : Promise.resolve(null),
    ]),
  );

  const total = new Prisma.Decimal(fatura.total.toString());
  const totalPago = new Prisma.Decimal(fatura.totalPago.toString());
  const pendente = total.minus(totalPago);

  const formasPermitidas: FormaPagamento[] = FORMAS_PAGAMENTO.map((f) => f.value).filter((f) =>
    f === 'NUMERARIO' ? podeCaixa : podeBanca,
  );

  return (
    <div className="p-6 space-y-6">
      {cabecalho}

      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="font-medium">
          {fatura.numero} · emitida a {formatarData(fatura.dataEmissao)} · vence a{' '}
          {formatarData(fatura.dataVencimento)}
        </p>
        <p className="mt-1 text-muted-foreground">
          Total <span className="tabular-nums">{formatMZN(total.toString())}</span> · pago{' '}
          <span className="tabular-nums">{formatMZN(totalPago.toString())}</span> ·{' '}
          <span className="font-medium text-foreground" data-testid="fatura-pendente">
            pendente {formatMZN(pendente.toString())}
          </span>
          .
        </p>
      </div>

      <RegistarPagamentoFaturaForm
        faturaId={fatura.id}
        numero={fatura.numero}
        pendente={pendente.toString()}
        formasPermitidas={formasPermitidas}
        contasBancarias={contasBancarias
          .filter((c) => c.ativo)
          .map((c) => ({ id: c.id, label: `${c.banco} — ${c.numeroConta}`, tipoConta: c.tipoConta }))}
        sessaoCaixa={sessaoCaixa ? { numero: String(sessaoCaixa.numero) } : null}
        hoje={diaIsoMaputo()}
      />
    </div>
  );
}
