/**
 * Nova Solicitação de Férias — Server Component wrapper.
 * Carrega os períodos aquisitivos disponíveis para popular o select.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { Button } from '@/components/ui/button';
import { PageHeader, EmptyState } from '@/components/patterns';
import NovaSolicitacaoFeriasForm from './_components/nova-solicitacao-ferias-form';

export default async function NovaSolicitacaoFeriasPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const periodos = await runWithTenantContext(ctx, () =>
    prisma.ferias.findMany({
      where: { tenantId },
      select: {
        id: true,
        periodoAquisitivoInicio: true,
        periodoAquisitivoFim: true,
        diasDisponiveis: true,
        diasUsados: true,
        colaborador: { select: { nome: true, codigo: true } },
      },
      orderBy: { periodoAquisitivoInicio: 'desc' },
    })
  );

  const opcoes = periodos.map((p) => ({
    id: p.id,
    colaboradorNome: p.colaborador.nome,
    colaboradorCodigo: p.colaborador.codigo,
    inicio: p.periodoAquisitivoInicio.toLocaleDateString('pt-PT'),
    fim: p.periodoAquisitivoFim.toLocaleDateString('pt-PT'),
    saldo: p.diasDisponiveis - p.diasUsados,
  }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Solicitar Férias"
        description="Submeter pedido de gozo de férias para um período aquisitivo"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Férias', href: '/rh/ferias' },
          { label: 'Nova' },
        ]}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/rh/ferias">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Cancelar
            </Link>
          </Button>
        }
      />

      {opcoes.length === 0 ? (
        <EmptyState
          title="Sem períodos aquisitivos"
          description="É preciso iniciar um período aquisitivo de férias para um colaborador antes de submeter uma solicitação de gozo."
        />
      ) : (
        <NovaSolicitacaoFeriasForm periodos={opcoes} />
      )}
    </div>
  );
}
