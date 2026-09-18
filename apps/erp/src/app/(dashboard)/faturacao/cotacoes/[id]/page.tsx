/**
 * Detalhe de Cotação Comercial — Server Component.
 *
 * A listagem já apontava para cá e para `converter`/`rejeitar`; as rotas não
 * existiam e o menu dava 404 nas três entradas. As transições permitidas saem
 * da mesma máquina de estados que o serviço usa — o ecrã não inventa regras.
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { TRANSICOES_COTACAO_COMERCIAL } from '@/server/services/financas/faturacao.interface';
import { clienteService } from '@/server/services/comercial/cliente.service';
import { PageHeader, StatusBadge, DetailShell } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';
import { LinhasDocumento } from '../../_components/linhas-documento';
import { AcoesCotacao } from './_components/acoes-cotacao';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CotacaoDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const cotacao = await runWithTenantContext(ctx, () =>
    faturacaoService.obterCotacaoComercial(id, ctx)
  );
  if (!cotacao) notFound();

  let clienteNome = cotacao.clienteId;
  try {
    const cliente = await runWithTenantContext(ctx, () =>
      clienteService.buscarPorId(cotacao.clienteId, ctx)
    );
    if (cliente?.nome) clienteNome = cliente.nome;
  } catch {
    // cliente removido / cross-tenant — mantém o id como recurso
  }

  const permitidas = TRANSICOES_COTACAO_COMERCIAL[cotacao.status] ?? [];

  const tabLinhas = (
    <LinhasDocumento
      linhas={cotacao.linhas.map((l) => ({
        id: l.id,
        descricao: l.descricao,
        quantidade: l.quantidade.toString(),
        precoUnitario: l.precoUnitario.toString(),
        desconto: l.desconto.toString(),
        taxaIva: l.taxaIva.toString(),
        total: l.total.toString(),
      }))}
      subtotal={cotacao.subtotal.toString()}
      descontoTotal={cotacao.descontoTotal.toString()}
      ivaTotal={cotacao.ivaTotal.toString()}
      total={cotacao.total.toString()}
    />
  );

  const tabDetalhes = (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
          Condições comerciais
        </p>
        <p className="whitespace-pre-wrap">
          {cotacao.condicoesComerciais || <span className="text-muted-foreground">Sem condições registadas.</span>}
        </p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Observações</p>
        <p className="whitespace-pre-wrap">
          {cotacao.observacoes || <span className="text-muted-foreground">Sem observações.</span>}
        </p>
      </div>
      {cotacao.proformaId && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Proforma gerada
          </p>
          <Link href={`/faturacao/proforma/${cotacao.proformaId}`} className="text-primary underline">
            Ver proforma
          </Link>
        </div>
      )}
    </div>
  );

  const metadata = [
    { label: 'Número', value: <span className="font-mono font-medium">{cotacao.numero}</span> },
    { label: 'Cliente', value: clienteNome },
    { label: 'Data de Emissão', value: formatarData(cotacao.dataEmissao) },
    { label: 'Validade', value: formatarData(cotacao.dataValidade) },
    { label: 'Moeda', value: cotacao.moeda },
    {
      label: 'Total',
      value: <span className="font-semibold tabular-nums">{formatMZN(cotacao.total.toString())}</span>,
    },
  ];

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={`Cotação ${cotacao.numero}`}
            description={`Proposta a ${clienteNome}`}
            breadcrumbs={[
              { label: 'Faturação', href: '/faturacao' },
              { label: 'Cotações', href: '/faturacao/cotacoes' },
              { label: cotacao.numero },
            ]}
            badge={<StatusBadge status={cotacao.status} />}
            actions={
              <AcoesCotacao
                id={cotacao.id}
                numero={cotacao.numero}
                podeEnviar={permitidas.includes('ENVIADA')}
                podeAceitar={permitidas.includes('ACEITE')}
                podeRejeitar={permitidas.includes('REJEITADA')}
                podeConverter={permitidas.includes('CONVERTIDA')}
              />
            }
          />
        }
        tabs={[
          { key: 'linhas', label: 'Linhas', count: cotacao.linhas.length, content: tabLinhas },
          { key: 'detalhes', label: 'Detalhes', content: tabDetalhes },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
