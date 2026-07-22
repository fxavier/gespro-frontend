import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AlertTriangle, CalendarClock, CreditCard, Info } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { assinaturaService } from '@/server/services/plataforma/assinatura.service';
import { PageHeader, StatusBadge, KpiCard, EmptyState } from '@/components/patterns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PLANOS, TRIAL_DIAS, type PlanoId } from '@/lib/planos';
import { FaturacaoAcoes } from './faturacao-acoes';

/**
 * /definicoes/faturacao — estado da subscrição, plano e acções de faturação.
 *
 * Server Component: lê o serviço directamente dentro do contexto de tenant.
 * As acções (Checkout/Portal/cancelar) vivem na folha cliente `FaturacaoAcoes`.
 */
export const metadata = { title: 'Subscrição — GestPro' };

function Aviso({
  tom,
  titulo,
  texto,
}: {
  tom: 'info' | 'alerta';
  titulo: string;
  texto: string;
}) {
  const Icone = tom === 'alerta' ? AlertTriangle : Info;
  return (
    <div
      className={
        tom === 'alerta'
          ? 'flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4'
          : 'flex items-start gap-3 rounded-lg border bg-muted/40 p-4'
      }
      role={tom === 'alerta' ? 'alert' : undefined}
    >
      <Icone
        className={tom === 'alerta' ? 'mt-0.5 h-5 w-5 text-destructive' : 'mt-0.5 h-5 w-5 text-muted-foreground'}
        aria-hidden="true"
      />
      <div>
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-sm text-muted-foreground">{texto}</p>
      </div>
    </div>
  );
}

function SubscricaoSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-3 rounded-lg border p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

async function Subscricao({ tenantId, userId }: { tenantId: string; userId: string }) {
  const assinatura = await runWithTenantContext({ tenantId, userId }, () =>
    assinaturaService.obterOuNulo({ tenantId, userId }),
  );

  if (!assinatura) {
    return (
      <EmptyState
        icon={<CreditCard className="h-8 w-8" aria-hidden="true" />}
        title="Sem subscrição registada"
        description="Este tenant foi criado antes da faturação self-service. Contacte o suporte para associar um plano."
      />
    );
  }

  const plano = PLANOS[assinatura.planoAssinatura as PlanoId];
  const dataFmt = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'long' });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Estado</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusBadge status={assinatura.estado} />
          </CardContent>
        </Card>

        <KpiCard
          title="Plano"
          value={plano?.nome ?? assinatura.planoAssinatura}
          icon={<CreditCard className="h-4 w-4" aria-hidden="true" />}
        />

        <KpiCard
          title={assinatura.estado === 'TRIAL' ? 'Dias de teste restantes' : 'Fim do teste'}
          value={
            assinatura.estado === 'TRIAL'
              ? String(assinatura.diasRestantesTrial)
              : dataFmt.format(assinatura.trialFim)
          }
          icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
        />
      </div>

      {assinatura.estado === 'TRIAL' && (
        <Aviso
          tom={assinatura.diasRestantesTrial <= 3 ? 'alerta' : 'info'}
          titulo={`Está a usar o teste gratuito de ${TRIAL_DIAS} dias`}
          texto={`Termina em ${dataFmt.format(assinatura.trialFim)}. Subscreva um plano para manter o acesso — não é preciso cartão até então.`}
        />
      )}

      {assinatura.estado === 'SUSPENSA' && (
        <Aviso
          tom="alerta"
          titulo="Subscrição suspensa por falta de pagamento"
          texto="Actualize o método de pagamento para repor o acesso. A reposição é automática assim que o pagamento for aceite."
        />
      )}

      {assinatura.estado === 'EXPIRADO' && (
        <Aviso
          tom="alerta"
          titulo="Período de teste terminado"
          texto="Subscreva um plano para repor o acesso de todos os utilizadores da empresa."
        />
      )}

      {assinatura.estado === 'CANCELADA' && (
        <Aviso
          tom="alerta"
          titulo="Subscrição cancelada"
          texto={
            assinatura.dataCancelamento
              ? `Cancelada a ${dataFmt.format(assinatura.dataCancelamento)}. Os dados mantêm-se; subscreva de novo para repor o acesso.`
              : 'Os dados mantêm-se; subscreva de novo para repor o acesso.'
          }
        />
      )}

      <FaturacaoAcoes
        planoActual={assinatura.planoAssinatura as PlanoId}
        cicloActual={assinatura.ciclo}
        temSubscricaoStripe={Boolean(assinatura.stripeCustomerId)}
        cancelavel={assinatura.estado !== 'CANCELADA'}
      />
    </div>
  );
}

export default async function FaturacaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscrição"
        description="Plano, período de teste e faturação da sua conta GestPro."
        breadcrumbs={[
          { label: 'Definições', href: '/definicoes/faturacao' },
          { label: 'Subscrição' },
        ]}
      />
      <Suspense fallback={<SubscricaoSkeleton />}>
        <Subscricao tenantId={session.user.tenantId} userId={session.user.id} />
      </Suspense>
    </div>
  );
}
