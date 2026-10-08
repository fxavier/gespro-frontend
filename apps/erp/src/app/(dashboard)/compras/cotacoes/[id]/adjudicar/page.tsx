/**
 * Adjudicar Cotação (#109) — Server Component (NUNCA 'use client').
 *
 * Rota própria (recolhe a escolha do vencedor). Só oferece os fornecedores convidados que
 * responderam — o serviço recusa os outros. Fora de RESPONDIDA ou sem a permissão
 * `compras:cotacao:adjudicar`, volta ao detalhe.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { AdjudicarCotacaoForm } from './_components/adjudicar-cotacao-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdjudicarCotacaoPage({ params }: Props) {
  const { id } = await params;

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
  const respondentes = cotacao.fornecedores
    .filter((f) => f.status === 'RESPONDIDA')
    .map((f) => ({
      fornecedorId: f.fornecedorId,
      nome: f.fornecedorNome,
      valorTotal: f.valorTotal,
      prazoEntregaDias: f.prazoEntregaDias,
    }));

  if (
    cotacao.status !== 'RESPONDIDA' ||
    respondentes.length === 0 ||
    !permissions.includes('compras:cotacao:adjudicar')
  ) {
    redirect(detalhe);
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Adjudicar cotação ${cotacao.numero}`}
        description="Escolha o fornecedor vencedor entre os que responderam"
        breadcrumbs={[
          { label: 'Compras', href: '/compras' },
          { label: 'Cotações', href: '/compras/cotacoes' },
          { label: cotacao.numero, href: detalhe },
          { label: 'Adjudicar' },
        ]}
        badge={<StatusBadge status={cotacao.status} />}
      />

      <AdjudicarCotacaoForm cotacaoId={cotacao.id} respondentes={respondentes} />
    </div>
  );
}
