/**
 * Nova Comunicação — Server Component.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ProjetoService } from '@/server/services/pessoas-projetos/projetos.service';
import { PageHeader } from '@/components/patterns';
import { NovaComunicacaoForm } from './_components/nova-comunicacao-form';

export default async function NovaComunicacaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { items: projetos } = await runWithTenantContext({ tenantId, userId }, () =>
    ProjetoService.listar({ take: 100 }, { tenantId, userId })
  );

  const projetosOpcoes = (projetos as Array<{ id: string; codigo: string; nome: string }>).map((p) => ({
    id: p.id,
    label: `${p.codigo} — ${p.nome}`,
  }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Comunicação"
        description="Registe uma reunião, ata, decisão ou anúncio de projecto"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Comunicações', href: '/projetos/comunicacoes' },
          { label: 'Nova Comunicação' },
        ]}
      />
      <NovaComunicacaoForm projetos={projetosOpcoes} />
    </div>
  );
}
