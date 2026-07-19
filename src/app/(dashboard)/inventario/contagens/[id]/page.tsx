/**
 * Detalhe de Contagem de Stock — Server Component (NUNCA 'use client').
 * Exibe itens, diferenças e acções de reconciliação/conclusão/cancelamento.
 */

import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { contagemStockService } from '@/server/services/inventario/contagem-stock.service';
import { PageHeader, StatusBadge, KpiCard } from '@/components/patterns';
import { ClipboardList, Package, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ItensTable } from './_components/itens-table';
import { ContagemAcoes } from './_components/contagem-acoes';

interface ContagemPageProps {
  params: Promise<{ id: string }>;
}

export default async function ContagemDetalhePage({ params }: ContagemPageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;

  const contagem = await runWithTenantContext({ tenantId, userId }, () =>
    contagemStockService.obter(id, { tenantId, userId })
  ).catch(() => null);

  if (!contagem) notFound();

  const dataAbertura = new Date(contagem.dataAbertura).toLocaleDateString('pt-MZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Contagem ${contagem.numero}`}
        description={`Aberta em ${dataAbertura}`}
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Contagens de Stock', href: '/inventario/contagens' },
          { label: contagem.numero },
        ]}
        badge={<StatusBadge status={contagem.status} />}
        actions={
          <ContagemAcoes contagemId={contagem.id} status={contagem.status} />
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          title="Total de Itens"
          value={String(contagem.totalItens)}
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <KpiCard
          title="Pendentes"
          value={String(contagem.itensPendentes)}
          icon={<Package className="h-4 w-4" />}
          description={contagem.itensPendentes > 0 ? 'Necessitam contagem ou justificação' : undefined}
        />
        <KpiCard
          title="Contados"
          value={String(contagem.itensContados)}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <KpiCard
          title="Com Diferença"
          value={String(contagem.itensComDiferenca)}
          icon={<AlertTriangle className="h-4 w-4" />}
          description={contagem.itensComDiferenca > 0 ? 'Requerem ajuste ou justificação' : undefined}
        />
      </div>

      {/* Metadados */}
      <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">Responsável: </span>
            <span className="font-medium">{contagem.responsavelId}</span>
          </div>
          {contagem.localizacaoId && (
            <div>
              <span className="text-muted-foreground">Localização: </span>
              <span className="font-medium">{contagem.localizacaoId}</span>
            </div>
          )}
          {contagem.categoriaId && (
            <div>
              <span className="text-muted-foreground">Categoria: </span>
              <span className="font-medium">{contagem.categoriaId}</span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Contagem Cega: </span>
            <span className="font-medium">{contagem.cega ? 'Sim' : 'Não'}</span>
          </div>
          {contagem.aprovadoPorId && (
            <div>
              <span className="text-muted-foreground">Aprovado por: </span>
              <span className="font-medium">{contagem.aprovadoPorId}</span>
            </div>
          )}
          {contagem.dataConclusao && (
            <div>
              <span className="text-muted-foreground">Concluída em: </span>
              <span className="font-medium">
                {new Date(contagem.dataConclusao).toLocaleDateString('pt-MZ', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </span>
            </div>
          )}
        </div>
        {contagem.observacoes && (
          <div className="text-sm">
            <span className="text-muted-foreground">Observações: </span>
            <span>{contagem.observacoes}</span>
          </div>
        )}
      </div>

      {/* Tabela de itens */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold">Itens de Contagem</h2>
        <Suspense fallback={<div className="h-48 rounded-lg border animate-pulse bg-muted/30" />}>
          <ItensTable
            contagemId={contagem.id}
            itens={contagem.itens}
            status={contagem.status}
            cega={contagem.cega}
          />
        </Suspense>
      </div>
    </div>
  );
}
