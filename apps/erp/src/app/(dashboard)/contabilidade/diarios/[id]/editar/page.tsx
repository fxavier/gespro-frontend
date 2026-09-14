/**
 * Editar Diário Contabilístico — Server Component.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { PageHeader } from '@/components/patterns';
import { DiarioForm } from '../../_components/diario-form';

export default async function EditarDiarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const { id } = await params;
  const ctx = { tenantId, userId };

  const diario = await runWithTenantContext(ctx, () => contabilidadeService.obterDiario(id, ctx));
  if (!diario) notFound();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Editar ${diario.codigo} — ${diario.nome}`}
        description="Actualizar dados do diário contabilístico"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Diários', href: '/contabilidade/diarios' },
          { label: diario.codigo, href: `/contabilidade/diarios/${diario.id}` },
          { label: 'Editar' },
        ]}
      />

      <DiarioForm
        diarioId={diario.id}
        valoresIniciais={{
          codigo: diario.codigo,
          nome: diario.nome,
          tipo: diario.tipo,
          ativo: diario.ativo,
        }}
      />
    </div>
  );
}
