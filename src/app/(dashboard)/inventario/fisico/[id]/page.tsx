/**
 * Detalhe de Inventário Físico — Server Component (NUNCA 'use client').
 * Dados reais via inventarioFisicoService.obterInventario().
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { inventarioFisicoService } from '@/server/services/inventario/inventario-fisico.service';
import { stockService } from '@/server/services/inventario/stock.service';
import { DetailShell, PageHeader, StatusBadge } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Edit, ClipboardList, Users, AlertTriangle } from 'lucide-react';
import type { InventarioFisicoDto } from '@/server/services/inventario/inventario-fisico.interface';

const STATUS_VARIANTES: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PLANEJADO: 'outline',
  AGENDADO: 'secondary',
  EM_ANDAMENTO: 'default',
  PAUSADO: 'secondary',
  CONCLUIDO: 'default',
  CANCELADO: 'destructive',
};

const STATUS_LABELS: Record<string, string> = {
  PLANEJADO: 'Planeado',
  AGENDADO: 'Agendado',
  EM_ANDAMENTO: 'Em andamento',
  PAUSADO: 'Pausado',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
};

function formatDate(value: Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-MZ');
}

function DetalhesTab({ inv, localizacaoNome }: { inv: InventarioFisicoDto; localizacaoNome: string | null }) {
  const progresso =
    inv.totalAtivosEsperados && inv.totalAtivosEsperados > 0
      ? Math.round(((inv.totalAtivosContados ?? 0) / inv.totalAtivosEsperados) * 100)
      : null;

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ativos esperados</p>
            <p className="text-2xl font-bold tabular-nums">{inv.totalAtivosEsperados ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Contados</p>
            <p className="text-2xl font-bold tabular-nums">{inv.totalAtivosContados ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Discrepâncias</p>
            <p className="text-2xl font-bold tabular-nums">{inv.totalDiscrepancias ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Progresso</p>
            <p className="text-2xl font-bold tabular-nums">{progresso !== null ? `${progresso}%` : '—'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Info geral */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Informações Gerais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {inv.descricao && (
            <>
              <div>
                <p className="text-xs text-muted-foreground">Descrição</p>
                <p className="text-sm">{inv.descricao}</p>
              </div>
              <Separator />
            </>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Data de início</p>
              <p className="text-sm font-medium">{formatDate(inv.dataInicio)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Data prevista de conclusão</p>
              <p className="text-sm font-medium">{formatDate(inv.dataPrevistaConclusao)}</p>
            </div>
            {inv.dataConclusao && (
              <div>
                <p className="text-xs text-muted-foreground">Concluído em</p>
                <p className="text-sm font-medium">{formatDate(inv.dataConclusao)}</p>
              </div>
            )}
            {localizacaoNome && (
              <div>
                <p className="text-xs text-muted-foreground">Localização principal</p>
                <p className="text-sm font-medium">{localizacaoNome}</p>
              </div>
            )}
            {inv.ajustesRealizados && (
              <div>
                <p className="text-xs text-muted-foreground">Ajustes realizados em</p>
                <p className="text-sm font-medium">{formatDate(inv.dataAjustes)}</p>
              </div>
            )}
          </div>
          {inv.observacoes && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground">Observações</p>
                <p className="text-sm">{inv.observacoes}</p>
              </div>
            </>
          )}
          {inv.motivoCancelamento && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground">Motivo de cancelamento</p>
                <p className="text-sm text-destructive">{inv.motivoCancelamento}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MembrosTab({ inv }: { inv: InventarioFisicoDto }) {
  if (inv.membros.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-muted-foreground">
        <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Nenhum membro atribuído.</p>
      </div>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Equipa ({inv.membros.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {inv.membros.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
              <span className="text-sm font-mono text-muted-foreground">{m.userId}</span>
              {m.localizacoesAtribuidas.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {m.localizacoesAtribuidas.length} localização(ões)
                </span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function DiscrepanciasTab({ inv }: { inv: InventarioFisicoDto }) {
  const total = inv.totalDiscrepancias ?? 0;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Resumo de Discrepâncias
          </CardTitle>
        </CardHeader>
        <CardContent>
          {total === 0 ? (
            <p className="text-sm text-muted-foreground">Sem discrepâncias registadas.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">
                <span className="font-medium tabular-nums">{total}</span> discrepância(s) encontrada(s).
              </p>
              {inv.ajustesRealizados && (
                <p className="text-sm text-muted-foreground">
                  Ajustes realizados a {formatDate(inv.dataAjustes)}.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InventarioFisicoDetalhePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;

  const inv = await runWithTenantContext({ tenantId, userId }, async () => {
    try {
      return await inventarioFisicoService.obterInventario(id, { tenantId, userId });
    } catch {
      return null;
    }
  });

  if (!inv) notFound();

  // Enriquecer com nome de localização se existir
  const localizacaoNome = inv.localizacaoId
    ? await runWithTenantContext({ tenantId, userId }, async () => {
        try {
          const loc = await stockService.obterLocalizacao(inv.localizacaoId!, { tenantId, userId });
          return loc.nome;
        } catch {
          return null;
        }
      })
    : null;

  const statusVariant = STATUS_VARIANTES[inv.status] ?? 'secondary';
  const statusLabel = STATUS_LABELS[inv.status] ?? inv.status;

  const isEditable = inv.status !== 'CONCLUIDO' && inv.status !== 'CANCELADO';

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={inv.titulo}
            description={`Código: ${inv.codigo}`}
            breadcrumbs={[
              { label: 'Inventário', href: '/inventario' },
              { label: 'Inventário Físico', href: '/inventario/fisico' },
              { label: inv.codigo },
            ]}
            badge={<StatusBadge status={inv.status} variant={statusVariant} label={statusLabel} />}
            actions={
              isEditable ? (
                <Button asChild size="sm">
                  <Link href={`/inventario/fisico/${id}/editar`}>
                    <Edit className="h-4 w-4 mr-2" />
                    Editar
                  </Link>
                </Button>
              ) : undefined
            }
          />
        }
        tabs={[
          {
            key: 'detalhes',
            label: 'Detalhes',
            content: <DetalhesTab inv={inv} localizacaoNome={localizacaoNome} />,
          },
          {
            key: 'membros',
            label: 'Equipa',
            count: inv.membros.length,
            content: <MembrosTab inv={inv} />,
          },
          {
            key: 'discrepancias',
            label: 'Discrepâncias',
            count: inv.totalDiscrepancias ?? 0,
            content: <DiscrepanciasTab inv={inv} />,
          },
        ]}
        metadata={[
          { label: 'Estado', value: <StatusBadge status={inv.status} variant={statusVariant} label={statusLabel} /> },
          { label: 'Data de início', value: formatDate(inv.dataInicio) },
          {
            label: 'Data prevista',
            value: formatDate(inv.dataPrevistaConclusao),
          },
          { label: 'Criado em', value: formatDate(inv.createdAt) },
          { label: 'Atualizado em', value: formatDate(inv.updatedAt) },
        ]}
      />
    </div>
  );
}
