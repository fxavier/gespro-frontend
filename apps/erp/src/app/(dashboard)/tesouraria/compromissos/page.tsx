/**
 * Listagem de Compromissos de Tesouraria — Server Component (NUNCA 'use client').
 *
 * Compromisso = obrigação ou direito datado, por liquidar; NÃO é um
 * lançamento (design §1). Padrão golden standard: filtros em `searchParams`
 * parseados com `FiltroCompromissoSchema` (safeParse + defaults), dados
 * directamente do serviço em `runWithTenantContext`, `Suspense` por secção,
 * paginação por cursor.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { listarCompromissos } from '@/server/services/financas/projecao.service';
import {
  FiltroCompromissoSchema,
  type FiltroCompromissoInput,
} from '@/lib/validations/tesouraria';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, TableSkeleton } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CompromissosTable,
  type CompromissoLinha,
} from './_components/compromissos-table';

// O schema partilhado já é URL-safe (coerções de data/número/booleano);
// safeParse com defaults — URL inválido (cursor forjado, intervalo invertido)
// volta à listagem por omissão em vez de 500.
const FILTROS_DEFAULT: FiltroCompromissoInput = { take: 25 };

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'tipo',
    label: 'Tipo',
    placeholder: 'Todos os tipos',
    options: [
      { label: 'Entrada', value: 'ENTRADA' },
      { label: 'Saída', value: 'SAIDA' },
    ],
  },
  {
    key: 'recorrencia',
    label: 'Recorrência',
    placeholder: 'Todas',
    options: [
      { label: 'Única', value: 'UNICA' },
      { label: 'Mensal', value: 'MENSAL' },
      { label: 'Trimestral', value: 'TRIMESTRAL' },
      { label: 'Anual', value: 'ANUAL' },
    ],
  },
  {
    key: 'ativo',
    label: 'Estado',
    placeholder: 'Todos',
    options: [
      { label: 'Activo', value: 'true' },
      { label: 'Inactivo', value: 'false' },
    ],
  },
];

async function CompromissosSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroCompromissoInput;
  tenantId: string;
  userId: string;
}) {
  const resultado = await runWithTenantContext({ tenantId, userId }, () =>
    listarCompromissos(filtros, { tenantId, userId }),
  );

  const linhas: CompromissoLinha[] = resultado.items.map((c) => ({
    id: c.id,
    descricao: c.descricao,
    tipo: c.tipo,
    valor: c.valor.toString(),
    dataPrevista: c.dataPrevista.toISOString(),
    recorrencia: c.recorrencia,
    dataFimRecorrencia: c.dataFimRecorrencia?.toISOString() ?? null,
    ativo: c.ativo,
  }));

  return <CompromissosTable data={linhas} nextCursor={resultado.nextCursor} />;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CompromissosPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );

  const parsed = FiltroCompromissoSchema.safeParse(flatParams);
  const filtros = parsed.success ? parsed.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Compromissos de Tesouraria"
        description="Obrigações e direitos datados que entram na projecção sem nascerem de documentos do ERP"
        breadcrumbs={[
          { label: 'Tesouraria', href: '/tesouraria' },
          { label: 'Compromissos' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/tesouraria/compromissos/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Compromisso
            </Link>
          </Button>
        }
      />

      {/* FilterBar usa useSearchParams — obrigatoriamente em Suspense */}
      <Suspense fallback={<Skeleton className="h-9 w-full" />}>
        <FilterBar
          searchPlaceholder="Pesquisar por descrição…"
          searchKey="pesquisa"
          filters={FILTER_CONFIGS}
        />
      </Suspense>

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={7} />}
      >
        <CompromissosSection
          filtros={filtros}
          tenantId={tenantId}
          userId={userId}
        />
      </Suspense>
    </div>
  );
}
