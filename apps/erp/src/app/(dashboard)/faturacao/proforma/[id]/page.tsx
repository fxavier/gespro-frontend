/**
 * Detalhe de Proforma — Server Component.
 *
 * A proforma NÃO é documento fiscal: o que dela nasce é que é. Daí não haver
 * edição aqui — há transições, e a conversão numa rota própria.
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { TRANSICOES_PROFORMA } from '@/server/services/financas/faturacao.interface';
import { clienteService } from '@/server/services/comercial/cliente.service';
import { PageHeader, StatusBadge, DetailShell } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';
import { LinhasDocumento } from '../../_components/linhas-documento';
import { AcoesProforma } from './_components/acoes-proforma';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProformaDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const proforma = await runWithTenantContext(ctx, () => faturacaoService.obterProforma(id, ctx));
  if (!proforma) notFound();

  let clienteNome = proforma.clienteId;
  try {
    const cliente = await runWithTenantContext(ctx, () =>
      clienteService.buscarPorId(proforma.clienteId, ctx)
    );
    if (cliente?.nome) clienteNome = cliente.nome;
  } catch {
    // cliente removido / cross-tenant — mantém o id como recurso
  }

  const permitidas = TRANSICOES_PROFORMA[proforma.status] ?? [];

  const tabLinhas = (
    <LinhasDocumento
      linhas={proforma.linhas.map((l) => ({
        id: l.id,
        descricao: l.descricao,
        quantidade: l.quantidade.toString(),
        precoUnitario: l.precoUnitario.toString(),
        desconto: l.desconto.toString(),
        taxaIva: l.taxaIva.toString(),
        total: l.total.toString(),
      }))}
      subtotal={proforma.subtotal.toString()}
      descontoTotal={proforma.descontoTotal.toString()}
      ivaTotal={proforma.ivaTotal.toString()}
      total={proforma.total.toString()}
    />
  );

  const tabDetalhes = (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Observações</p>
        <p className="whitespace-pre-wrap">
          {proforma.observacoes || <span className="text-muted-foreground">Sem observações.</span>}
        </p>
      </div>
      {proforma.faturaId && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Factura emitida
          </p>
          <Link href={`/faturacao/${proforma.faturaId}`} className="text-primary underline">
            Ver factura
          </Link>
        </div>
      )}
    </div>
  );

  const metadata = [
    { label: 'Número', value: <span className="font-mono font-medium">{proforma.numero}</span> },
    { label: 'Cliente', value: clienteNome },
    { label: 'Data de Emissão', value: formatarData(proforma.dataEmissao) },
    { label: 'Validade', value: formatarData(proforma.dataValidade) },
    { label: 'Moeda', value: proforma.moeda },
    {
      label: 'Total',
      value: <span className="font-semibold tabular-nums">{formatMZN(proforma.total.toString())}</span>,
    },
  ];

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={`Proforma ${proforma.numero}`}
            description={`Emitida a ${clienteNome}`}
            breadcrumbs={[
              { label: 'Faturação', href: '/faturacao' },
              { label: 'Proformas', href: '/faturacao/proforma' },
              { label: proforma.numero },
            ]}
            badge={<StatusBadge status={proforma.status} />}
            actions={
              <AcoesProforma
                id={proforma.id}
                numero={proforma.numero}
                podeEnviar={permitidas.includes('ENVIADA')}
                podeAceitar={permitidas.includes('ACEITE')}
                podeConverter={permitidas.includes('CONVERTIDA')}
              />
            }
          />
        }
        tabs={[
          { key: 'linhas', label: 'Linhas', count: proforma.linhas.length, content: tabLinhas },
          { key: 'detalhes', label: 'Detalhes', content: tabDetalhes },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
