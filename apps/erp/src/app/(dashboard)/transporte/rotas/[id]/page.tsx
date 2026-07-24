/**
 * Detalhe de Rota — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Edit, MapPin, Package } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { rotaService } from '@/server/services/operacoes/rota.service';
import { viaturaService } from '@/server/services/operacoes/viatura.service';
import { motoristaService } from '@/server/services/operacoes/motorista.service';
import { PageHeader, DetailShell, StatusBadge } from '@/components/patterns';
import { RotaComandos } from '../_components/rota-comandos';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { RotaDetalhe, PontoEntregaRef } from '@/server/services/operacoes/rota.interface';

const PONTO_ESTADO_LABELS: Record<string, string> = {
  PENDENTE: 'Pendente',
  CHEGOU: 'Chegou',
  ENTREGUE: 'Entregue',
  FALHADO: 'Falhado',
};

function PontosTab({ pontos }: { pontos: PontoEntregaRef[] }) {
  if (pontos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Sem pontos de entrega definidos.
      </p>
    );
  }
  return (
    <ol className="space-y-3">
      {pontos.map((ponto) => (
        <li key={ponto.id}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0 mt-0.5">
                    {ponto.ordem}
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    {ponto.clienteNome && (
                      <p className="font-medium text-sm">{ponto.clienteNome}</p>
                    )}
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                      {ponto.endereco}, {ponto.cidade}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{ponto.tipo}</Badge>
                      <Badge
                        variant={ponto.estado === 'ENTREGUE' ? 'default' : ponto.estado === 'FALHADO' ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {PONTO_ESTADO_LABELS[ponto.estado] ?? ponto.estado}
                      </Badge>
                    </div>
                  </div>
                </div>
                {ponto.horaEstimada && (
                  <div className="text-right text-xs text-muted-foreground flex-shrink-0">
                    <p>Est.: {new Date(ponto.horaEstimada).toLocaleTimeString('pt-MZ', { hour: '2-digit', minute: '2-digit' })}</p>
                    {ponto.horaChegada && (
                      <p>Real: {new Date(ponto.horaChegada).toLocaleTimeString('pt-MZ', { hour: '2-digit', minute: '2-digit' })}</p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RotaDetalhePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;

  const ctx = { tenantId, userId };

  let rota: RotaDetalhe;
  try {
    rota = await runWithTenantContext(ctx, () => rotaService.obterRota(id, ctx));
  } catch {
    notFound();
  }

  const podeEditar = rota.estado === 'PLANEADA' || rota.estado === 'PAUSADA';
  const temAcoes = rota.estado !== 'CONCLUIDA' && rota.estado !== 'CANCELADA';

  const [viaturasResult, motoristasResult] = await Promise.all([
    runWithTenantContext(ctx, () =>
      viaturaService.listarViaturas({ take: 100, orderBy: 'matricula', order: 'asc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      motoristaService.listarMotoristas({ take: 100, orderBy: 'nomeCompleto', order: 'asc' }, ctx)
    ),
  ]);

  const viaturasOpcoes = viaturasResult.items.map((v) => ({ id: v.id, label: `${v.matricula} — ${v.marca} ${v.modelo}` }));
  const motoristasOpcoes = motoristasResult.items.map((m) => ({ id: m.id, label: m.nomeCompleto }));

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={rota.codigo}
            description={`${rota.origem} → ${rota.destino}`}
            breadcrumbs={[
              { label: 'Transporte', href: '/transporte' },
              { label: 'Rotas', href: '/transporte/rotas' },
              { label: rota.codigo },
            ]}
            badge={<StatusBadge status={rota.estado} />}
            actions={
              podeEditar && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/transporte/rotas/${rota.id}/editar`}>
                    <Edit className="h-4 w-4 mr-1.5" />
                    Editar
                  </Link>
                </Button>
              )
            }
          />
        }
        tabs={[
          ...(temAcoes
            ? [
                {
                  key: 'acoes',
                  label: 'Ações',
                  content: (
                    <RotaComandos
                      rotaId={rota.id}
                      estado={rota.estado}
                      viaturaId={rota.viaturaId}
                      motoristaId={rota.motoristaId}
                      viaturas={viaturasOpcoes}
                      motoristas={motoristasOpcoes}
                    />
                  ),
                },
              ]
            : []),
          {
            key: 'pontos',
            label: 'Pontos de Entrega',
            count: rota.pontos.length,
            content: <PontosTab pontos={rota.pontos} />,
          },
          ...(rota.descricao
            ? [
                {
                  key: 'descricao',
                  label: 'Descrição',
                  content: (
                    <Card>
                      <CardContent className="p-5">
                        <p className="text-sm whitespace-pre-wrap">{rota.descricao}</p>
                      </CardContent>
                    </Card>
                  ),
                },
              ]
            : []),
        ]}
        metadata={[
          {
            label: 'Estado',
            value: <StatusBadge status={rota.estado} />,
          },
          {
            label: 'Nome',
            value: <span className="text-sm font-medium">{rota.nome}</span>,
          },
          {
            label: 'Origem',
            value: (
              <div className="flex items-center gap-1.5 text-sm">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                {rota.origem}
              </div>
            ),
          },
          {
            label: 'Destino',
            value: (
              <div className="flex items-center gap-1.5 text-sm">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                {rota.destino}
              </div>
            ),
          },
          {
            label: 'Data de Início',
            value: (
              <time className="text-sm tabular-nums">
                {new Date(rota.dataInicio).toLocaleDateString('pt-MZ', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                })}
              </time>
            ),
          },
          ...(rota.distanciaTotal
            ? [{ label: 'Distância', value: <span className="text-sm tabular-nums">{parseFloat(rota.distanciaTotal).toFixed(1)} km</span> }]
            : []),
          ...(rota.tempoEstimadoMin
            ? [{ label: 'Tempo Estimado', value: <span className="text-sm tabular-nums">{Math.round(rota.tempoEstimadoMin / 60)}h {rota.tempoEstimadoMin % 60}min</span> }]
            : []),
          ...(rota.custoEstimado
            ? [
                {
                  label: 'Custo Estimado',
                  value: (
                    <span className="text-sm tabular-nums">
                      MZN {parseFloat(rota.custoEstimado).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                    </span>
                  ),
                },
              ]
            : []),
          ...(rota.custoReal
            ? [
                {
                  label: 'Custo Real',
                  value: (
                    <span className="text-sm tabular-nums font-medium">
                      MZN {parseFloat(rota.custoReal).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                    </span>
                  ),
                },
              ]
            : []),
          {
            label: 'Pontos de Entrega',
            value: (
              <div className="flex items-center gap-1.5 text-sm">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                {rota.pontos.length} ponto(s)
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
