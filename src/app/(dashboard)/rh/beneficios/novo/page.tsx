/**
 * Novo Benefício — Server Component.
 * A página é Server Component; o formulário interactivo está em NovoBeneficioForm.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovoBeneficioForm } from './_components/novo-beneficio-form';

export default async function NovoBeneficioPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Benefício"
        description="Adicionar um benefício ao catálogo"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Benefícios', href: '/rh/beneficios' },
          { label: 'Novo Benefício' },
        ]}
      />

      <NovoBeneficioForm />
    </div>
  );
}
