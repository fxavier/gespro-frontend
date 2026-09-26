/**
 * Nova Nota de Crédito — Server Component shell.
 * A série não se escolhe (#93): é a activa do tipo no ano da data de emissão.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovaNotaCreditoForm } from './_components/nova-nota-credito-form';

export default async function NovaNotaCreditoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Nota de Crédito"
        description="Emissão de nota de crédito sobre factura"
        breadcrumbs={[
          { label: 'Faturação', href: '/faturacao' },
          { label: 'Notas de Crédito', href: '/faturacao/nota-credito' },
          { label: 'Nova Nota de Crédito' },
        ]}
      />
      <NovaNotaCreditoForm />
    </div>
  );
}
