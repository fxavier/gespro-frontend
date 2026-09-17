/**
 * Abertura de Caixa — Server Component (shell).
 * O wizard interactivo vive em AberturaWizard (Client Component).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { AberturaWizard } from './_components/abertura-wizard';

export default async function AberturaCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ voltar?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  // `voltar` só aceita caminhos internos: o POS manda para aqui e quer o
  // operador de regresso ao terminal assim que o fundo estiver registado.
  const { voltar } = await searchParams;
  const destino = voltar && /^\/[a-z0-9/_-]*$/i.test(voltar) ? voltar : '/caixa';

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Abertura de Caixa"
        description="Registar abertura de turno e definir fundo inicial"
        breadcrumbs={[
          { label: 'Caixa', href: '/caixa' },
          { label: 'Abertura' },
        ]}
      />

      <AberturaWizard destino={destino} />
    </div>
  );
}
