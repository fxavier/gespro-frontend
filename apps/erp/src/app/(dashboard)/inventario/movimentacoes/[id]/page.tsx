/**
 * Detalhe de Movimentação de Stock — Server Component (NUNCA 'use client').
 * Dados reais via prisma.movimentoStock.findFirst (stockService não expõe obterMovimento).
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { DetailShell, PageHeader, StatusBadge } from '@/components/patterns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ArrowRightLeft, Package, MapPin } from 'lucide-react';

const TIPO_LABELS: Record<string, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Ajuste',
  TRANSFERENCIA_ENTRADA: 'Transferência (entrada)',
  TRANSFERENCIA_SAIDA: 'Transferência (saída)',
};

const TIPO_VARIANTES: Record<string, 'default' | 'secondary' | 'outline'> = {
  ENTRADA: 'default',
  SAIDA: 'secondary',
  AJUSTE: 'outline',
  TRANSFERENCIA_ENTRADA: 'default',
  TRANSFERENCIA_SAIDA: 'secondary',
};

function formatDate(value: Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-MZ');
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MovimentacaoDetalhePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;

  const movimento = await runWithTenantContext({ tenantId, userId }, () =>
    prisma.movimentoStock.findFirst({
      where: { id, tenantId },
      include: {
        produto: { select: { nome: true, sku: true } },
        localizacaoOrigem: { select: { nome: true, codigo: true } },
        localizacaoDestino: { select: { nome: true, codigo: true } },
      },
    })
  );

  if (!movimento) notFound();

  const tipoLabel = TIPO_LABELS[movimento.tipo] ?? movimento.tipo;
  const tipoVariant = TIPO_VARIANTES[movimento.tipo] ?? 'outline';

  const tabDetalhes = (
    <div className="space-y-4">
      {/* Produto e quantidade */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Produto e Quantidade
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Produto</p>
              <p className="text-sm font-medium">{movimento.produto.nome}</p>
              <p className="text-xs text-muted-foreground mt-0.5">SKU: {movimento.produto.sku}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Quantidade</p>
              <p className="text-2xl font-bold tabular-nums">{movimento.quantidade.toString()}</p>
            </div>
            {movimento.varianteProdutoId && (
              <div>
                <p className="text-xs text-muted-foreground">Variante</p>
                <p className="text-sm font-mono">{movimento.varianteProdutoId}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Origens e destinos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Localizações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Origem</p>
              <p className="text-sm font-medium">
                {movimento.localizacaoOrigem
                  ? `${movimento.localizacaoOrigem.codigo} — ${movimento.localizacaoOrigem.nome}`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Destino</p>
              <p className="text-sm font-medium">
                {movimento.localizacaoDestino
                  ? `${movimento.localizacaoDestino.codigo} — ${movimento.localizacaoDestino.nome}`
                  : '—'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detalhes adicionais */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Detalhes da Operação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {movimento.motivo && (
            <div>
              <p className="text-xs text-muted-foreground">Motivo</p>
              <p className="text-sm">{movimento.motivo}</p>
            </div>
          )}
          {movimento.observacoes && (
            <>
              {movimento.motivo && <Separator />}
              <div>
                <p className="text-xs text-muted-foreground">Observações</p>
                <p className="text-sm">{movimento.observacoes}</p>
              </div>
            </>
          )}
          {movimento.documentoReferenciaId && (
            <>
              <Separator />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Documento de referência</p>
                  <p className="text-sm font-mono">{movimento.documentoReferenciaId}</p>
                </div>
                {movimento.documentoReferenciaTipo && (
                  <div>
                    <p className="text-xs text-muted-foreground">Tipo de documento</p>
                    <p className="text-sm">{movimento.documentoReferenciaTipo}</p>
                  </div>
                )}
              </div>
            </>
          )}
          {movimento.transferenciaRefId && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground">Referência de transferência</p>
                <p className="text-sm font-mono">{movimento.transferenciaRefId}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={`Movimentação #${id.slice(-8).toUpperCase()}`}
            description={`${tipoLabel} — ${movimento.produto.nome}`}
            breadcrumbs={[
              { label: 'Inventário', href: '/inventario' },
              { label: 'Movimentações', href: '/inventario/movimentacoes' },
              { label: id.slice(-8).toUpperCase() },
            ]}
            badge={<StatusBadge status={movimento.tipo} variant={tipoVariant} label={tipoLabel} />}
          />
        }
        tabs={[
          {
            key: 'detalhes',
            label: 'Detalhes',
            content: tabDetalhes,
          },
        ]}
        metadata={[
          { label: 'Tipo', value: <StatusBadge status={movimento.tipo} variant={tipoVariant} label={tipoLabel} /> },
          { label: 'Produto', value: movimento.produto.nome },
          { label: 'Quantidade', value: <span className="tabular-nums font-medium">{movimento.quantidade.toString()}</span> },
          { label: 'Criado por', value: <span className="font-mono text-xs">{movimento.criadoPor.slice(0, 8)}…</span> },
          { label: 'Data', value: formatDate(movimento.createdAt) },
        ]}
      />
    </div>
  );
}
