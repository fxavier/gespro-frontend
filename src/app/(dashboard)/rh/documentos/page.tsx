/**
 * Documentos RH — Server Component (NUNCA 'use client').
 * Lista documentos dos colaboradores.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { FileText } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import {
  PageHeader,
  FilterBar,
  StatusBadge,
  DataTable,
  TableSkeleton,
} from '@/components/patterns';
import type { FilterConfig, TableColumn } from '@/components/patterns';

const FiltroUrlSchema = z.object({
  tipo: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

interface DocRow {
  id: string;
  colaboradorNome: string;
  tipo: string;
  nome: string;
  dataUpload: string;
}

const columns: TableColumn<DocRow>[] = [
  {
    key: 'colaboradorNome',
    label: 'Colaborador',
    render: (row) => <span className="font-medium">{row.colaboradorNome}</span>,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => <StatusBadge status={row.tipo} />,
  },
  {
    key: 'nome',
    label: 'Ficheiro',
    render: (row) => <span className="text-sm text-muted-foreground">{row.nome}</span>,
    mobileHidden: true,
  },
  {
    key: 'dataUpload',
    label: 'Data Upload',
    render: (row) => <span className="tabular-nums">{row.dataUpload}</span>,
    mobileHidden: true,
  },
];

async function DocumentosTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: Filtro;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };

  const rows = await runWithTenantContext(ctx, () =>
    prisma.documentoColaborador.findMany({
      where: {
        tenantId,
        ...(filtros.tipo ? { tipo: filtros.tipo as never } : {}),
      },
      select: {
        id: true,
        tipo: true,
        nome: true,
        dataUpload: true,
        colaborador: { select: { nome: true } },
      },
      orderBy: { dataUpload: 'desc' },
      take: filtros.take,
      ...(filtros.cursor ? { cursor: { id: filtros.cursor }, skip: 1 } : {}),
    })
  );

  const data: DocRow[] = rows.map((d) => ({
    id: d.id,
    colaboradorNome: d.colaborador.nome,
    tipo: d.tipo,
    nome: d.nome,
    dataUpload: d.dataUpload.toLocaleDateString('pt-PT'),
  }));

  const nextCursor = data.length === filtros.take ? data[data.length - 1]?.id : undefined;

  return <DataTable data={data} columns={columns} nextCursor={nextCursor} />;
}

const FILTER_CONFIG: FilterConfig[] = [
  {
    key: 'tipo',
    label: 'Tipo',
    options: [
      { label: 'Bilhete de Identidade', value: 'BI_FRENTE' },
      { label: 'Certificado de Habilitações', value: 'CERTIFICADO_HABILITACOES' },
      { label: 'Curriculum', value: 'CURRICULUM' },
      { label: 'Comprovativo de Residência', value: 'COMPROVATIVO_RESIDENCIA' },
      { label: 'Declaração NUIT', value: 'DECLARACAO_NUIT' },
      { label: 'Foto', value: 'FOTO' },
    ],
  },
];

export default async function DocumentosRHPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawParams)) {
    if (typeof v === 'string') flatParams[k] = v;
    else if (Array.isArray(v)) flatParams[k] = v[0] ?? '';
  }

  const parseResult = FiltroUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Documentos"
        description="Repositório de documentos dos colaboradores"
        breadcrumbs={[
          { label: 'RH', href: '/rh' },
          { label: 'Documentos' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Upload via ficha do colaborador</span>
          </div>
        }
      />

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={4} />}
      >
        <DocumentosTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
