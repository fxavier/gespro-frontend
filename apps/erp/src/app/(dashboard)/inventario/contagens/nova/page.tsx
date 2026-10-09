/**
 * Página de abertura de nova Contagem de Stock — Server Component (NUNCA 'use client').
 * Spec 05: formulário de criação de contagem cíclica de existências.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ativosService } from '@/server/services/inventario/ativos.service';
import { listarLocalizacoes } from '@/server/services/inventario/stock.service';
import { listarCategorias } from '@/server/services/inventario/catalogo.service';
import { PageHeader } from '@/components/patterns';
import { NovaContagemForm } from './_components/nova-contagem-form';

export default async function NovaContagemPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { id: userId, tenantId } = session.user;
  const ctx = { tenantId, userId };

  // #265: o responsável escolhe-se numa combobox — os utilizadores activos do tenant são poucos,
  // filtrados no cliente.
  const utilizadores = await runWithTenantContext(ctx, () => ativosService.procurarResponsaveis('', ctx));

  // #101: localização e categoria escolhem-se numa combobox local. As duas listas são curtas
  // (armazéns limitados pelo plano; categorias de produto), lidas página a página para que
  // nenhuma fique inalcançável por estar fora da primeira.
  const opcoesLocalizacao: { value: string; label: string }[] = [];
  const opcoesCategoria: { value: string; label: string }[] = [];
  await runWithTenantContext(ctx, async () => {
    let cursor: string | undefined;
    do {
      const pagina = await listarLocalizacoes({ ativa: true, take: 100, cursor }, ctx);
      opcoesLocalizacao.push(...pagina.items.map((l) => ({ value: l.id, label: `${l.nome} (${l.codigo})` })));
      cursor = pagina.nextCursor ?? undefined;
    } while (cursor);
    cursor = undefined;
    do {
      const pagina = await listarCategorias({ ativo: true, take: 100, cursor }, ctx);
      opcoesCategoria.push(...pagina.items.map((c) => ({ value: c.id, label: c.nome })));
      cursor = pagina.nextCursor ?? undefined;
    } while (cursor);
  });

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Contagem de Stock"
        description="Inicie uma contagem cíclica de existências"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Contagens de Stock', href: '/inventario/contagens' },
          { label: 'Nova' },
        ]}
      />

      <NovaContagemForm
        userId={userId}
        opcoesResponsavel={utilizadores.map((u) => ({ value: u.id, label: u.detalhe ? `${u.nome} — ${u.detalhe}` : u.nome }))}
        opcoesLocalizacao={opcoesLocalizacao}
        opcoesCategoria={opcoesCategoria}
      />
    </div>
  );
}
