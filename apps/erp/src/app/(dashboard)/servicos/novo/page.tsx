/**
 * Página de criação de serviço — Server Component (NUNCA 'use client').
 */

import { exigirSessaoDeTenant } from '@/server/auth/sessao-tenant';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { servicoService } from '@/server/services/compras/servico.service';
import { PageHeader } from '@/components/patterns';
import { NovoServicoForm } from '../_components/novo-servico-form';

export default async function NovoServicoPage() {
  const { session, tenantId } = await exigirSessaoDeTenant();

  const ctx = { tenantId, userId: session.user.id };
  const categorias = (await runWithTenantContext(ctx, () => servicoService.listarCategorias(ctx)))
    .filter((c) => c.ativo)
    .map((c) => ({ id: c.id, nome: c.nome }));

  return (
    <div className="flex flex-col min-h-full">
      <div className="p-6 pb-0">
        <PageHeader
          title="Novo Serviço"
          description="Preencha os dados do novo serviço"
          breadcrumbs={[
            { label: 'Serviços', href: '/servicos/lista' },
            { label: 'Novo Serviço' },
          ]}
        />
      </div>
      <NovoServicoForm categorias={categorias} />
    </div>
  );
}
