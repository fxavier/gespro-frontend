/**
 * Nova Cotação Comercial — Server Component shell.
 * A série não se escolhe (#93): é a activa do tipo no ano da data de emissão.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovaCotacaoForm } from './_components/nova-cotacao-form';

export default async function NovaCotacaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Cotação"
        description="Proposta ou orçamento para o cliente"
        breadcrumbs={[
          { label: 'Faturação', href: '/faturacao' },
          { label: 'Cotações', href: '/faturacao/cotacoes' },
          { label: 'Nova Cotação' },
        ]}
      />
      <NovaCotacaoForm />
    </div>
  );
}
