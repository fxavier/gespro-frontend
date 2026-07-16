/**
 * Novo Inventário Físico — Server Component (NUNCA 'use client').
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { stockService } from '@/server/services/inventario/stock.service';
import { ativosService } from '@/server/services/inventario/ativos.service';
import { NovaFisicoForm } from './_components/nova-fisico-form';

export default async function NovoInventarioFisicoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const [localizacoesResult, categoriasResult] = await runWithTenantContext({ tenantId, userId }, () =>
    Promise.all([
      stockService.listarLocalizacoes({ take: 100, ativa: true }, ctx),
      ativosService.listarCategorias({ take: 100 }, ctx),
    ])
  );

  return (
    <div className="p-6">
      <NovaFisicoForm
        userId={userId}
        localizacoes={localizacoesResult.items.map((l) => ({ id: l.id, nome: l.nome, codigo: l.codigo }))}
        categorias={categoriasResult.items.map((c) => ({ id: c.id, nome: c.nome }))}
      />
    </div>
  );
}
