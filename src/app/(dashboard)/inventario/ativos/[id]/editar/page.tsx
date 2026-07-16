/**
 * Editar Ativo — Server Component.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ativosService } from '@/server/services/inventario/ativos.service';
import { stockService } from '@/server/services/inventario/stock.service';
import { PageHeader } from '@/components/patterns';
import { EditarAtivoForm } from './_components/editar-ativo-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditarAtivoPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let ativo;
  try {
    ativo = await runWithTenantContext({ tenantId, userId }, () =>
      ativosService.obterAtivo(id, ctx)
    );
  } catch {
    notFound();
  }

  if (!ativo) notFound();
  if (ativo.estado === 'BAIXADO') redirect(`/inventario/ativos/${id}`);

  const [categoriasResult, localizacoesResult] = await runWithTenantContext({ tenantId, userId }, () =>
    Promise.all([
      ativosService.listarCategorias({ take: 100 }, ctx),
      stockService.listarLocalizacoes({ take: 100, ativa: true }, ctx),
    ])
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Editar ${ativo.nome}`}
        description={`Código interno: ${ativo.codigoInterno}`}
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Ativos', href: '/inventario/ativos' },
          { label: ativo.codigoInterno, href: `/inventario/ativos/${id}` },
          { label: 'Editar' },
        ]}
      />

      <EditarAtivoForm
        ativo={ativo}
        categorias={categoriasResult.items}
        localizacoes={localizacoesResult.items}
      />
    </div>
  );
}
