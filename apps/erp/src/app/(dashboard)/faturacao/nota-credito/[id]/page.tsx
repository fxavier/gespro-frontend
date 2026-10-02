/**
 * Detalhe de Nota de Crédito — Server Component (#148, fecha #152).
 *
 * A lista ligava para aqui e dava 404. A NC é documento fiscal emitido:
 * não há edição, só as duas transições que a máquina de estados permite a
 * partir de EMITIDA — liquidar e cancelar —, cada uma na sua rota.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { TRANSICOES_NOTA_CREDITO } from '@/server/services/financas/faturacao.interface';
import { clienteService } from '@/server/services/comercial/cliente.service';
import { PageHeader, StatusBadge, DetailShell } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';
import { LinhasDocumento } from '../../_components/linhas-documento';
import { PERM, acessoDocumento } from '../../_components/acesso-documento';
import { AcoesNotaCredito } from './_components/acoes-nota-credito';

const ROTULO_FORMA_LIQUIDACAO = {
  DEVOLUCAO: 'Devolução ao cliente',
  COMPENSACAO: 'Compensação na factura original ou no documento da troca',
} as const;

interface Props {
  params: Promise<{ id: string }>;
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{rotulo}</p>
      <div>{children}</div>
    </div>
  );
}

export default async function NotaCreditoDetalhePage({ params }: Props) {
  const { id } = await params;
  const { ctx, tem } = await acessoDocumento();

  const nc = await runWithTenantContext(ctx, () => faturacaoService.obterNotaCredito(id, ctx));
  if (!nc) notFound();

  // O cliente da NC é o da factura que ela corrige.
  const fatura = await runWithTenantContext(ctx, () =>
    faturacaoService.obterFatura(nc.faturaOriginalId, ctx)
  );
  let clienteNome: string | null = null;
  if (fatura?.clienteId) {
    try {
      const cliente = await runWithTenantContext(ctx, () =>
        clienteService.buscarPorId(fatura.clienteId, ctx)
      );
      clienteNome = cliente?.nome ?? null;
    } catch {
      // cliente removido — a NC continua legível sem o nome
    }
  }

  const permitidas = TRANSICOES_NOTA_CREDITO[nc.status] ?? [];
  const podeLiquidar = permitidas.includes('LIQUIDADA') && tem(PERM.ncLiquidar);
  const podeCancelar = permitidas.includes('CANCELADA') && tem(PERM.ncCancelar);

  const ligacaoLancamento = (lancamentoId: string, texto: string) => (
    <Link href={`/contabilidade/lancamentos/${lancamentoId}`} className="text-primary underline">
      {texto}
    </Link>
  );

  const tabLinhas = (
    <LinhasDocumento
      linhas={nc.linhas.map((l) => ({
        id: l.id,
        descricao: l.descricao,
        quantidade: l.quantidade.toString(),
        precoUnitario: l.precoUnitario.toString(),
        desconto: l.desconto.toString(),
        taxaIva: l.taxaIva.toString(),
        total: l.total.toString(),
      }))}
      subtotal={nc.subtotal.toString()}
      descontoTotal={nc.descontoTotal.toString()}
      ivaTotal={nc.ivaTotal.toString()}
      total={nc.total.toString()}
    />
  );

  const tabDetalhes = (
    <div className="space-y-4 text-sm">
      <Campo rotulo="Motivo da nota">
        <p className="whitespace-pre-wrap">{nc.motivo}</p>
      </Campo>
      <Campo rotulo="Observações">
        <p className="whitespace-pre-wrap">
          {nc.observacoes || <span className="text-muted-foreground">Sem observações.</span>}
        </p>
      </Campo>
      {nc.lancamentoId && (
        <Campo rotulo="Lançamento da emissão">
          {ligacaoLancamento(nc.lancamentoId, 'Ver lançamento')}
        </Campo>
      )}

      {nc.status === 'LIQUIDADA' && (
        <div className="rounded-lg border bg-muted/40 p-4 space-y-3" data-testid="nc-liquidacao">
          <p className="font-medium">Liquidação</p>
          <Campo rotulo="Forma">
            {nc.formaLiquidacao ? ROTULO_FORMA_LIQUIDACAO[nc.formaLiquidacao] : '—'}
          </Campo>
          <Campo rotulo="Data">{nc.dataLiquidacao ? formatarData(nc.dataLiquidacao) : '—'}</Campo>
          {nc.lancamentoLiquidacaoId ? (
            <Campo rotulo="Lançamento da devolução">
              {ligacaoLancamento(nc.lancamentoLiquidacaoId, 'Ver lançamento')}
            </Campo>
          ) : nc.formaLiquidacao === 'COMPENSACAO' ? (
            <p className="text-muted-foreground">
              Sem lançamento próprio: o crédito abateu à factura original ou ao documento da troca,
              e a conta de clientes já tinha sido creditada na emissão da nota. Só a parte devolvida
              em numerário teria lançamento.
            </p>
          ) : null}
        </div>
      )}

      {nc.status === 'CANCELADA' && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3"
          data-testid="nc-cancelamento"
        >
          <p className="font-medium">Cancelamento</p>
          <Campo rotulo="Motivo">
            <p className="whitespace-pre-wrap">{nc.motivoCancelamento ?? '—'}</p>
          </Campo>
          {nc.lancamentoEstornoId && (
            <Campo rotulo="Estorno do lançamento">
              {ligacaoLancamento(nc.lancamentoEstornoId, 'Ver estorno')}
            </Campo>
          )}
        </div>
      )}
    </div>
  );

  const metadata = [
    { label: 'Número', value: <span className="font-mono font-medium">{nc.numero}</span> },
    { label: 'Cliente', value: clienteNome ?? '—' },
    {
      label: 'Factura original',
      value: (
        <Link href={`/faturacao/${nc.faturaOriginal.id}`} className="font-mono text-primary underline">
          {nc.faturaOriginal.numero}
        </Link>
      ),
    },
    { label: 'Data de Emissão', value: formatarData(nc.dataEmissao) },
    { label: 'Moeda', value: nc.moeda },
    {
      label: 'Total',
      value: <span className="font-semibold tabular-nums">{formatMZN(nc.total.toString())}</span>,
    },
  ];

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={`Nota de crédito ${nc.numero}`}
            description={`Corrige a factura ${nc.faturaOriginal.numero}${clienteNome ? ` · ${clienteNome}` : ''}`}
            breadcrumbs={[
              { label: 'Faturação', href: '/faturacao' },
              { label: 'Notas de Crédito', href: '/faturacao/nota-credito' },
              { label: nc.numero },
            ]}
            badge={<StatusBadge status={nc.status} />}
            actions={
              <AcoesNotaCredito id={nc.id} podeLiquidar={podeLiquidar} podeCancelar={podeCancelar} />
            }
          />
        }
        tabs={[
          { key: 'linhas', label: 'Linhas', count: nc.linhas.length, content: tabLinhas },
          { key: 'detalhes', label: 'Detalhes', content: tabDetalhes },
        ]}
        defaultTab={nc.status === 'EMITIDA' || nc.status === 'RASCUNHO' ? 'linhas' : 'detalhes'}
        metadata={metadata}
      />
    </div>
  );
}
