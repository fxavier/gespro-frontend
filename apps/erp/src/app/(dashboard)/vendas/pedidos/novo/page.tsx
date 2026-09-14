/**
 * Nova Encomenda de Venda — Server Component.
 *
 * Carrega a primeira página de clientes, vendedores e produtos; a partir daí
 * as caixas de selecção pesquisam no servidor (há tenants com 4000 produtos).
 * Formulário interactivo em NovaEncomendaForm (Client Component).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { clienteService, vendedorService } from '@/server/services/comercial/index';
import { listarProdutos } from '@/server/services/inventario/catalogo.service';
import { PageHeader } from '@/components/patterns';
import {
  NovaEncomendaForm,
  type ClienteOpcao,
  type VendedorOpcao,
  type ProdutoOpcao,
} from '../_components/nova-encomenda-form';

export default async function NovaEncomendaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let clientes: ClienteOpcao[] = [];
  let vendedores: VendedorOpcao[] = [];
  let produtos: ProdutoOpcao[] = [];

  try {
    [clientes, vendedores, produtos] = await runWithTenantContext(ctx, async () => {
      const [c, v, p] = await Promise.all([
        clienteService.listar({ status: 'ATIVO', take: 20, orderBy: 'nome', order: 'asc' }, ctx),
        vendedorService.listar({ status: 'ATIVO', take: 20, orderBy: 'nome', order: 'asc' }, ctx),
        listarProdutos({ ativo: true, take: 20, orderBy: 'nome', orderDir: 'asc' }, ctx),
      ]);
      return [
        c.items.map((x) => ({ id: x.id, codigo: x.codigo, nome: x.nome })),
        v.items.map((x) => ({ id: x.id, nome: x.nome })),
        p.items.map((x) => ({
          id: x.id,
          nome: x.nome,
          sku: x.sku,
          precoVenda: x.precoVenda,
          taxaIva: x.taxaIva,
        })),
      ] as const;
    });
  } catch {
    // O formulário mostra as listas vazias e avisa.
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Encomenda de Venda"
        description="Preencha os campos abaixo para criar uma encomenda"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Encomendas', href: '/vendas/pedidos' },
          { label: 'Nova Encomenda' },
        ]}
      />

      <NovaEncomendaForm
        clientesIniciais={clientes}
        vendedoresIniciais={vendedores}
        produtosIniciais={produtos}
      />
    </div>
  );
}
