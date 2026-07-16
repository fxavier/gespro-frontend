/**
 * Dashboard de Transporte — Server Component.
 *
 * Padrão golden standard:
 * - Dados carregados directamente dos serviços (nunca fetch à API própria)
 * - KpiCard com Suspense independente
 * - Alertas operacionais via gerarAlertasDocumentos + gerarAlertasManutencao
 * - StatusBadge para estados (mapa único, sem mapa local)
 * - Zero cores hardcoded
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Truck, User, Activity, AlertTriangle, Wrench, Fuel, MapPin, Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { viaturaService } from '@/server/services/operacoes/viatura.service';
import { atividadeService } from '@/server/services/operacoes/atividade.service';
import { motoristaService } from '@/server/services/operacoes/motorista.service';
import { gerarAlertasDocumentos, gerarAlertasManutencao } from '@/server/services/operacoes/alertas.service';
import { prisma } from '@/server/db/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, KpiCard, StatusBadge, EmptyState } from '@/components/patterns';
import { KpiSkeleton } from './_components/table-skeletons';

// ─────────────────────────────────────────────────────────────────────────────
// KPIs assíncronos — Suspense independente da tabela
// ─────────────────────────────────────────────────────────────────────────────

async function TransporteKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };

  const [viaturasResult, atividadesResult, motoristasResult] = await Promise.all([
    runWithTenantContext(ctx, () =>
      viaturaService.listarViaturas({ take: 100, orderBy: 'createdAt', order: 'desc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      atividadeService.listarAtividades({ take: 100, orderBy: 'createdAt', order: 'desc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      motoristaService.listarMotoristas({ take: 100, orderBy: 'createdAt', order: 'desc' }, ctx)
    ),
  ]);

  const viaturasDisponiveis = viaturasResult.items.filter((v) => v.estado === 'DISPONIVEL').length;
  const atividadesEmCurso = atividadesResult.items.filter((a) => a.estado === 'EM_CURSO').length;
  const totalViaturas = viaturasResult.items.length;
  const totalAtividades = atividadesResult.items.length;

  // Alertas operacionais — requere documentos; buscar viaturas com documentos
  const viaturasComDocs = await runWithTenantContext(ctx, async () =>
    prisma.viatura.findMany({
      where: { tenantId },
      select: {
        id: true, matricula: true, marca: true, modelo: true,
        documentos: { select: { id: true, tipo: true, numero: true, dataValidade: true, estado: true } },
      },
    })
  );

  const motoristasComDocs = await runWithTenantContext(ctx, async () =>
    prisma.motorista.findMany({
      where: { tenantId },
      select: {
        id: true, nomeCompleto: true,
        documentos: { select: { id: true, tipo: true, numero: true, dataValidade: true, estado: true } },
      },
    })
  );

  const manutencoesParaAlerta = await runWithTenantContext(ctx, async () =>
    prisma.manutencaoViatura.findMany({
      where: { tenantId },
      select: { id: true, viaturaId: true, tipo: true, proximaManutencaoData: true },
    })
  );

  const alertasDocumentos = gerarAlertasDocumentos(
    viaturasComDocs.map((v) => ({
      ...v,
      documentos: v.documentos.map((d) => ({
        ...d,
        estado: d.estado as 'VALIDO' | 'PROXIMO_EXPIRAR' | 'EXPIRADO',
      })),
    })),
    motoristasComDocs.map((m) => ({
      ...m,
      documentos: m.documentos.map((d) => ({
        ...d,
        estado: d.estado as 'VALIDO' | 'PROXIMO_EXPIRAR' | 'EXPIRADO',
      })),
    })),
  );

  const alertasManutencao = gerarAlertasManutencao(
    viaturasComDocs.map((v) => ({ ...v, documentos: v.documentos.map((d) => ({ ...d, estado: d.estado as 'VALIDO' | 'PROXIMO_EXPIRAR' | 'EXPIRADO' })) })),
    manutencoesParaAlerta.map((m) => ({ ...m, tipo: m.tipo as 'PREVENTIVA' | 'CORRECTIVA' })),
  );

  const todosAlertas = [...alertasDocumentos, ...alertasManutencao];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Viaturas Disponíveis"
          value={String(viaturasDisponiveis)}
          description={`de ${totalViaturas} viaturas`}
          icon={<Truck className="h-5 w-5" />}
        />
        <KpiCard
          title="Atividades em Curso"
          value={String(atividadesEmCurso)}
          description={`de ${totalAtividades} atividades`}
          icon={<Activity className="h-5 w-5" />}
        />
        <KpiCard
          title="Total de Motoristas"
          value={String(motoristasResult.items.length)}
          icon={<User className="h-5 w-5" />}
        />
        <KpiCard
          title="Alertas Activos"
          value={String(todosAlertas.length)}
          description="documentos e manutenção"
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </div>

      {/* Alertas operacionais */}
      {todosAlertas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Alertas Operacionais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {todosAlertas.slice(0, 10).map((alerta) => (
                <div
                  key={alerta.id}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${
                    alerta.urgencia === 'CRITICO'
                      ? 'border-destructive/30 bg-destructive/5'
                      : 'border-warning/30 bg-warning/5'
                  }`}
                >
                  <AlertTriangle
                    className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                      alerta.urgencia === 'CRITICO' ? 'text-destructive' : 'text-warning'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${alerta.urgencia === 'CRITICO' ? 'text-destructive' : 'text-warning'}`}>
                      {alerta.entidadeNome}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{alerta.descricao}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Atividades recentes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-5 w-5" />
              Atividades Recentes
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/transporte/atividades">Ver todas</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {atividadesResult.items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Sem atividades registadas.
            </p>
          ) : (
            <div className="space-y-2">
              {atividadesResult.items.slice(0, 5).map((atividade) => (
                <Link
                  key={atividade.id}
                  href={`/transporte/atividades/${atividade.id}`}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="font-medium text-sm truncate">{atividade.titulo}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {atividade.codigo} · {atividade.localActividade}
                    </p>
                  </div>
                  <StatusBadge status={atividade.estado} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal — Server Component
// ─────────────────────────────────────────────────────────────────────────────

export default async function TransporteDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Dashboard de Transporte"
        description="Visão geral das operações de transporte e logística"
        breadcrumbs={[{ label: 'Transporte' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/transporte/rotas/novo">
                <MapPin className="h-4 w-4 mr-1.5" />
                Nova Rota
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/transporte/atividades/novo">
                <Plus className="h-4 w-4 mr-1.5" />
                Nova Atividade
              </Link>
            </Button>
          </div>
        }
      />

      <Suspense fallback={<KpiSkeleton count={4} />}>
        <TransporteKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      {/* Navegação rápida */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { href: '/transporte/veiculos', icon: Truck, label: 'Viaturas' },
          { href: '/transporte/motoristas', icon: User, label: 'Motoristas' },
          { href: '/transporte/rotas', icon: MapPin, label: 'Rotas' },
          { href: '/transporte/atividades', icon: Activity, label: 'Atividades' },
          { href: '/transporte/manutencao', icon: Wrench, label: 'Manutenção' },
          { href: '/transporte/combustivel', icon: Fuel, label: 'Combustível' },
        ].map(({ href, icon: Icon, label }) => (
          <Link key={href} href={href} className="block">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="pt-5 pb-4">
                <div className="flex flex-col items-center text-center gap-2">
                  <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium">{label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
