/**
 * Exercícios Contabilísticos — Server Component (NUNCA 'use client').
 *
 * Exibe os exercícios do tenant com os respectivos treze períodos.
 * Uma única acção de escrita: abrir exercício (rota dedicada /novo).
 * Fecho de período não está disponível nesta entrega — aguarda o
 * apuramento do IVA (ADR-0034, Fase 2).
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, CalendarDays, Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import type { ExercicioContabil, PeriodoContabil } from '@/server/services/financas/contabilidade.interface';
import { Button } from '@/components/ui/button';
import { PageHeader, StatusBadge, EmptyState } from '@/components/patterns';
import { formatarData } from '@/lib/format-date';
import { ExerciciosTableSkeleton } from './_components/exercicios-skeleton';

// ─────────────────────────────────────────────────────────────────────────────
// Componente de períodos de um exercício
// ─────────────────────────────────────────────────────────────────────────────

function GrelhaperiodosExercicio({ periodos }: { periodos: PeriodoContabil[] }) {
  const sorted = [...periodos].sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b">
            <th className="py-2 px-3 text-left font-medium text-muted-foreground">Período</th>
            <th className="py-2 px-3 text-left font-medium text-muted-foreground">Código</th>
            <th className="py-2 px-3 text-left font-medium text-muted-foreground">Início</th>
            <th className="py-2 px-3 text-left font-medium text-muted-foreground">Fim</th>
            <th className="py-2 px-3 text-left font-medium text-muted-foreground">Estado</th>
            <th className="py-2 px-3 text-left font-medium text-muted-foreground">Fechado em</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
              <td className="py-2 px-3 font-medium">
                {p.ordem === 13 ? 'Período 13 (encerramento)' : `Mês ${p.ordem}`}
              </td>
              <td className="py-2 px-3 text-muted-foreground">{p.codigo}</td>
              <td className="py-2 px-3">{formatarData(p.dataInicio)}</td>
              <td className="py-2 px-3">{formatarData(p.dataFim)}</td>
              <td className="py-2 px-3">
                <StatusBadge status={p.estado} />
              </td>
              <td className="py-2 px-3 text-muted-foreground">
                {p.fechadoEm ? formatarData(p.fechadoEm) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente de card de exercício
// ─────────────────────────────────────────────────────────────────────────────

function CartaoExercicio({
  exercicio,
  periodos,
}: {
  exercicio: ExercicioContabil;
  periodos: PeriodoContabil[];
}) {
  const abertos = periodos.filter((p) => p.estado === 'ABERTO').length;
  const fechados = periodos.filter((p) => p.estado === 'FECHADO').length;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold text-lg">Exercício {exercicio.codigo}</h3>
            <p className="text-sm text-muted-foreground">
              {formatarData(exercicio.dataInicio)} – {formatarData(exercicio.dataFim)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {abertos} abertos · {fechados} fechados
          </span>
          <StatusBadge status={exercicio.estado} />
        </div>
      </div>
      <div className="p-4">
        <GrelhaperiodosExercicio periodos={periodos} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Secção assíncrona com exercícios + períodos
// ─────────────────────────────────────────────────────────────────────────────

async function ExerciciosSection({
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
        description="Ainda não existe nenhum exercício para este tenant. Abra o primeiro para começar a registar lançamentos."
        action={
          <Button asChild size="sm">
            <Link href="/contabilidade/exercicios/novo">
              <Plus className="h-4 w-4 mr-2" />
              Abrir exercício
            </Link>
          </Button>
        }
      />
    );
  }

  // Carrega todos os períodos de todos os exercícios em paralelo
  const periodosMap = new Map<string, PeriodoContabil[]>();
  await Promise.all(
    exercicios.map(async (e) => {
      const periodos = await runWithTenantContext(ctx, () =>
        contabilidadeService.listarPeriodos({ exercicioId: e.id }, ctx)
      );
      periodosMap.set(e.id, periodos);
    })
  );

  return (
    <div className="space-y-6">
      {exercicios.map((e) => (
        <CartaoExercicio
          key={e.id}
          exercicio={e}
          periodos={periodosMap.get(e.id) ?? []}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Aviso de fecho de períodos em falta
// ─────────────────────────────────────────────────────────────────────────────

function AvisoFechoPeriodo() {
  return (
    <div className="rounded-lg border border-info/40 bg-info/10 p-4 text-sm flex items-start gap-3">
      <Lock className="h-4 w-4 mt-0.5 text-info shrink-0" />
      <div>
        <p className="font-medium text-info">Fecho de períodos disponível na Fase 2</p>
        <p className="mt-1 text-muted-foreground">
          O fecho manual de períodos mensais estará disponível quando o apuramento do IVA
          for implementado (ADR-0034). Uma das pré-condições de fecho é que o IVA do
          período esteja apurado — fechar um período sem essa confirmação assinaria um
          mapa que pode mudar depois de entregue à AT.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal — Server Component
// ─────────────────────────────────────────────────────────────────────────────

export default async function ExerciciosPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Exercícios Contabilísticos"
        description="Gerir os exercícios fiscais e os respectivos períodos mensais"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Exercícios' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/contabilidade/exercicios/novo">
              <Plus className="h-4 w-4 mr-2" />
              Abrir exercício
            </Link>
          </Button>
        }
      />

      <AvisoFechoPeriodo />

      <Suspense fallback={<ExerciciosTableSkeleton />}>
        <ExerciciosSection tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
