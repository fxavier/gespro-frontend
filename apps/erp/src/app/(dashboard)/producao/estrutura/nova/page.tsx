/**
 * Nova Estrutura de Produto (BOM) — Server Component wrapper.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { listarProdutos } from '@/server/services/inventario/catalogo.service';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import NovaEstruturaForm from './_components/nova-estrutura-form';

export default async function NovaEstruturaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  // #265: produto e componentes escolhem-se num `ComboboxRemoto` — primeira página aqui.
  const produtos = await runWithTenantContext(ctx, () =>
    listarProdutos({ ativo: true, take: 20, orderBy: 'nome', orderDir: 'asc' }, ctx),
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Estrutura de Produto"
        description="Definir lista de materiais (BOM) para um produto"
        breadcrumbs={[
          { label: 'Produção', href: '/producao' },
          { label: 'Estrutura', href: '/producao/estrutura' },
          { label: 'Nova' },
        ]}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/producao/estrutura">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Cancelar
            </Link>
          </Button>
        }
      />
      <NovaEstruturaForm produtosIniciais={produtos.items.map((p) => ({ id: p.id, nome: p.nome, sku: p.sku }))} />
    </div>
  );
}
