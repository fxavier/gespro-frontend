/**
 * Apuramento de IVA — listagem por período (Server Component).
 *
 * Mostra todos os períodos do exercício corrente com o respectivo estado
 * de apuramento. Em exercício sem períodos, indica como criar um exercício.
 *
 * NUNCA 'use client': gate-sc.mjs recusa.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PercentCircle, AlertTriangle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { obterApuramento } from '@/server/services/financas/apuramento-iva.service';
import type {
  PeriodoContabil,
  ExercicioContabil,
} from '@/server/services/financas/contabilidade.interface';
import type { ApuramentoIva } from '@/server/services/financas/apuramento-iva.interface';
import { PageHeader, StatusBadge, EmptyState } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/format-date';
import { TableSkeleton } from './_components/iva-skeletons';

// ─────────────────────────────────────────────────────────────────────────────
// Textos legíveis por código de estado de apuramento
// ─────────────────────────────────────────────────────────────────────────────

function BadgeApuramento({
  apuramento,
}: {
  apuramento: ApuramentoIva | null;
}) {
  if (!apuramento) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        Não apurado
      </span>
    );
  }
  return <StatusBadge status={apuramento.estado} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Linha da tabela de períodos
// ─────────────────────────────────────────────────────────────────────────────

function LinhaPeriodo({
  periodo,
  apuramento,
}: {
  periodo: PeriodoContabil;
  apuramento: ApuramentoIva | null;
}) {
  const podeApurar = !apuramento || apuramento.estado === 'ESTORNADO';

  return (
    <tr className="border-b last:border-0 hover:bg-muted/40 transition-colors">
      <td className="py-3 px-4 font-medium">
        {periodo.ordem === 13
          ? 'Período 13 (encerramento)'
          : `${periodo.codigo}`}
      </td>
      <td className="py-3 px-4 text-muted-foreground">
        {formatarData(periodo.dataInicio)} – {formatarData(periodo.dataFim)}
      </td>
      <td className="py-3 px-4">
        <StatusBadge status={periodo.estado} />
      </td>
      <td className="py-3 px-4">
        <BadgeApuramento apuramento={apuramento} />
        {apuramento && (
          <span className="ml-2 text-xs text-muted-foreground">
            v{apuramento.versao}
          </span>
        )}
      </td>
      <td className="py-3 px-4 text-right">
        {podeApurar ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/contabilidade/iva/${periodo.id}/apurar`}>
              Apurar
            </Link>
          </Button>
        ) : (
          <Button asChild size="sm" variant="ghost">
            <Link href={`/contabilidade/iva/${periodo.id}`}>Ver detalhe</Link>
          </Button>
        )}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Secção de períodos de um exercício
// ─────────────────────────────────────────────────────────────────────────────

async function ExercicioIvaSection({
  exercicio,
  tenantId,
  userId,
}: {
  exercicio: ExercicioContabil;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };

  const periodos = await runWithTenantContext(ctx, () =>
    contabilidadeService.listarPeriodos({ exercicioId: exercicio.id }, ctx)
  );

  // Para cada período, tenta obter o apuramento activo (APURADO ou DECLARADO)
  const apuramentos = await Promise.all(
    periodos.map((p) =>
      runWithTenantContext(ctx, () => obterApuramento(p.id, ctx))
    )
  );

  const sorted = [...periodos].sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30">
        <PercentCircle className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold">Exercício {exercicio.codigo}</h3>
        <StatusBadge status={exercicio.estado} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b">
              <th className="py-2 px-4 text-left font-medium text-muted-foreground">Período</th>
              <th className="py-2 px-4 text-left font-medium text-muted-foreground">Intervalo</th>
              <th className="py-2 px-4 text-left font-medium text-muted-foreground">Estado período</th>
              <th className="py-2 px-4 text-left font-medium text-muted-foreground">Apuramento IVA</th>
              <th className="py-2 px-4 text-right font-medium text-muted-foreground">Acção</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <LinhaPeriodo
                key={p.id}
                periodo={p}
                apuramento={apuramentos[i]}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Secção principal
// ─────────────────────────────────────────────────────────────────────────────

async function IvaSection({
  tenantId,
  userId,
}: {
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };

  const exercicios = await runWithTenantContext(ctx, () =>
    contabilidadeService.listarExercicios(ctx)
  );

  if (exercicios.length === 0) {
    return (
      <EmptyState
        title="Sem exercícios contabilísticos"
        description="Para apurar o IVA, é necessário ter pelo menos um exercício contabilístico. Abra o primeiro em Exercícios Contabilísticos."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/contabilidade/exercicios">Ir para Exercícios</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-info/40 bg-info/10 p-4 text-sm flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-info shrink-0" />
        <p className="text-muted-foreground">
          O apuramento lê o razão contabilístico. Para períodos anteriores a
          Janeiro de 2026, o IVA dedutível das compras pode não estar registado
          no razão — esses períodos têm de partir de saldos de abertura lançados
          manualmente.
        </p>
      </div>

      {exercicios.map((e) => (
        <Suspense key={e.id} fallback={<TableSkeleton />}>
          <ExercicioIvaSection
            exercicio={e}
            tenantId={tenantId}
            userId={userId}
          />
        </Suspense>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página — Server Component
// ─────────────────────────────────────────────────────────────────────────────

export default async function IvaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Apuramento de IVA"
        description="Apurar, declarar e exportar os mapas de IVA por período"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Apuramento de IVA' },
        ]}
      />

      <Suspense fallback={<TableSkeleton />}>
        <IvaSection tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
