/**
 * Projecção de Tesouraria — Server Component (NUNCA 'use client').
 *
 * Tesouraria = caixa + saldo contabilístico das contas bancárias; NÃO inclui
 * contas a receber (vocabulário fixado no design §1 do spec 22).
 *
 * Padrão golden standard (`compras/requisicoes`):
 *  - filtros em `searchParams`, parseados com o schema Zod partilhado
 *    (`FiltroProjecaoSchema`) via safeParse — URL inválido usa defaults,
 *    nunca 500;
 *  - dados carregados directamente do serviço dentro de
 *    `runWithTenantContext` (nunca fetch à própria API);
 *  - `Suspense` por secção; componentes com `useSearchParams` SEMPRE dentro
 *    de `<Suspense>` (o build standalone parte o prerender sem isso);
 *  - `Decimal` → string e `Date` → ISO na fronteira SC→CC.
 *
 * Nada de projecção se grava (ADR-0036): cada render recalcula.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  CalendarClock,
  ClipboardList,
  Plus,
  TrendingDown,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { projetarTesouraria } from '@/server/services/financas/projecao.service';
import {
  FiltroProjecaoSchema,
  type FiltroProjecaoInput,
} from '@/lib/validations/tesouraria';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader, KpiCard } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';
import { AvisoAmbito } from './_components/aviso-ambito';
import { FiltrosProjecao } from './_components/filtros-projecao';
import { GraficoProjecao } from './_components/grafico-projecao';
import {
  TabelaBuckets,
  type BucketSerializado,
} from './_components/tabela-buckets';

const FILTROS_DEFAULT: FiltroProjecaoInput = {
  horizonteDias: 90,
  granularidade: 'SEMANAL',
  cenario: 'BASE',
};

const CENARIO_LABEL: Record<string, string> = {
  OTIMISTA: 'Optimista',
  BASE: 'Base',
  PESSIMISTA: 'Pessimista',
};

// ─────────────────────────────────────────────────────────────────────────────
// Secção assíncrona — chama o serviço e serializa para os componentes cliente
// ─────────────────────────────────────────────────────────────────────────────

async function ProjecaoSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroProjecaoInput;
  tenantId: string;
  userId: string;
}) {
  const projecao = await runWithTenantContext({ tenantId, userId }, () =>
    projetarTesouraria(filtros, { tenantId, userId }),
  );

  const buckets: BucketSerializado[] = projecao.buckets.map((b) => ({
    inicio: b.inicio.toISOString(),
    fim: b.fim.toISOString(),
    entradas: b.entradas.toString(),
    saidas: b.saidas.toString(),
    saldoInicial: b.saldoInicial.toString(),
    saldoFinal: b.saldoFinal.toString(),
    vencidas: b.ocorrencias.filter((o) => o.vencida).length,
  }));

  const { perfilAtraso, semOrigensDeSaldo } = projecao;
  const menorSaldoNegativo = projecao.menorSaldoProjetado.isNegative();
  const baseDegradado =
    projecao.cenario === 'BASE' && projecao.cenarioAplicado === 'OTIMISTA';
  const semAtrasoObservado =
    !perfilAtraso.amostraInsuficiente &&
    perfilAtraso.atrasoMedioDias === 0 &&
    perfilAtraso.desvioPadraoDias === 0;

  return (
    <div className="space-y-6">
      {/* R1.3: saldo zero sem origens NUNCA se apresenta como facto apurado */}
      {semOrigensDeSaldo && (
        <Alert>
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Não há origens de saldo configuradas</AlertTitle>
          <AlertDescription>
            Este tenant não tem nenhuma conta bancária activa nem sessão de
            caixa aberta. O saldo de abertura apresentado é zero por ausência
            de origens — não é um saldo apurado.
          </AlertDescription>
        </Alert>
      )}

      {/* R5.3: BASE degradado para OTIMISTA por falta de histórico */}
      {baseDegradado && (
        <Alert>
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Histórico de cobrança insuficiente</AlertTitle>
          <AlertDescription>
            Há apenas {perfilAtraso.amostra} factura(s) liquidada(s) nos
            últimos 180 dias (mínimo: 20). O cenário BASE está a usar a
            hipótese optimista — recebimentos na data de vencimento — por
            falta de histórico.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Saldo de abertura"
          value={
            semOrigensDeSaldo ? '—' : formatMZN(projecao.saldoAbertura.toString())
          }
          description={
            semOrigensDeSaldo
              ? 'sem origens de saldo'
              : `em ${formatarData(projecao.dataReferencia)}`
          }
          icon={<Wallet className="h-5 w-5" />}
        />
        <KpiCard
          title="Menor saldo projectado"
          value={formatMZN(projecao.menorSaldoProjetado.toString())}
          description={
            menorSaldoNegativo ? 'saldo negativo no horizonte' : undefined
          }
          icon={
            <TrendingDown
              className={menorSaldoNegativo ? 'h-5 w-5 text-destructive' : 'h-5 w-5'}
            />
          }
          className={menorSaldoNegativo ? 'border-destructive/50' : undefined}
        />
        <KpiCard
          title="Primeira ruptura"
          value={
            projecao.primeiroDiaNegativo
              ? formatarData(projecao.primeiroDiaNegativo)
              : 'Sem ruptura'
          }
          description={
            projecao.primeiroDiaNegativo
              ? 'primeiro dia com saldo negativo'
              : 'no horizonte projectado'
          }
          icon={
            <TriangleAlert
              className={
                projecao.primeiroDiaNegativo
                  ? 'h-5 w-5 text-destructive'
                  : 'h-5 w-5'
              }
            />
          }
          className={
            projecao.primeiroDiaNegativo ? 'border-destructive/50' : undefined
          }
        />
        <KpiCard
          title="Perfil de atraso de cobrança"
          value={
            perfilAtraso.amostraInsuficiente
              ? 'Insuficiente'
              : `${perfilAtraso.atrasoMedioDias.toFixed(1).replace('.', ',')} dias`
          }
          description={`σ ${perfilAtraso.desvioPadraoDias
            .toFixed(1)
            .replace('.', ',')} d · amostra ${perfilAtraso.amostra}`}
          icon={<CalendarClock className="h-5 w-5" />}
        />
      </div>

      {/* Cenários que coincidem: dizê-lo é mais honesto do que fingir três
          curvas distintas — no tenant sem atrasos, BASE == OTIMISTA. */}
      {semAtrasoObservado && (
        <p className="text-sm text-muted-foreground">
          O histórico de cobrança não regista atrasos (média 0 dias, desvio 0)
          — os cenários Optimista e Base coincidem; só o Pessimista exclui as
          facturas vencidas há mais de 90 dias.
        </p>
      )}

      <section aria-label="Gráfico do saldo projectado">
        <h2 className="sr-only">Gráfico do saldo projectado</h2>
        <GraficoProjecao buckets={buckets} />
      </section>

      <section aria-label="Tabela de buckets da projecção" className="space-y-2">
        <h2 className="text-base font-semibold">
          Buckets — cenário {CENARIO_LABEL[projecao.cenarioAplicado]}
        </h2>
        <TabelaBuckets buckets={buckets} granularidade={projecao.granularidade} />
      </section>
    </div>
  );
}

function ProjecaoSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border p-6 space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TesourariaPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );

  const parsed = FiltroProjecaoSchema.safeParse(flatParams);
  const filtros = parsed.success ? parsed.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Projecção de Tesouraria"
        description="Saldo de tesouraria projectado sobre os compromissos datados do ERP"
        breadcrumbs={[{ label: 'Tesouraria' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/tesouraria/compromissos">
                <ClipboardList className="h-4 w-4 mr-2" />
                Compromissos
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/tesouraria/compromissos/novo">
                <Plus className="h-4 w-4 mr-2" />
                Novo Compromisso
              </Link>
            </Button>
          </div>
        }
      />

      {/* R7.4: o âmbito declara-se na própria página */}
      <AvisoAmbito />

      {/* FiltrosProjecao usa useSearchParams — obrigatoriamente em Suspense */}
      <Suspense fallback={<Skeleton className="h-16 w-full max-w-lg" />}>
        <FiltrosProjecao
          horizonteDias={filtros.horizonteDias}
          granularidade={filtros.granularidade}
          cenario={filtros.cenario}
        />
      </Suspense>

      <Suspense key={JSON.stringify(filtros)} fallback={<ProjecaoSkeleton />}>
        <ProjecaoSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
