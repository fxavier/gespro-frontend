/**
 * Registar consumo de material numa Ordem de Produção (#164) — Server Component (NUNCA 'use client').
 *
 * Rota própria porque recolhe quantidades (formulário, não Dialog). A action existente
 * `registarConsumoOrdemAction` baixa o stock do armazém `MP` na mesma transacção em que grava o
 * consumo. Fora de LIBERADA/EM_PRODUCAO, ou sem `producao:ordens:update`, volta ao detalhe.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { OrdemProducaoService } from '@/server/services/pessoas-projetos/producao.service';
import { listarProdutos } from '@/server/services/inventario/catalogo.service';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { RegistarConsumoForm, type MaterialConsumo } from './_components/registar-consumo-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RegistarConsumoPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId, permissions } = session.user;
  const ctx = { tenantId, userId };

  let ordem;
  try {
    ordem = await runWithTenantContext(ctx, () => OrdemProducaoService.obter(id, ctx));
  } catch {
    notFound();
  }

  if (
    !['LIBERADA', 'EM_PRODUCAO'].includes(ordem.status) ||
    !permissions.includes('producao:ordens:update')
  ) {
    redirect(`/producao/ordens/${id}`);
  }

  // Primeira página para o ComboboxRemoto; o resto procura-se no servidor.
  const pagina = await runWithTenantContext(ctx, () =>
    listarProdutos({ ativo: true, take: 50, orderBy: 'nome', orderDir: 'asc' }, ctx),
  );
  const materiais: MaterialConsumo[] = pagina.items.map((p) => ({
    id: p.id,
    sku: p.sku,
    nome: p.nome,
    unidadeMedida: p.unidadeMedida,
    precoCompra: String(p.precoCompra),
  }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Registar consumo — ${ordem.numero}`}
        description="O material sai do armazém de matérias-primas no momento do registo"
        breadcrumbs={[
          { label: 'Produção', href: '/producao' },
          { label: 'Ordens de Produção', href: '/producao/ordens' },
          { label: ordem.numero, href: `/producao/ordens/${id}` },
          { label: 'Registar consumo' },
        ]}
        badge={<StatusBadge status={ordem.status} />}
      />

      <RegistarConsumoForm id={id} materiais={materiais} />
    </div>
  );
}
