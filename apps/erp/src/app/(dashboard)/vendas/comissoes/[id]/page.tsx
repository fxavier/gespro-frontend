/**
 * Detalhe de Comissão (#131) — Server Component (NUNCA 'use client').
 *
 * PENDENTE → «Aprovar»; APROVADA → «Marcar como paga» (ambos confirmados por AlertDialog).
 * Cancelar recolhe um motivo, logo é rota própria (`/cancelar`). PAGA e CANCELADA são terminais.
 * Pagar só muda o estado — não lança na contabilidade.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, XCircle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comissaoService } from '@/server/services/comercial/index';
import { NotFoundError } from '@/lib/errors';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMZN } from '@/lib/format-currency';
import { formatarDataHora } from '@/lib/format-date';
import { ComissaoAcoes } from './_components/comissao-acoes';

interface Props {
  params: Promise<{ id: string }>;
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function ComissaoDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId, permissions } = session.user;
  const ctx = { tenantId, userId };

  let comissao;
  try {
    comissao = await runWithTenantContext(ctx, () => comissaoService.obter(id, ctx));
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const podeGerir = permissions.includes('comissoes:gerir');
  const podePagar = permissions.includes('comissoes:pagar');
  const aberta = comissao.status === 'PENDENTE' || comissao.status === 'APROVADA';

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Comissão ${id.slice(-8)}`}
        description={`Comissão de ${formatMZN(comissao.valorComissao)} sobre a venda ${comissao.vendaId.slice(-8)}`}
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Comissões', href: '/vendas/comissoes' },
          { label: id.slice(-8) },
        ]}
        badge={<StatusBadge status={comissao.status} />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/vendas/comissoes">
                <ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Comissões
              </Link>
            </Button>
            {aberta && podeGerir && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/vendas/comissoes/${id}/cancelar`}>
                  <XCircle className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  Cancelar comissão
                </Link>
              </Button>
            )}
            <ComissaoAcoes
              id={id}
              status={comissao.status}
              podeAprovar={podeGerir}
              podePagar={podePagar}
            />
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da comissão</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Campo rotulo="Estado">
              <StatusBadge status={comissao.status} />
            </Campo>
            <Campo rotulo="Venda">
              <Link href={`/vendas/${comissao.vendaId}`} className="font-mono text-primary hover:underline">
                {comissao.vendaId.slice(-8)}
              </Link>
            </Campo>
            <Campo rotulo="Valor base">
              <span className="tabular-nums">{formatMZN(comissao.valorBase)}</span>
            </Campo>
            <Campo rotulo="Percentagem aplicada">
              <span className="tabular-nums">{parseFloat(comissao.percentualAplicado).toFixed(2)}%</span>
            </Campo>
            <Campo rotulo="Comissão">
              <span className="font-medium tabular-nums">{formatMZN(comissao.valorComissao)}</span>
            </Campo>
            <Campo rotulo="Regras aplicadas">
              {comissao.regrasAplicadas.length ? comissao.regrasAplicadas.join(', ') : '—'}
            </Campo>
            <Campo rotulo="Criada em">{formatarDataHora(comissao.createdAt)}</Campo>
            <Campo rotulo="Paga em">{formatarDataHora(comissao.pagoEm)}</Campo>
          </dl>
          <div className="mt-4 space-y-1">
            <p className="text-xs text-muted-foreground">
              {comissao.status === 'CANCELADA' ? 'Motivo do cancelamento' : 'Detalhes'}
            </p>
            <p className="text-sm whitespace-pre-line">{comissao.detalhes || '—'}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
