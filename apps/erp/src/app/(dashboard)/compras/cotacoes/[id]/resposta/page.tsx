/**
 * Registar resposta de fornecedor a uma Cotação (#109) — Server Component (NUNCA 'use client').
 *
 * Rota própria (recolhe dados: preço por item e prazo), uma por fornecedor convidado:
 * `/compras/cotacoes/<id>/resposta?fornecedorId=<id>`. Fora de ENVIADA/RESPONDIDA, sem a
 * permissão `compras:cotacao:resposta` ou com um fornecedor não convidado, volta ao detalhe.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { RegistarRespostaForm } from './_components/registar-resposta-form';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RegistarRespostaCotacaoPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { fornecedorId: bruto } = await searchParams;
  const fornecedorId = Array.isArray(bruto) ? bruto[0] : bruto;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId, permissions } = session.user;

  let cotacao;
  try {
    cotacao = await runWithTenantContext({ tenantId, userId }, () =>
      comprasService.obterCotacao(id, { tenantId, userId })
    );
  } catch {
    notFound();
  }
  if (!cotacao) notFound();

  const detalhe = `/compras/cotacoes/${id}`;
  const convite = cotacao.fornecedores.find((f) => f.fornecedorId === fornecedorId);
  if (
    !convite ||
    !['ENVIADA', 'RESPONDIDA'].includes(cotacao.status) ||
    !permissions.includes('compras:cotacao:resposta')
  ) {
    redirect(detalhe);
  }

  // Uma resposta anterior deste fornecedor pré-preenche o formulário (a nova substitui-a).
  const itens = cotacao.itens.map((item) => {
    const anterior = item.respostas.find((r) => r.fornecedorId === convite.fornecedorId);
    return {
      id: item.id,
      descricao: item.descricao,
      quantidade: item.quantidade,
      unidadeMedida: item.unidadeMedida,
      precoAnterior: anterior ? anterior.precoUnitario : null,
    };
  });

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Registar resposta — ${convite.fornecedorNome}`}
        description={`Preços e prazo propostos por ${convite.fornecedorNome} para a cotação ${cotacao.numero}`}
        breadcrumbs={[
          { label: 'Compras', href: '/compras' },
          { label: 'Cotações', href: '/compras/cotacoes' },
          { label: cotacao.numero, href: detalhe },
          { label: 'Registar resposta' },
        ]}
        badge={<StatusBadge status={cotacao.status} />}
      />

      <RegistarRespostaForm
        cotacaoId={cotacao.id}
        fornecedorId={convite.fornecedorId}
        itens={itens}
        prazoAnterior={convite.prazoEntregaDias}
        condicoesAnteriores={convite.condicoesPagamento}
      />
    </div>
  );
}
