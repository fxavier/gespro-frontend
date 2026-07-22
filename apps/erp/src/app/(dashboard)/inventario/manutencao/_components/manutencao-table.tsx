'use client';

/**
 * Tabela de manutenções — CLIENT COMPONENT.
 * Colunas com render VIVEM sempre num módulo 'use client' (RSC serialization boundary).
 */

import Link from 'next/link';
import { MoreHorizontal, Edit, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { ManutencaoAtivoDto } from '@/server/services/inventario/manutencao.interface';
import { ManutencaoAcoes } from './manutencao-acoes';

const STATUS_VARIANTES: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'outline'> = {
  AGENDADA: 'info',
  EM_ANDAMENTO: 'warning',
  ORCAMENTO: 'secondary',
  CONCLUIDA: 'success',
  CANCELADA: 'destructive',
};

const STATUS_LABELS: Record<string, string> = {
  AGENDADA: 'Agendada',
  EM_ANDAMENTO: 'Em Andamento',
  ORCAMENTO: 'Orçamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

const TIPO_LABELS: Record<string, string> = {
  PREVENTIVA: 'Preventiva',
  CORRETIVA: 'Corretiva',
  INSPECAO: 'Inspecção',
  CALIBRACAO: 'Calibração',
};

const PRIORIDADE_VARIANTES: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'outline'> = {
  BAIXA: 'secondary',
  MEDIA: 'info',
  ALTA: 'warning',
  CRITICA: 'destructive',
};

const PRIORIDADE_LABELS: Record<string, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  CRITICA: 'Crítica',
};

const columns: TableColumn<ManutencaoAtivoDto>[] = [
  {
    key: 'titulo',
    label: 'Manutenção',
    render: (row) => (
      <div className="space-y-0.5">
        <div className="font-medium">{row.titulo}</div>
        <div className="text-xs text-muted-foreground">
          {TIPO_LABELS[row.tipo] ?? row.tipo}
        </div>
      </div>
    ),
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => (
      <StatusBadge
        status={row.status}
        variant={STATUS_VARIANTES[row.status]}
        label={STATUS_LABELS[row.status]}
      />
    ),
  },
  {
    key: 'prioridade',
    label: 'Prioridade',
    mobileHidden: true,
    render: (row) =>
      row.prioridade ? (
        <StatusBadge
          status={row.prioridade}
          variant={PRIORIDADE_VARIANTES[row.prioridade]}
          label={PRIORIDADE_LABELS[row.prioridade]}
        />
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: 'dataAgendada',
    label: 'Data Agendada',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-sm text-muted-foreground">
        {new Date(row.dataAgendada).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
  {
    key: 'custoEstimado',
    label: 'Custo Estimado',
    mobileHidden: true,
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) =>
      row.custoEstimado ? (
        <span className="tabular-nums font-medium">
          MT {Number(row.custoEstimado).toLocaleString('pt-MZ', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: 'acoes',
    label: '',
    className: 'w-10',
    render: (row) => {
      const podeEditar = !['CONCLUIDA', 'CANCELADA'].includes(row.status);

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={`Acções para ${row.titulo}`}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/inventario/manutencao/${row.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                Ver detalhe
              </Link>
            </DropdownMenuItem>
            {podeEditar && (
              <DropdownMenuItem asChild>
                <Link href={`/inventario/manutencao/${row.id}/editar`}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <div className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
              <ManutencaoAcoes id={row.id} status={row.status} modoCompacto />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

interface ManutencaoTableProps {
  data: ManutencaoAtivoDto[];
  nextCursor?: string | null;
}

export function ManutencaoTable({ data, nextCursor }: ManutencaoTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/inventario/manutencao/${row.id}`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem manutenções registadas"
          description="Agende a primeira manutenção para gerir os activos da empresa."
        />
      }
    />
  );
}
