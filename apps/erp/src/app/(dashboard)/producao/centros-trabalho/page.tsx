/**
 * Centros de Trabalho — Server Component (NUNCA 'use client'). #165.
 * Lista pelo `CentroTrabalhoService.listar`; criar e editar são rotas próprias.
 */

import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { runWithTenantContext } from "@/server/db/tenant-extension";
import { CentroTrabalhoService } from "@/server/services/pessoas-projetos/producao.service";
import { Button } from "@/components/ui/button";
import { PageHeader, FilterBar, TableSkeleton } from "@/components/patterns";
import type { FilterConfig } from "@/components/patterns";
import { CentrosTrabalhoTable } from "./_components/centros-trabalho-table";
import type { CentroTrabalhoRow } from "./_components/centros-trabalho-table";

const FiltroUrlSchema = z.object({
  search: z.string().optional(),
  tipo: z.enum(["MAQUINA", "PESSOA", "CELULA", "LINHA"]).optional(),
  ativo: z.enum(["true", "false"]).optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

async function CentrosTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: Filtro;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };

  const result = await runWithTenantContext(ctx, () =>
    CentroTrabalhoService.listar(
      {
        search: filtros.search,
        tipo: filtros.tipo,
        ativo:
          filtros.ativo === undefined ? undefined : filtros.ativo === "true",
        cursor: filtros.cursor,
        take: filtros.take,
      },
      ctx,
    ),
  );

  const data: CentroTrabalhoRow[] = result.items.map((c) => ({
    id: c.id,
    codigo: c.codigo,
    nome: c.nome,
    tipo: c.tipo,
    capacidadeHorasDia: c.capacidadeHorasDia?.toString() ?? null,
    custoHora: c.custoHora.toString(),
    ativo: c.ativo,
  }));

  return (
    <CentrosTrabalhoTable
      data={data}
      nextCursor={result.nextCursor ?? undefined}
    />
  );
}

const FILTER_CONFIG: FilterConfig[] = [
  {
    key: "tipo",
    label: "Tipo",
    options: [
      { label: "Máquina", value: "MAQUINA" },
      { label: "Pessoa", value: "PESSOA" },
      { label: "Célula", value: "CELULA" },
      { label: "Linha", value: "LINHA" },
    ],
  },
  {
    key: "ativo",
    label: "Estado",
    options: [
      { label: "Activo", value: "true" },
      { label: "Inactivo", value: "false" },
    ],
  },
];

export default async function CentrosTrabalhoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawParams)) {
    if (typeof v === "string") flatParams[k] = v;
    else if (Array.isArray(v)) flatParams[k] = v[0] ?? "";
  }

  const parseResult = FiltroUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Centros de Trabalho"
        description="Máquinas, pessoas, células e linhas onde as operações dos roteiros correm"
        breadcrumbs={[
          { label: "Produção", href: "/producao" },
          { label: "Centros de Trabalho" },
        ]}
        actions={
          <Button size="sm" asChild>
            <Link href="/producao/centros-trabalho/novo">
              <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Novo centro
            </Link>
          </Button>
        }
      />

      <FilterBar
        filters={FILTER_CONFIG}
        searchKey="search"
        searchPlaceholder="Pesquisar por código ou nome…"
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={6} />}
      >
        <CentrosTableSection
          filtros={filtros}
          tenantId={tenantId}
          userId={userId}
        />
      </Suspense>
    </div>
  );
}
