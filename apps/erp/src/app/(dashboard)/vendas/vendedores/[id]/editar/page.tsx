/**
 * Editar Vendedor (#131) — Server Component (NUNCA 'use client').
 * Formulário interactivo em EditarVendedorForm (Client Component).
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { vendedorService } from '@/server/services/comercial/index';
import { NotFoundError } from '@/lib/errors';
import { PageHeader } from '@/components/patterns';
import { EditarVendedorForm } from './_components/editar-vendedor-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditarVendedorPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId, permissions } = session.user;
  const ctx = { tenantId, userId };

  let vendedor;
  try {
    vendedor = await runWithTenantContext(ctx, () => vendedorService.obter(id, ctx));
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const perfil = `/vendas/vendedores/${id}`;
  if (!permissions.includes('vendas:vendedores:editar')) redirect(perfil);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Editar Vendedor"
        description={vendedor.nome}
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Vendedores', href: '/vendas/vendedores' },
          { label: vendedor.nome, href: perfil },
          { label: 'Editar' },
        ]}
      />

      <EditarVendedorForm
        id={id}
        valores={{
          nome: vendedor.nome,
          email: vendedor.email,
          telefone: vendedor.telefone,
          metaMensal: vendedor.metaMensal != null ? Number(vendedor.metaMensal) : null,
          status: vendedor.status as 'ATIVO' | 'INATIVO' | 'SUSPENSO',
          observacoes: vendedor.observacoes,
        }}
      />
    </div>
  );
}
