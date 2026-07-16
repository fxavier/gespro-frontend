/**
 * Qualidade de Projectos — Server Component.
 * Funcionalidade em desenvolvimento.
 */

import { ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader, EmptyState } from '@/components/patterns';

export default async function QualidadeProjetosPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Qualidade"
        description="Checklists, testes e controlo de qualidade dos projectos"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Qualidade' },
        ]}
      />
      <EmptyState
        icon={<ShieldCheck className="h-8 w-8" />}
        title="Gestão de qualidade em breve"
        description="O módulo de checklists e controlo de qualidade de projectos estará disponível brevemente."
      />
    </div>
  );
}
