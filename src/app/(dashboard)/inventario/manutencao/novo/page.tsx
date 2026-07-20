/**
 * Nova Manutenção — Server Component.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ativosService } from '@/server/services/inventario/ativos.service';
import { PageHeader } from '@/components/patterns';
import { NovaManutencaoForm } from '../_components/nova-manutencao-form';

export default async function NovaManutencaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const ativosResult = await runWithTenantContext({ tenantId, userId }, () =>
    ativosService.listarAtivos({ take: 100, orderBy: 'nome', orderDir: 'asc' }, ctx)
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Manutenção"
        description="Agende uma nova manutenção para um ativo"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Manutenção', href: '/inventario/manutencao' },
          { label: 'Nova Manutenção' },
        ]}
      />

      <NovaManutencaoForm ativos={ativosResult.items} />
    </div>
  );
}
