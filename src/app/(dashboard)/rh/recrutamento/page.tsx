/**
 * Recrutamento — Server Component (NUNCA 'use client').
 * Funcionalidade em desenvolvimento.
 */

import { Briefcase } from 'lucide-react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader, EmptyState } from '@/components/patterns';

export default async function RecrutamentoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Recrutamento"
        description="Gestão de vagas e processos de recrutamento"
        breadcrumbs={[
          { label: 'RH', href: '/rh' },
          { label: 'Recrutamento' },
        ]}
      />
      <EmptyState
        icon={<Briefcase className="h-8 w-8" />}
        title="Recrutamento em breve"
        description="O módulo de gestão de vagas e candidatos estará disponível brevemente."
      />
    </div>
  );
}
