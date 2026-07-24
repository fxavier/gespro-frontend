/**
 * Detalhe de Entrega — Server Component (NUNCA 'use client').
 * Comandos operacionais (transições, prova, atribuição) numa folha 'use client'.
 */

import { notFound, redirect } from 'next/navigation';
import { Package, Phone, MapPin, User, CheckCircle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { entregaService } from '@/server/services/operacoes/entrega.service';
import { viaturaService } from '@/server/services/operacoes/viatura.service';
import { motoristaService } from '@/server/services/operacoes/motorista.service';
import { rotaService } from '@/server/services/operacoes/rota.service';
import { PageHeader, DetailShell, StatusBadge } from '@/components/patterns';
import { Card, CardContent } from '@/components/ui/card';
import type { EntregaDetalhe } from '@/server/services/operacoes/entrega.interface';
import { EntregaComandos } from '../_components/entrega-comandos';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EntregaDetalhePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;
  const ctx = { tenantId, userId };

  let entrega: EntregaDetalhe;
  try {
    entrega = await runWithTenantContext(ctx, () => entregaService.obterEntrega(id, ctx));
  } catch {
    notFound();
  }

  const [viaturasResult, motoristasResult, rotasResult] = await Promise.all([
    runWithTenantContext(ctx, () =>
      viaturaService.listarViaturas({ estado: 'DISPONIVEL', take: 100, orderBy: 'matricula', order: 'asc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      motoristaService.listarMotoristas({ estadoOperacional: 'ACTIVO', take: 100, orderBy: 'nomeCompleto', order: 'asc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      rotaService.listarRotas({ take: 100, orderBy: 'dataInicio', order: 'desc' }, ctx)
    ),
  ]);

  const viaturas = viaturasResult.items.map((v) => ({ id: v.id, label: `${v.matricula} — ${v.marca} ${v.modelo}` }));
  const motoristas = motoristasResult.items.map((m) => ({ id: m.id, label: m.nomeCompleto }));
  const rotas = rotasResult.items.map((r) => ({ id: r.id, label: `${r.codigo} — ${r.nome}` }));

  const fmtMzn = (v: string) =>
    `MZN ${parseFloat(v).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={entrega.numero}
            description={`${entrega.clienteNome} — ${entrega.cidade}`}
            breadcrumbs={[
              { label: 'Transporte', href: '/transporte' },
              { label: 'Entregas', href: '/transporte/entregas' },
              { label: entrega.numero },
            ]}
            badge={<StatusBadge status={entrega.estado} />}
          />
        }
        tabs={[
          {
            key: 'acoes',
            label: 'Ações',
            content: (
              <EntregaComandos
                entregaId={entrega.id}
                estado={entrega.estado}
                viaturaId={entrega.viaturaId}
                motoristaId={entrega.motoristaId}
                rotaId={entrega.rotaId}
                viaturas={viaturas}
                motoristas={motoristas}
                rotas={rotas}
              />
            ),
          },
          {
            key: 'itens',
            label: 'Itens',
            count: entrega.itens.length,
            content:
              entrega.itens.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Sem itens.</p>
              ) : (
                <div className="space-y-3">
                  {entrega.itens.map((item) => (
                    <Card key={item.id}>
                      <CardContent className="p-4 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium text-sm flex items-center gap-1.5">
                            <Package className="h-3.5 w-3.5 text-muted-foreground" />
                            {item.produtoNome}
                          </p>
                          <p className="text-xs text-muted-foreground">Cód. {item.produtoId} · {item.quantidade} un.</p>
                        </div>
                        <div className="text-right text-xs text-muted-foreground flex-shrink-0">
                          <p className="tabular-nums">{parseFloat(item.peso).toFixed(1)} kg</p>
                          <p className="tabular-nums font-medium text-foreground">{fmtMzn(item.valor)}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ),
          },
          ...(entrega.comprovanteTipo
            ? [
                {
                  key: 'prova',
                  label: 'Prova de Entrega',
                  content: (
                    <Card>
                      <CardContent className="p-5 space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-success">
                          <CheckCircle className="h-4 w-4" />
                          <span className="font-medium">Entrega confirmada</span>
                        </div>
                        <p><span className="text-muted-foreground">Tipo:</span> {entrega.comprovanteTipo}</p>
                        <p><span className="text-muted-foreground">Recebedor:</span> {entrega.comprovanteRecebedor}</p>
                        <p><span className="text-muted-foreground">Dados:</span> {entrega.comprovanteDados}</p>
                        {entrega.comprovanteDataHora && (
                          <p className="tabular-nums">
                            <span className="text-muted-foreground">Data/Hora:</span>{' '}
                            {new Date(entrega.comprovanteDataHora).toLocaleString('pt-MZ')}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ),
                },
              ]
            : []),
        ]}
        metadata={[
          { label: 'Estado', value: <StatusBadge status={entrega.estado} /> },
          { label: 'Prioridade', value: <StatusBadge status={entrega.prioridade} /> },
          {
            label: 'Cliente',
            value: (
              <div className="text-sm space-y-0.5">
                <p className="font-medium">{entrega.clienteNome}</p>
                <p className="text-muted-foreground flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{entrega.clienteTelefone}</p>
              </div>
            ),
          },
          {
            label: 'Morada',
            value: (
              <div className="flex items-start gap-1.5 text-sm">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <span>{entrega.enderecoEntrega}, {entrega.cidade}</span>
              </div>
            ),
          },
          {
            label: 'Data Agendada',
            value: (
              <time className="text-sm tabular-nums">
                {new Date(entrega.dataAgendada).toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </time>
            ),
          },
          { label: 'Peso Total', value: <span className="text-sm tabular-nums">{parseFloat(entrega.pesoTotal).toFixed(1)} kg</span> },
          { label: 'Valor da Carga', value: <span className="text-sm tabular-nums">{fmtMzn(entrega.valorCarga)}</span> },
          { label: 'Taxa de Entrega', value: <span className="text-sm tabular-nums">{fmtMzn(entrega.taxaEntrega)}</span> },
          { label: 'Tentativas', value: <span className="text-sm tabular-nums flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-muted-foreground" />{entrega.tentativasEntrega}</span> },
          ...(entrega.motivoFalha
            ? [{ label: 'Motivo de Falha', value: <span className="text-sm text-destructive">{entrega.motivoFalha}</span> }]
            : []),
        ]}
      />
    </div>
  );
}
