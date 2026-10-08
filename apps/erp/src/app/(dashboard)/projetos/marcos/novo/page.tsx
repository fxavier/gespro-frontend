/**
 * Novo Marco (#167) — Server Component. Carrega a primeira página de projectos para o
 * `ComboboxRemoto`; o resto procura-se no servidor.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ProjetoService } from '@/server/services/pessoas-projetos/projetos.service';
import { PageHeader } from '@/components/patterns';
import { NovoMarcoForm } from './_components/novo-marco-form';

export default async function NovoMarcoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const projetos = await runWithTenantContext(ctx, () => ProjetoService.listar({ take: 50 }, ctx));
  const opcoesProjeto = projetos.items.map((p) => ({ value: p.id, label: `${p.codigo} — ${p.nome}` }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Marco"
        description="Definir um marco (milestone) num projecto"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Marcos', href: '/projetos/marcos' },
          { label: 'Novo' },
        ]}
      />
      <NovoMarcoForm opcoesProjeto={opcoesProjeto} />
    </div>
  );
}
