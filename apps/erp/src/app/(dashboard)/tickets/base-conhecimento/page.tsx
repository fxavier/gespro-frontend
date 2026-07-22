/**
 * Base de Conhecimento — Server Component.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, BookOpen, Eye } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { baseConhecimentoService } from '@/server/services/operacoes/ticket.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader, FilterBar } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { Skeleton } from '@/components/ui/skeleton';
import type { BaseConhecimentoResumo } from '@/server/services/operacoes/ticket.interface';

const UrlSchema = z.object({
  pesquisa: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
  orderBy: z.enum(['createdAt', 'visualizacoes', 'util']).default('visualizacoes'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

type UrlFiltros = z.infer<typeof UrlSchema>;
const FILTROS_DEFAULT: UrlFiltros = { take: 25, orderBy: 'visualizacoes', order: 'desc' };

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

function ArtigoCard({ artigo }: { artigo: BaseConhecimentoResumo }) {
  return (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <BookOpen className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{artigo.titulo}</p>
            {artigo.resumo && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{artigo.resumo}</p>
            )}
            <div className="flex items-center gap-3 mt-2">
              <Badge variant="outline" className="text-xs">{artigo.categoria}</Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {artigo.visualizacoes} visualizações
              </span>
              <span className="text-xs text-muted-foreground">
                {artigo.util} útil
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

async function ArtigosLista({ filtros, tenantId, userId }: { filtros: UrlFiltros; tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext(ctx, () =>
    baseConhecimentoService.listarArtigos(
      {
        pesquisa: filtros.pesquisa,
        take: filtros.take,
        cursor: filtros.cursor,
        orderBy: filtros.orderBy,
        order: filtros.order,
      },
      ctx
    )
  );

  if (result.items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-12">
        Nenhum artigo encontrado.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {result.items.map((artigo) => (
        <ArtigoCard key={artigo.id} artigo={artigo} />
      ))}
    </div>
  );
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'orderBy',
    label: 'Ordenar por',
    placeholder: 'Visualizações',
    options: [
      { label: 'Mais visualizados', value: 'visualizacoes' },
      { label: 'Mais úteis', value: 'util' },
      { label: 'Mais recentes', value: 'createdAt' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BaseConhecimentoPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = UrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Base de Conhecimento"
        description="Artigos e soluções para problemas frequentes"
        breadcrumbs={[
          { label: 'Tickets', href: '/tickets' },
          { label: 'Base de Conhecimento' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/tickets/base-conhecimento/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Artigo
            </Link>
          </Button>
        }
      />

      <FilterBar
        searchPlaceholder="Pesquisar artigos…"
        searchKey="pesquisa"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<ListSkeleton />}>
        <ArtigosLista filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
