/**
 * Novo Centro de Trabalho — Server Component wrapper. #165.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import { CentroTrabalhoForm } from '../_components/centro-trabalho-form';

export default async function NovoCentroTrabalhoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Centro de Trabalho"
        breadcrumbs={[
          { label: 'Produção', href: '/producao' },
          { label: 'Centros de Trabalho', href: '/producao/centros-trabalho' },
          { label: 'Novo' },
        ]}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/producao/centros-trabalho">
              <ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Voltar
            </Link>
          </Button>
        }
      />
      <CentroTrabalhoForm />
    </div>
  );
}
