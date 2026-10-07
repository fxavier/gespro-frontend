/**
 * Liquidar nota de crédito — Server Component (shell) (#148).
 *
 * A liquidação é sempre total (EMITIDA → LIQUIDADA) e tem duas formas:
 * - COMPENSACAO: abate o total da NC ao saldo da factura original. Só se
 *   oferece com a factura EMITIDA/PARCIALMENTE_PAGA/VENCIDA e saldo ≥ total da
 *   NC — as mesmas condições com que o serviço recusa.
 * - DEVOLUCAO: dinheiro ao cliente. Numerário exige `caixa:operar` (e sessão de
 *   caixa aberta); as outras formas exigem `financas:banca:escrita`.
 *
 * Tudo o que o formulário precisa de decidir é calculado aqui e desce por
 * prop: o dia de Maputo, o saldo, as formas permitidas, as contas bancárias.
 */

import { notFound } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { ESTADOS_FATURA_COMPENSAVEL, TRANSICOES_NOTA_CREDITO } from '@/server/services/financas/faturacao.interface';
import { listarContasBancarias } from '@/server/services/financas/contabilidade.service';
import type { ContaBancaria } from '@/server/services/financas/contabilidade.interface';
import { obterSessaoAtual } from '@/server/services/financas/caixa.service';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { diaIsoMaputo, formatarData } from '@/lib/format-date';
import { FORMAS_PAGAMENTO, type FormaPagamento } from '@/lib/meios-pagamento';
import { PERM, AvisoEstado, acessoDocumento } from '../../../_components/acesso-documento';
import { SemPermissao } from '@/components/patterns/sem-permissao';
import { LiquidarNotaCreditoForm } from './_components/liquidar-nota-credito-form';


export default async function LiquidarNotaCreditoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, tem } = await acessoDocumento();

  const nc = await runWithTenantContext(ctx, () => faturacaoService.obterNotaCredito(id, ctx));
  if (!nc) notFound();

  const detalhe = `/faturacao/nota-credito/${nc.id}`;
  const cabecalho = (
    <PageHeader
      title={`Liquidar ${nc.numero}`}
      description="Devolve o crédito ao cliente ou abate-o à factura original"
      breadcrumbs={[
        { label: 'Faturação', href: '/faturacao' },
        { label: 'Notas de Crédito', href: '/faturacao/nota-credito' },
        { label: nc.numero, href: detalhe },
        { label: 'Liquidar' },
      ]}
      badge={<StatusBadge status={nc.status} />}
    />
  );

  if (!tem(PERM.ncLiquidar)) {
    return (
      <div className="p-6 space-y-6">
        {cabecalho}
        <SemPermissao
          testId="documento-sem-permissao"
          mensagem="Liquidar uma nota de crédito exige a permissão faturacao:nc:liquidar."
          voltar={{ href: detalhe, rotulo: 'Voltar ao documento' }}
        />
      </div>
    );
  }

  if (!TRANSICOES_NOTA_CREDITO[nc.status].includes('LIQUIDADA')) {
    return (
      <div className="p-6 space-y-6">
        {cabecalho}
        <AvisoEstado
          mensagem={`Só se liquida uma nota de crédito EMITIDA. Esta está ${nc.status}.`}
          voltar={detalhe}
        />
      </div>
    );
  }

  const podeCaixa = tem(PERM.caixaOperar);
  const podeBanca = tem(PERM.bancaEscrita);

  const [fatura, contasBancarias, sessaoCaixa] = await runWithTenantContext(ctx, () =>
    Promise.all([
      faturacaoService.obterFatura(nc.faturaOriginalId, ctx),
      podeBanca ? listarContasBancarias(ctx) : Promise.resolve([] as ContaBancaria[]),
      podeCaixa ? obterSessaoAtual(ctx) : Promise.resolve(null),
    ]),
  );

  const totalNC = new Prisma.Decimal(nc.total.toString());
  const saldoFatura = fatura
    ? new Prisma.Decimal(fatura.total.toString()).minus(new Prisma.Decimal(fatura.totalPago.toString()))
    : null;
  const estadoCompensavel = !!fatura && (ESTADOS_FATURA_COMPENSAVEL as readonly string[]).includes(fatura.status);
  const compensacaoPossivel = estadoCompensavel && !!saldoFatura && saldoFatura.greaterThanOrEqualTo(totalNC);

  const formasPermitidas: FormaPagamento[] = FORMAS_PAGAMENTO.map((f) => f.value).filter((f) =>
    f === 'NUMERARIO' ? podeCaixa : podeBanca,
  );

  let motivoSemCompensacao: string | null = null;
  if (!fatura) motivoSemCompensacao = 'A factura original não foi encontrada.';
  else if (!estadoCompensavel)
    motivoSemCompensacao = `A factura ${fatura.numero} está ${fatura.status} e não admite compensação.`;
  else if (!compensacaoPossivel)
    motivoSemCompensacao = `O saldo em aberto da factura ${fatura.numero} (${formatMZN(saldoFatura!.toString())}) é inferior ao total da nota de crédito.`;

  return (
    <div className="p-6 space-y-6">
      {cabecalho}

      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="font-medium">
          {nc.numero} · factura {nc.faturaOriginal.numero} · emitida a {formatarData(nc.dataEmissao)} ·{' '}
          <span className="tabular-nums">{formatMZN(totalNC.toString())}</span>
        </p>
        {fatura && saldoFatura && (
          <p className="mt-1 text-muted-foreground">
            Factura {fatura.numero}: total {formatMZN(fatura.total.toString())} · pago{' '}
            {formatMZN(fatura.totalPago.toString())} ·{' '}
            <span className="font-medium text-foreground" data-testid="nc-saldo-fatura">
              saldo em aberto {formatMZN(saldoFatura.toString())}
            </span>
            .
          </p>
        )}
      </div>

      <LiquidarNotaCreditoForm
        ncId={nc.id}
        numero={nc.numero}
        totalNC={totalNC.toString()}
        faturaNumero={nc.faturaOriginal.numero}
        compensacao={
          compensacaoPossivel && saldoFatura
            ? { possivel: true, saldo: saldoFatura.toString() }
            : { possivel: false, motivo: motivoSemCompensacao ?? '' }
        }
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
