/**
 * Centro de Notificações — Server Component (NUNCA 'use client').
 *
 * Lista as notificações do utilizador autenticado.
 * Filtros por searchParams: apenasNaoLidas, tipo.
 * Marcar lida: Server Action (Client Component filho).
 * Sem modais — tudo em rota dedicada.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { Settings } from 'lucide-react';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { notificacaoService } from '@/server/services/plataforma/notificacao.service';
import { FiltroNotificacoesSchema } from '@/lib/validations/notificacoes';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { NotificacoesList } from './_components/notificacoes-list';

// ─────────────────────────────────────────────────────────────────────────────
// Schema URL-safe
// ─────────────────────────────────────────────────────────────────────────────

const FiltroUrlSchema = FiltroNotificacoesSchema.extend({
  apenasNaoLidas: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

const FILTROS_DEFAULT = { take: 20, apenasNaoLidas: false as const };

// ─────────────────────────────────────────────────────────────────────────────
// Secção de lista (assíncrona — Suspense)
// ─────────────────────────────────────────────────────────────────────────────

async function NotificacoesSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: z.infer<typeof FiltroUrlSchema>;
  tenantId: string;
  userId: string;
}) {
  const { items, nextCursor } = await runWithTenantContext({ tenantId, userId }, () =>
    notificacaoService.listar(
      {
        apenasNaoLidas: filtros.apenasNaoLidas,
        tipo: filtros.tipo,
        cursor: filtros.cursor,
        take: filtros.take,
      },
      { tenantId, userId },
    ),
  );

  const temNaoLidas = items.some((n) => !n.lida);

  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <NotificacoesList
        items={items}
        nextCursor={nextCursor}
        temNaoLidas={temNaoLidas}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtros
// ─────────────────────────────────────────────────────────────────────────────

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'apenasNaoLidas',
    label: 'Estado',
    placeholder: 'Todas',
    options: [
      { label: 'Apenas não lidas', value: 'true' },
    ],
  },
  {
    key: 'tipo',
    label: 'Tipo',
    placeholder: 'Todos os tipos',
    options: [
      { label: 'Documento Expirado', value: 'DOCUMENTO_EXPIRADO' },
      { label: 'Documento a Expirar', value: 'DOCUMENTO_PROXIMO_EXPIRAR' },
      { label: 'Manutenção Pendente', value: 'MANUTENCAO_PENDENTE' },
      { label: 'Alerta do Sistema', value: 'ALERTA_SISTEMA' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────────

function NotificacoesListSkeleton() {
  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 p-4 border-b last:border-b-0">
          <div className="mt-1 h-2 w-2 rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted rounded w-2/3" />
            <div className="h-3 bg-muted rounded w-full" />
            <div className="h-3 bg-muted rounded w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NotificacoesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );

  const parseResult = FiltroUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Notificações"
        description="Centro de notificações e alertas da sua conta"
        breadcrumbs={[{ label: 'Notificações' }]}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/notificacoes/preferencias">
              <Settings className="h-4 w-4 mr-2" aria-hidden="true" />
              Preferências
            </Link>
          </Button>
        }
      />

      {/* Filtros */}
      <FilterBar
        searchPlaceholder="Pesquisar notificações…"
        searchKey="q"
        filters={FILTER_CONFIGS}
      />

      {/* Lista */}
      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<NotificacoesListSkeleton />}
      >
        <NotificacoesSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
