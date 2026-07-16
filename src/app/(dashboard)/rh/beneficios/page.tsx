/**
 * Benefícios — Server Component (NUNCA 'use client').
 * Funcionalidade em desenvolvimento.
 */

import { Heart } from 'lucide-react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader, EmptyState } from '@/components/patterns';

export default async function BeneficiosPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Benefícios"
        description="Gestão de benefícios e regalias dos colaboradores"
        breadcrumbs={[
          { label: 'RH', href: '/rh' },
          { label: 'Benefícios' },
        ]}
      />
      <EmptyState
        icon={<Heart className="h-8 w-8" />}
        title="Gestão de benefícios em breve"
        description="O módulo de benefícios (seguro de saúde, subsídios, etc.) estará disponível brevemente."
      />
    </div>
  );
}
