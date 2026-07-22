'use client';

/**
 * Tabela de Viaturas — CLIENT COMPONENT.
 *
 * Padrão golden standard: definições de colunas com funções render
 * VIVEM num módulo Client Component. Dados ViaturaResumo são planos
 * e serializam correctamente do Server Component pai.
 */

import Link from 'next/link';
import { MoreHorizontal, Eye, Edit, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { ViaturaResumo } from '@/server/services/operacoes/viatura.interface';

const TIPO_LABELS: Record<string, string> = {
  LIGEIRO_PASSAGEIROS: 'Lig. Passageiros',
  LIGEIRO_MERCADORIAS: 'Lig. Mercadorias',
  PESADO_MERCADORIAS: 'Pes. Mercadorias',
  PESADO_PASSAGEIROS: 'Pes. Passageiros',
  MOTOCICLO: 'Motociclo',
  OUTRO: 'Outro',
};

const columns: TableColumn<ViaturaResumo>[] = [
  {
    key: 'matricula',
    label: 'Matrícula',
    sortKey: 'matricula',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.matricula}</span>
    ),
  },
  {
    key: 'marca',
    label: 'Marca / Modelo',
    sortKey: 'marca',
    render: (row) => (
      <div>
        <span className="font-medium">{row.marca}</span>
        <span className="text-muted-foreground"> {row.modelo}</span>
      </div>
    ),
  },
  {
    key: 'tipo',
    label: 'Tipo',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">
        {TIPO_LABELS[row.tipoViatura] ?? row.tipoViatura}
      </span>
    ),
  },
  {
    key: 'capacidade',
    label: 'Capacidade',
    mobileHidden: true,
    className: 'tabular-nums',
    render: (row) => (
      <span className="text-sm tabular-nums">
        {row.capacidade} {row.unidadeCapacidade.toLowerCase()}
      </span>
    ),
  },
  {
    key: 'local',
    label: 'Local',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">{row.localActividade}</span>
    ),
  },
  {
    key: 'estado',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.estado} />,
  },
  {
    key: 'acoes',
    label: '',
    className: 'w-10',
    render: (row) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={`Acções para ${row.matricula}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/transporte/veiculos/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/transporte/veiculos/${row.id}/editar`}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface ViaturasTableProps {
  data: ViaturaResumo[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function ViaturasTable({
  data,
  nextCursor,
  currentOrderBy,
  currentOrderDir,
}: ViaturasTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/transporte/veiculos/${row.id}`}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem viaturas registadas"
          description="Registe a primeira viatura para começar a gerir a frota."
        />
      }
    />
  );
}
