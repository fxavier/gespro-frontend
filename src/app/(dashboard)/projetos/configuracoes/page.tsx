/**
 * Configurações de Projectos — Server Component.
 * Funcionalidade em desenvolvimento.
 */

import { Settings } from 'lucide-react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader, EmptyState } from '@/components/patterns';

export default async function ConfiguracoesProjetosPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Configurações"
        description="Configurações globais do módulo de projectos"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Configurações' },
        ]}
      />
      <EmptyState
        icon={<Settings className="h-8 w-8" />}
        title="Configurações em breve"
        description="As configurações do módulo de projectos estarão disponíveis brevemente."
      />
    </div>
  );
}
