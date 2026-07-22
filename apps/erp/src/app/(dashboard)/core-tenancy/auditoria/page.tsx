/**
 * Ecrã de Auditoria — Server Component (NUNCA 'use client').
 *
 * Leitura paginada do AuditLog com filtros por entidade, acção, utilizador e data.
 * Read-only — sem mutações.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { auditService } from '@/server/services/plataforma/audit.service';
import { FilterAuditLogSchema } from '@/lib/validations/plataforma';
import { PageHeader, FilterBar } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { AuditoriaTable } from './_components/auditoria-table';
import { TableSkeleton } from './_components/table-skeletons';

// ─────────────────────────────────────────────────────────────────────────────
// Schema URL-safe
// ─────────────────────────────────────────────────────────────────────────────

const FiltroAuditoriaUrlSchema = FilterAuditLogSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
  // Override: dateFrom/dateTo como strings simples na URL (não ISO completo)
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
}).omit({ dateFrom: true, dateTo: true }).extend({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

type FiltroAuditoriaUrl = z.infer<typeof FiltroAuditoriaUrlSchema>;

const FILTROS_DEFAULT: FiltroAuditoriaUrl = { take: 25 };

// ─────────────────────────────────────────────────────────────────────────────
// Tabela assíncrona
// ─────────────────────────────────────────────────────────────────────────────

async function AuditoriaTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroAuditoriaUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };

  const result = await auditService.listar(
    {
      entity: filtros.entity,
      action: filtros.action,
      cursor: filtros.cursor,
      take: filtros.take,
    },
    ctx
  );

  return (
    <AuditoriaTable
      data={result.items}
      nextCursor={result.nextCursor}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtros dinâmicos — carregados do servidor
// ─────────────────────────────────────────────────────────────────────────────

async function FiltrosAuditoria({
  tenantId,
  userId,
}: {
  tenantId: string;
  userId: string;
}) {
  const filtrosDisponiveis = await auditService.filtrosDisponiveis({ tenantId, userId });

  const FILTER_CONFIGS: FilterConfig[] = [
    {
      key: 'entity',
      label: 'Entidade',
      placeholder: 'Todas as entidades',
      options: filtrosDisponiveis.entidades.map((e) => ({ label: e, value: e })),
    },
    {
      key: 'action',
      label: 'Acção',
      placeholder: 'Todas as acções',
      options: filtrosDisponiveis.accoes.map((a) => ({ label: a, value: a })),
    },
  ];

  return (
    <FilterBar
      searchPlaceholder="Pesquisar por ID de entidade ou utilizador…"
      searchKey="entityId"
      filters={FILTER_CONFIGS}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal — Server Component
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AuditoriaPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroAuditoriaUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Registo de Auditoria"
        description="Histórico de todas as alterações e acções realizadas no sistema"
        breadcrumbs={[
          { label: 'Administração', href: '/core-tenancy' },
          { label: 'Auditoria' },
        ]}
      />

      {/* Filtros dinâmicos baseados nos dados reais */}
      <Suspense fallback={<div className="h-10 rounded-md border bg-muted/30 animate-pulse" />}>
        <FiltrosAuditoria tenantId={tenantId} userId={userId} />
      </Suspense>

      {/* Tabela com Suspense re-activado quando filtros mudam */}
      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={5} />}
      >
        <AuditoriaTableSection
          filtros={filtros}
          tenantId={tenantId}
          userId={userId}
        />
      </Suspense>
    </div>
  );
}
