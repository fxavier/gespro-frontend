/**
 * Detalhe de Nota de Débito — Server Component (#565).
 *
 * A ND é um documento fiscal emitido: não se edita. A partir de EMITIDA há duas
 * transições, cada uma na sua rota porque recolhe dados: liquidar (recebimento
 * D meio / C 411) e cancelar (estorno do lançamento da emissão, ADR-0039 §3).
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { NaturezaNotaDebito } from '@prisma/client';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { TRANSICOES_NOTA_DEBITO } from '@/server/services/financas/faturacao.interface';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { clienteService } from '@/server/services/comercial/cliente.service';
import { PageHeader, StatusBadge, DetailShell } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';
import { ROTULO_NATUREZA_ND, rotuloContaPGC } from '@/lib/nota-debito';
import { LinhasDocumento } from '../../../faturacao/_components/linhas-documento';
import { PERM, acessoDocumento } from '../../../faturacao/_components/acesso-documento';
import { AcoesNotaDebito } from './_components/acoes-nota-debito';

/** Colunas da ND que o tipo `NotaDebito` do serviço ainda não declara (ADR-0039). */
type ColunasAdr0039 = {
  natureza: NaturezaNotaDebito;
  contaCreditoId: string | null;
  motivoCancelamento: string | null;
};

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{rotulo}</p>
      <div>{children}</div>
    </div>
  );
}

const ligacaoLancamento = (lancamentoId: string, texto: string, testId?: string) => (
  <Link href={`/contabilidade/lancamentos/${lancamentoId}`} className="text-primary underline" data-testid={testId}>
    {texto}
  </Link>
);

export default async function NotaDebitoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, tem } = await acessoDocumento();

  const lida = await runWithTenantContext(ctx, () => faturacaoService.obterNotaDebito(id, ctx));
  if (!lida) notFound();
  const nd = lida as typeof lida & ColunasAdr0039;

  const [cliente, contaCredito, lancamento] = await runWithTenantContext(ctx, () =>
    Promise.all([
      clienteService.buscarPorId(nd.clienteId, ctx).catch(() => null), // cliente removido: a ND continua legível
      nd.contaCreditoId ? contabilidadeService.obterConta(nd.contaCreditoId, ctx) : Promise.resolve(null),
      nd.lancamentoId ? contabilidadeService.obterLancamentoDetalhe(nd.lancamentoId, ctx) : Promise.resolve(null),
    ]),
  );

  const permitidas = TRANSICOES_NOTA_DEBITO[nd.status] ?? [];
  const podeLiquidar = permitidas.includes('LIQUIDADA') && tem(PERM.ndLiquidar);
  const podeCancelar = permitidas.includes('CANCELADA') && tem(PERM.ndCancelar);

  const tabLinhas = (
    <LinhasDocumento
      linhas={nd.linhas.map((l) => ({
        id: l.id,
        descricao: l.descricao,
        quantidade: l.quantidade.toString(),
        precoUnitario: l.precoUnitario.toString(),
        desconto: l.desconto.toString(),
        taxaIva: l.taxaIva.toString(),
        total: l.total.toString(),
      }))}
      subtotal={nd.subtotal.toString()}
      descontoTotal={nd.descontoTotal.toString()}
      ivaTotal={nd.ivaTotal.toString()}
      total={nd.total.toString()}
    />
  );

  const tabDetalhes = (
    <div className="space-y-4 text-sm">
      <Campo rotulo="Motivo da nota">
        <p className="whitespace-pre-wrap">{nd.motivo}</p>
      </Campo>
      <Campo rotulo="Natureza">{ROTULO_NATUREZA_ND[nd.natureza] ?? nd.natureza}</Campo>
      <Campo rotulo="Conta a crédito">{contaCredito ? rotuloContaPGC(contaCredito) : '—'}</Campo>
      <Campo rotulo="Observações">
        <p className="whitespace-pre-wrap">
          {nd.observacoes || <span className="text-muted-foreground">Sem observações.</span>}
        </p>
      </Campo>
      {nd.lancamentoId && (
        <Campo rotulo="Lançamento da emissão">
          {ligacaoLancamento(nd.lancamentoId, lancamento ? `Ver lançamento ${lancamento.lancamento.numero}` : 'Ver lançamento', 'nd-lancamento')}
        </Campo>
      )}

      {nd.status === 'LIQUIDADA' && (
        <div className="rounded-lg border bg-muted/40 p-4 space-y-2" data-testid="nd-liquidacao">
          <p className="font-medium">Liquidação</p>
          <p className="text-muted-foreground">
            Recebida pelo total ({formatMZN(nd.total.toString())}): o recebimento foi lançado a débito da conta do
            meio e a crédito de 411 Clientes, com esta nota como documento de origem.
          </p>
        </div>
      )}

      {nd.status === 'CANCELADA' && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3"
          data-testid="nd-cancelamento"
        >
          <p className="font-medium">Cancelamento</p>
          <Campo rotulo="Motivo">
            <p className="whitespace-pre-wrap">{nd.motivoCancelamento ?? '—'}</p>
          </Campo>
          {lancamento?.estorno && (
            <Campo rotulo="Estorno do lançamento">
              {ligacaoLancamento(lancamento.estorno.id, `Ver estorno ${lancamento.estorno.numero}`, 'nd-estorno')}
            </Campo>
          )}
        </div>
      )}
    </div>
  );

  const metadata = [
    { label: 'Número', value: <span className="font-mono font-medium">{nd.numero}</span> },
    { label: 'Cliente', value: cliente?.nome ?? '—' },
    ...(nd.faturaReferencia
      ? [
          {
            label: 'Factura de referência',
            value: (
              <Link href={`/faturacao/${nd.faturaReferencia.id}`} className="font-mono text-primary underline">
                {nd.faturaReferencia.numero}
              </Link>
            ),
          },
        ]
      : []),
    { label: 'Data de Emissão', value: formatarData(nd.dataEmissao) },
    { label: 'Moeda', value: nd.moeda },
    {
      label: 'Total',
      value: <span className="font-semibold tabular-nums">{formatMZN(nd.total.toString())}</span>,
    },
  ];

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={`Nota de débito ${nd.numero}`}
            description={cliente?.nome ?? undefined}
            breadcrumbs={[
              { label: 'Vendas', href: '/vendas' },
              { label: 'Notas de Débito', href: '/vendas/notas-debito' },
              { label: nd.numero },
            ]}
            badge={<StatusBadge status={nd.status} />}
            actions={<AcoesNotaDebito id={nd.id} podeLiquidar={podeLiquidar} podeCancelar={podeCancelar} />}
          />
        }
        tabs={[
          { key: 'linhas', label: 'Linhas', count: nd.linhas.length, content: tabLinhas },
          { key: 'detalhes', label: 'Detalhes', content: tabDetalhes },
        ]}
        defaultTab={nd.status === 'EMITIDA' || nd.status === 'RASCUNHO' ? 'linhas' : 'detalhes'}
        metadata={metadata}
      />
    </div>
  );
}
