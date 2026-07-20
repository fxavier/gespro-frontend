/**
 * Novo Projecto — Server Component.
 *
 * A página não tem estado; o formulário interactivo vive em NovoProjetoForm
 * (Client Component). Padrão golden standard: page.tsx = Server Component.
 *
 * Anteriormente usava localStorage (padrão legado) — migrado para o serviço real.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovoProjetoForm } from './_components/novo-projeto-form';

export default async function NovoProjetoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Projecto"
        description="Preencha os campos abaixo para criar um novo projecto"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Novo Projecto' },
        ]}
      />

      <NovoProjetoForm />
    </div>
  );
}
