/**
 * Converter Requisição em Pedido (#110) — Server Component (NUNCA 'use client').
 *
 * Rota própria (recolhe a escolha da cotação). Só oferece as cotações ADJUDICADAS desta
 * requisição — o serviço recusa as de outra. Fora de APROVADA ou sem a permissão
 * `compras:pedido:criar`, volta ao detalhe.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { PageHeader, StatusBadge, EmptyState } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { ConverterRequisicaoForm } from './_components/converter-requisicao-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ConverterRequisicaoPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId, permissions } = session.user;
  const ctx = { tenantId, userId };

  let requisicao;
  try {
    requisicao = await runWithTenantContext(ctx, () => comprasService.obterRequisicao(id, ctx));
  } catch {
    notFound();
  }
  if (!requisicao) notFound();

  const detalhe = `/compras/requisicoes/${id}`;
  if (requisicao.status !== 'APROVADA' || !permissions.includes('compras:pedido:criar')) {
    redirect(detalhe);
  }

  const cotacoes = await runWithTenantContext(ctx, () =>
    comprasService.listarCotacoesAdjudicadasDaRequisicao(id, ctx)
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Converter requisição ${requisicao.numero} em pedido`}
        description="O pedido nasce em rascunho, com o fornecedor vencedor da cotação escolhida"
        breadcrumbs={[
          { label: 'Compras', href: '/compras/requisicoes' },
          { label: 'Requisições', href: '/compras/requisicoes' },
          { label: requisicao.numero, href: detalhe },
          { label: 'Converter em pedido' },
        ]}
        badge={<StatusBadge status={requisicao.status} />}
      />

      {cotacoes.length === 0 ? (
        <EmptyState
          title="Sem cotações adjudicadas"
          description="Esta requisição ainda não tem nenhuma cotação adjudicada. Adjudique uma cotação ligada a ela antes de a converter."
          action={
            <Button variant="outline" size="sm" asChild>
              <a href={detalhe}>Voltar à requisição</a>
            </Button>
          }
        />
      ) : (
        <ConverterRequisicaoForm requisicaoId={id} cotacoes={cotacoes} />
      )}
    </div>
  );
}
