/**
 * Liquidar nota de débito — Server Component (shell) (#565).
 *
 * Liquidar é receber o total da ND: D conta do meio / C 411 e, em numerário, entrada na
 * sessão de caixa aberta do utilizador. As formas de pagamento seguem as permissões, como
 * no pagamento da factura (numerário ⇒ `caixa:operar`; as outras ⇒ `financas:banca:escrita`).
 */

import { notFound } from 'next/navigation';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { TRANSICOES_NOTA_DEBITO } from '@/server/services/financas/faturacao.interface';
import { listarContasBancarias } from '@/server/services/financas/contabilidade.service';
import type { ContaBancaria } from '@/server/services/financas/contabilidade.interface';
import { obterSessaoAtual } from '@/server/services/financas/caixa.service';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { SemPermissao } from '@/components/patterns/sem-permissao';
import { formatMZN } from '@/lib/format-currency';
import { diaIsoMaputo, formatarData } from '@/lib/format-date';
import { FORMAS_PAGAMENTO, type FormaPagamento } from '@/lib/meios-pagamento';
import { PERM, AvisoEstado, acessoDocumento } from '../../../../faturacao/_components/acesso-documento';
import { LiquidarNotaDebitoForm } from './_components/liquidar-nota-debito-form';

export default async function LiquidarNotaDebitoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, tem } = await acessoDocumento();

  const nd = await runWithTenantContext(ctx, () => faturacaoService.obterNotaDebito(id, ctx));
  if (!nd) notFound();

  const detalhe = `/vendas/notas-debito/${nd.id}`;
  const cabecalho = (
    <PageHeader
      title={`Liquidar ${nd.numero}`}
      description="Recebimento do cliente pelo total da nota: lança a entrada no meio escolhido"
      breadcrumbs={[
        { label: 'Vendas', href: '/vendas' },
        { label: 'Notas de Débito', href: '/vendas/notas-debito' },
        { label: nd.numero, href: detalhe },
        { label: 'Liquidar' },
      ]}
      badge={<StatusBadge status={nd.status} />}
    />
  );

  let bloqueio: React.ReactNode = null;
  if (!tem(PERM.ndLiquidar)) {
    bloqueio = (
      <SemPermissao
        testId="documento-sem-permissao"
        mensagem="Liquidar uma nota de débito exige a permissão faturacao:nd:liquidar."
        voltar={{ href: detalhe, rotulo: 'Voltar ao documento' }}
      />
    );
  } else if (!TRANSICOES_NOTA_DEBITO[nd.status].includes('LIQUIDADA')) {
    bloqueio = (
      <AvisoEstado mensagem={`Só se liquida uma nota de débito EMITIDA. Esta está ${nd.status}.`} voltar={detalhe} />
    );
  }
  if (bloqueio) {
    return (
      <div className="p-6 space-y-6">
        {cabecalho}
        {bloqueio}
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
  const formasPermitidas: FormaPagamento[] = FORMAS_PAGAMENTO.map((f) => f.value).filter((f) =>
    f === 'NUMERARIO' ? podeCaixa : podeBanca,
  );

  return (
    <div className="p-6 space-y-6">
      {cabecalho}

      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="font-medium">
          {nd.numero} · emitida a {formatarData(nd.dataEmissao)} ·{' '}
          <span data-testid="nd-total">total {formatMZN(nd.total.toString())}</span>
        </p>
        <p className="mt-1 text-muted-foreground">{nd.motivo}</p>
      </div>

      <LiquidarNotaDebitoForm
        id={nd.id}
        numero={nd.numero}
        total={nd.total.toString()}
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
