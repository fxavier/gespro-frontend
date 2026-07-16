/**
 * Novo Ativo — Server Component.
 * Carrega categorias e localizações para popular os selects do formulário.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ativosService } from '@/server/services/inventario/ativos.service';
import { stockService } from '@/server/services/inventario/stock.service';
import { PageHeader } from '@/components/patterns';
import { NovoAtivoForm } from '../_components/novo-ativo-form';

export default async function NovoAtivoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const [categoriasResult, localizacoesResult] = await runWithTenantContext({ tenantId, userId }, () =>
    Promise.all([
      ativosService.listarCategorias({ take: 100 }, ctx),
      stockService.listarLocalizacoes({ take: 100, ativa: true }, ctx),
    ])
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Ativo"
        description="Adicione um novo equipamento ou bem ao inventário da empresa"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Ativos', href: '/inventario/ativos' },
          { label: 'Novo Ativo' },
        ]}
      />

      <NovoAtivoForm
        categorias={categoriasResult.items}
        localizacoes={localizacoesResult.items}
      />
    </div>
  );
}
