/**
 * Novo Motorista — Server Component (NUNCA 'use client').
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { MotoristaForm } from '../_components/motorista-form';

export default async function NovoMotoristaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Motorista"
        description="Registe um novo motorista na equipa"
        breadcrumbs={[
          { label: 'Transporte', href: '/transporte' },
          { label: 'Motoristas', href: '/transporte/motoristas' },
          { label: 'Novo Motorista' },
        ]}
      />
      <MotoristaForm />
    </div>
  );
}
