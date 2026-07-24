/**
 * Nova Regra de Comissão — Server Component shell.
 */
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovaRegraComissaoForm } from './_components/nova-regra-comissao-form';

export default async function NovaRegraComissaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Regra de Comissão"
        description="Defina as condições de cálculo de comissões"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Comissões', href: '/vendas/comissoes' },
          { label: 'Nova Regra' },
        ]}
      />
      <NovaRegraComissaoForm />
    </div>
  );
}
