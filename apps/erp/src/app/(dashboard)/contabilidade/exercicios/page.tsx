/**
 * Exercícios Contabilísticos — Server Component (NUNCA 'use client').
 *
 * Exibe os exercícios do tenant com os respectivos treze períodos.
 * Acções disponíveis por período: Fechar (inline, com lista de impedimentos)
 * e Reabrir (rota dedicada — exige motivo).
 * Acções por exercício (ADR-0035, #138), por estado E permissão: ABERTO → «Encerrar exercício»
 * (rota dedicada); ENCERRADO_PROVISORIO → «Reabrir exercício» (rota, exige motivo) e
 * «Encerrar definitivamente» (AlertDialog — irreversível).
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { Plus, CalendarDays, Lock, LockOpen } from 'lucide-react';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import type { ExercicioContabil, PeriodoContabil } from '@/server/services/financas/contabilidade.interface';
import { Button } from '@/components/ui/button';
import { PageHeader, StatusBadge, EmptyState } from '@/components/patterns';
import { formatarData } from '@/lib/format-date';
import { ExerciciosTableSkeleton } from './_components/exercicios-skeleton';
import { PeriodoAcoes } from './_components/periodo-acoes';
import { EncerrarDefinitivoButton } from './_components/encerrar-definitivo-button';
import { acessoExercicios, type AcessoExercicios } from './_lib/acesso';

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
            <th className="py-2 px-3 text-left font-medium text-muted-foreground">Acções</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors align-top">
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
              <td className="py-2 px-3">
                <PeriodoAcoes periodoId={p.id} estado={p.estado} />
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

function AcoesExercicio({
  exercicio,
  acesso,
}: {
  exercicio: ExercicioContabil;
  acesso: AcessoExercicios;
}) {
  const base = `/contabilidade/exercicios/${exercicio.id}`;
  if (exercicio.estado === 'ABERTO' && acesso.podeEncerrar) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href={`${base}/encerrar`}>
          <Lock className="h-3.5 w-3.5 mr-1.5" />
          Encerrar exercício
        </Link>
      </Button>
    );
  }
  if (exercicio.estado === 'ENCERRADO_PROVISORIO') {
    return (
      <>
        {acesso.podeReabrir && (
          <Button asChild size="sm" variant="outline">
            <Link href={`${base}/reabrir`}>
              <LockOpen className="h-3.5 w-3.5 mr-1.5" />
              Reabrir exercício
            </Link>
          </Button>
        )}
        {acesso.podeEncerrarDefinitivo && (
          <EncerrarDefinitivoButton exercicioId={exercicio.id} codigo={exercicio.codigo} />
        )}
      </>
    );
  }
  return null;
}

function CartaoExercicio({
  exercicio,
  periodos,
  acesso,
}: {
  exercicio: ExercicioContabil;
  periodos: PeriodoContabil[];
  acesso: AcessoExercicios;
}) {
  const abertos = periodos.filter((p) => p.estado === 'ABERTO').length;
  const fechados = periodos.filter((p) => p.estado === 'FECHADO').length;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold text-lg">Exercício {exercicio.codigo}</h3>
            <p className="text-sm text-muted-foreground">
              {formatarData(exercicio.dataInicio)} – {formatarData(exercicio.dataFim)}
            </p>
            {exercicio.estado === 'ENCERRADO' && exercicio.encerradoDefinitivoEm && (
              <p className="text-sm text-muted-foreground">
                Encerrado em definitivo em {formatarData(exercicio.encerradoDefinitivoEm)}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {abertos} abertos · {fechados} fechados
          </span>
          <StatusBadge status={exercicio.estado} />
          <AcoesExercicio exercicio={exercicio} acesso={acesso} />
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

async function ExerciciosSection({ acesso }: { acesso: AcessoExercicios }) {
  const { ctx } = acesso;

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
          acesso={acesso}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal — Server Component
// ─────────────────────────────────────────────────────────────────────────────

export default async function ExerciciosPage() {
  const acesso = await acessoExercicios();

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

      <Suspense fallback={<ExerciciosTableSkeleton />}>
        <ExerciciosSection acesso={acesso} />
      </Suspense>
    </div>
  );
}
