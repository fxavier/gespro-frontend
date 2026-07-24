/**
 * Nova Formação — Server Component wrapper (NUNCA 'use client').
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import { NovaFormacaoForm } from './_components/nova-formacao-form';

export default async function NovaFormacaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Formação"
        description="Planear uma nova acção de formação"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Formações', href: '/rh/formacoes' },
          { label: 'Nova' },
        ]}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/rh/formacoes">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Cancelar
            </Link>
          </Button>
        }
      />
      <NovaFormacaoForm />
    </div>
  );
}
