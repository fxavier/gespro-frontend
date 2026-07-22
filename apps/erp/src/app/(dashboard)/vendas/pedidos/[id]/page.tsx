/**
 * Detalhe de Encomenda de Venda — Server Component.
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { encomendaService } from '@/server/services/comercial/index';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EncomendaDetalhePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;

  const encomenda = await runWithTenantContext({ tenantId, userId }, () =>
    encomendaService.obter(id, { tenantId, userId })
  ).catch(() => null);

  if (!encomenda) notFound();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Encomenda ${encomenda.numero}`}
        description={`Estado: ${encomenda.status}`}
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Encomendas', href: '/vendas/pedidos' },
          { label: encomenda.numero },
        ]}
        actions={
          encomenda.status === 'RASCUNHO' ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/vendas/pedidos/${id}/editar`}>Editar</Link>
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Estado</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusBadge status={encomenda.status} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              MT {parseFloat(encomenda.total).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Data Prevista</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg">
              {encomenda.dataPrevista
                ? new Date(encomenda.dataPrevista).toLocaleDateString('pt-MZ')
                : 'Não definida'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Itens da Encomenda</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">Produto</th>
                  <th className="text-right py-2 font-medium">Qtd.</th>
                  <th className="text-right py-2 font-medium">Preço Unit.</th>
                  <th className="text-right py-2 font-medium">IVA</th>
                  <th className="text-right py-2 font-medium">Total</th>
                  <th className="text-right py-2 font-medium">Entregue</th>
                </tr>
              </thead>
              <tbody>
                {encomenda.itens.map((item) => (
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
                      MT {parseFloat(item.precoUnitario).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 text-right tabular-nums">
                      MT {parseFloat(item.ivaItem).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 text-right tabular-nums font-medium">
                      MT {parseFloat(item.total).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 text-right tabular-nums text-muted-foreground">
                      {item.quantidadeEntregue}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} />
                  <td className="py-2 text-right font-medium">IVA Total</td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    MT {parseFloat(encomenda.iva).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                  </td>
                  <td />
                </tr>
                <tr>
                  <td colSpan={3} />
                  <td className="py-2 text-right font-bold">Total</td>
                  <td className="py-2 text-right tabular-nums font-bold">
                    MT {parseFloat(encomenda.total).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {encomenda.notas && (
        <Card>
          <CardHeader>
            <CardTitle>Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{encomenda.notas}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
