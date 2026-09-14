/**
 * Nova Cotação Comercial — Server Component shell.
 * Carrega as séries de documento para o formulário; o cliente é indicado por ID
 * (mesmo padrão de `faturacao/nova`, até haver pesquisa comercial integrada).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { PageHeader } from '@/components/patterns';
import { listarSeriesParaSelecao, type SerieOpcao } from '../../_lib/series';
import { NovaCotacaoForm } from './_components/nova-cotacao-form';

export default async function NovaCotacaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  let series: SerieOpcao[] = [];
  try {
    series = await runWithTenantContext({ tenantId, userId }, () =>
      listarSeriesParaSelecao('COTACAO_COMERCIAL', { tenantId, userId }),
    );
  } catch {
    // O formulário mostra lista de séries vazia.
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Cotação"
        description="Proposta ou orçamento para o cliente"
        breadcrumbs={[
          { label: 'Faturação', href: '/faturacao' },
          { label: 'Cotações', href: '/faturacao/cotacoes' },
          { label: 'Nova Cotação' },
        ]}
      />
      <NovaCotacaoForm series={series} />
    </div>
  );
}
