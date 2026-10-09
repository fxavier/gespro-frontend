/**
 * Nova Devolução — Server Component.
 * Formulário interactivo em NovaDevolucaoForm (Client Component).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { listarProdutos } from '@/server/services/inventario/catalogo.service';
import { clientesIniciais } from '../../../faturacao/_components/clientes-iniciais';
import { PageHeader } from '@/components/patterns';
import { NovaDevolucaoForm } from '../_components/nova-devolucao-form';

export default async function NovaDevolucaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  // #265: cliente e produtos escolhem-se num `ComboboxRemoto` — primeira página aqui, o resto
  // pela pesquisa no servidor. A venda depende do cliente e procura-se pelo número.
  const [clientes, produtos] = await Promise.all([
    clientesIniciais(ctx),
    runWithTenantContext(ctx, () => listarProdutos({ ativo: true, take: 20, orderBy: 'nome', orderDir: 'asc' }, ctx)),
  ]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Devolução"
        description="Registe uma devolução de produtos"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Devoluções', href: '/vendas/devolucoes' },
          { label: 'Nova Devolução' },
        ]}
      />

      <NovaDevolucaoForm
        clientesIniciais={clientes}
        produtosIniciais={produtos.items.map((p) => ({
          id: p.id,
          nome: p.nome,
          sku: p.sku,
          precoVenda: p.precoVenda,
          taxaIva: p.taxaIva,
        }))}
      />
    </div>
  );
}
