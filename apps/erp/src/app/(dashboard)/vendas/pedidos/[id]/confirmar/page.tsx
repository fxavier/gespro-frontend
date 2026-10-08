/**
 * Confirmar Encomenda de Venda — Server Component (#129).
 *
 * Só um RASCUNHO se confirma; noutro estado volta ao detalhe. A confirmação reserva o stock
 * numa localização, que se escolhe aqui (rota própria, sem modais).
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { encomendaService } from '@/server/services/comercial/index';
import { stockService } from '@/server/services/inventario/stock.service';
import { PageHeader } from '@/components/patterns';
import { ConfirmarEncomendaForm } from '../../_components/confirmar-encomenda-form';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ConfirmarEncomendaPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };
  const { id } = await params;

  const encomenda = await runWithTenantContext(ctx, () => encomendaService.obter(id, ctx)).catch(
    () => null,
  );
  if (!encomenda) notFound();
  if (encomenda.status !== 'RASCUNHO') redirect(`/vendas/pedidos/${id}`);

  const localizacoes = await runWithTenantContext(ctx, () =>
    stockService.listarLocalizacoes({ take: 100, ativa: true }, ctx),
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Confirmar Encomenda ${encomenda.numero}`}
        description="Escolha a localização onde o stock das linhas fica reservado"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Encomendas', href: '/vendas/pedidos' },
          { label: encomenda.numero, href: `/vendas/pedidos/${id}` },
          { label: 'Confirmar' },
        ]}
      />

      <ConfirmarEncomendaForm
        encomendaId={encomenda.id}
        localizacoes={localizacoes.items.map((l) => ({ id: l.id, codigo: l.codigo, nome: l.nome }))}
      />
    </div>
  );
}
