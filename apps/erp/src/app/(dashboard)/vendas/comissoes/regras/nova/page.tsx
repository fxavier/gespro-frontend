/**
 * Nova Regra de Comissão — Server Component shell.
 */
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { vendedorService } from '@/server/services/comercial/index';
import { PageHeader } from '@/components/patterns';
import { NovaRegraComissaoForm } from './_components/nova-regra-comissao-form';

export default async function NovaRegraComissaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  // Primeira página do `ComboboxRemoto` de vendedor (#265); o resto vem de `procurarVendedores`.
  const vendedores = await runWithTenantContext(ctx, () =>
    vendedorService.listar({ status: 'ATIVO', take: 20, orderBy: 'nome', order: 'asc' }, ctx),
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Regra de Comissão"
        description="Defina as condições de cálculo de comissões"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Comissões', href: '/vendas/comissoes' },
          { label: 'Nova Regra' },
        ]}
      />
      <NovaRegraComissaoForm vendedoresIniciais={vendedores.items.map((v) => ({ value: v.id, label: v.nome }))} />
    </div>
  );
}
