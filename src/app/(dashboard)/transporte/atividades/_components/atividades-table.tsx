'use client';

/**
 * Tabela de Atividades — CLIENT COMPONENT.
 * Padrão golden standard: colunas com funções render num módulo 'use client'.
 */

import Link from 'next/link';
import { MoreHorizontal, Eye, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { AtividadeResumo } from '@/server/services/operacoes/atividade.interface';

const TIPO_LABELS: Record<string, string> = {
  DESLOCACAO: 'Deslocação',
  MISSAO_SERVICO: 'Missão de Serviço',
  TRANSPORTE_MERCADORIAS: 'Transporte de Mercadorias',
  TRANSPORTE_PESSOAL: 'Transporte de Pessoal',
  MANUTENCAO_CAMPO: 'Manutenção em Campo',
  OUTRO: 'Outro',
};

const columns: TableColumn<AtividadeResumo>[] = [
  {
    key: 'codigo',
    label: 'Código',
    sortKey: 'createdAt',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.codigo}</span>
    ),
  },
  {
    key: 'titulo',
    label: 'Título',
    render: (row) => <span className="font-medium">{row.titulo}</span>,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">
        {TIPO_LABELS[row.tipoActividade] ?? row.tipoActividade}
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
    key: 'dataInicio',
    label: 'Início Previsto',
    mobileHidden: true,
    sortKey: 'dataInicioPrevista',
    render: (row) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        {new Date(row.dataInicioPrevista).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
  {
    key: 'prioridade',
    label: 'Prioridade',
    mobileHidden: true,
    render: (row) => <StatusBadge status={row.prioridade} />,
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
            aria-label={`Acções para ${row.codigo}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/transporte/atividades/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
          {(row.estado === 'PLANEADA' || row.estado === 'SUSPENSA') && (
            <DropdownMenuItem asChild>
              <Link href={`/transporte/atividades/${row.id}/editar`}>
                <Edit className="mr-2 h-4 w-4" />
                Editar
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface AtividadesTableProps {
  data: AtividadeResumo[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function AtividadesTable({
  data,
  nextCursor,
  currentOrderBy,
  currentOrderDir,
}: AtividadesTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/transporte/atividades/${row.id}`}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem atividades registadas"
          description="Crie a primeira atividade para começar a registar operações de transporte."
        />
      }
    />
  );
}
