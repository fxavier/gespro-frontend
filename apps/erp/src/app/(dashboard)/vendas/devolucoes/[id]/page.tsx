/**
 * Detalhe de Devolução — Server Component.
 *
 * Acções por estado (#130): PENDENTE aprova-se ou rejeita-se (AlertDialog); APROVADA processa-se
 * (rota própria, escolhe a localização) ou, com factura, converte-se numa troca (rota de nova
 * troca). PROCESSADA e REJEITADA são finais.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { devolucaoService } from '@/server/services/comercial/index';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatarDataExtensa } from '@/lib/format-date';
import { DevolucaoAcoes } from '../_components/devolucao-acoes';

const MOTIVO_LABELS: Record<string, string> = {
  DEFEITO: 'Defeito',
  PRODUTO_ERRADO: 'Produto errado',
  INSATISFACAO: 'Insatisfação',
  EXCESSO_PEDIDO: 'Excesso de pedido',
  AVARIA_TRANSPORTE: 'Avaria no transporte',
  OUTRO: 'Outro',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DevolucaoDetalhePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;

  const devolucao = await runWithTenantContext({ tenantId, userId }, () =>
    devolucaoService.obter(id, { tenantId, userId })
  ).catch(() => null);

  if (!devolucao) notFound();
  const pendente = devolucao.status === 'PENDENTE';
  const aprovada = devolucao.status === 'APROVADA';
  const rejeitada = devolucao.status === 'REJEITADA';

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Devolução ${devolucao.numero}`}
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Devoluções', href: '/vendas/devolucoes' },
          { label: devolucao.numero },
        ]}
        actions={
          pendente ? (
            <div className="flex items-center gap-2">
              <DevolucaoAcoes id={devolucao.id} numero={devolucao.numero} />
            </div>
          ) : aprovada ? (
            <div className="flex items-center gap-2">
              {devolucao.faturaId && (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/vendas/trocas/nova?devolucao=${devolucao.id}`}>Criar Troca</Link>
                </Button>
              )}
              <Button asChild size="sm">
                <Link href={`/vendas/devolucoes/${devolucao.id}/processar`}>Processar</Link>
              </Button>
            </div>
          ) : null
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Estado</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <StatusBadge status={devolucao.status} />
            {devolucao.reembolso && (
              <Badge variant="outline">Reembolso</Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Motivo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{MOTIVO_LABELS[devolucao.motivo] ?? devolucao.motivo}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              MT{' '}
              {parseFloat(devolucao.valorTotal).toLocaleString('pt-MZ', {
                minimumFractionDigits: 2,
              })}
            </p>
          </CardContent>
        </Card>
      </div>

      {devolucao.observacoes && (
        <Card>
          <CardHeader>
            <CardTitle>Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{devolucao.observacoes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Itens Devolvidos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">Produto</th>
                  <th className="text-right py-2 font-medium">Qtd.</th>
                  <th className="text-right py-2 font-medium">Valor Unit.</th>
                  <th className="text-right py-2 font-medium">IVA</th>
                  <th className="text-right py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {devolucao.itens.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-3">
                      <div>
                        <p className="font-medium">{item.nomeProduto}</p>
                        {item.sku && (
                          <p className="text-muted-foreground text-xs">{item.sku}</p>
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-right tabular-nums">{item.quantidade}</td>
                    <td className="py-3 text-right tabular-nums">
                      MT{' '}
                      {parseFloat(item.valorUnitario).toLocaleString('pt-MZ', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-3 text-right tabular-nums">
                      MT{' '}
                      {parseFloat(item.ivaItem).toLocaleString('pt-MZ', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-3 text-right tabular-nums font-medium">
                      MT{' '}
                      {parseFloat(item.total).toLocaleString('pt-MZ', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {(devolucao.aprovadoEm || devolucao.processadoEm) && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {devolucao.aprovadoEm && (
              <p>
                {/* A rejeição carimba os mesmos campos: quem decidiu e quando. */}
                {rejeitada ? 'Rejeitada em ' : 'Aprovada em '}
                {formatarDataExtensa(devolucao.aprovadoEm)}
              </p>
            )}
            {devolucao.processadoEm && (
              <p>Processada em {formatarDataExtensa(devolucao.processadoEm)}</p>
            )}
            {devolucao.notaCreditoId && (
              <p>
                <Link
                  href={`/faturacao/nota-credito/${devolucao.notaCreditoId}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Ver nota de crédito
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
