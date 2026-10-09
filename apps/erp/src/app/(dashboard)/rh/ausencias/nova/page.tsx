/**
 * Nova Ausência — Server Component shell.
 */
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ColaboradorService } from '@/server/services/pessoas-projetos/rh.service';
import { PageHeader } from '@/components/patterns';
import { NovaAusenciaForm } from './_components/nova-ausencia-form';

export default async function NovaAusenciaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  // Primeira página do `ComboboxRemoto` de colaborador (#265); o resto vem da pesquisa.
  const colaboradores = await runWithTenantContext(ctx, () => ColaboradorService.listar({ take: 50 }, ctx));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Ausência"
        description="Registe uma ausência de um colaborador"
        breadcrumbs={[
          { label: 'RH', href: '/rh' },
          { label: 'Ausências', href: '/rh/ausencias' },
          { label: 'Nova' },
        ]}
      />
      <NovaAusenciaForm
        opcoesColaborador={colaboradores.items.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` }))}
      />
    </div>
  );
}
