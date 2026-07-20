'use client';

/**
 * Tabela de ativos — CLIENT COMPONENT.
 * REGRA GOLDEN STANDARD: colunas com render/rowHref VIVEM SEMPRE num módulo 'use client'.
 */

import Link from 'next/link';
import { MoreHorizontal, Edit, Eye, MapPin } from 'lucide-react';
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
import type { AtivoDto } from '@/server/services/inventario/ativos.interface';
import { AtivoAcoes } from './ativo-acoes';

// Mapa de variantes para EstadoAtivo (não está no STATUS_MAP global)
const ESTADO_VARIANTES: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'outline'> = {
  NOVO: 'info',
  EM_USO: 'success',
  EM_MANUTENCAO: 'warning',
  EM_TRANSFERENCIA: 'warning',
  OBSOLETO: 'secondary',
  BAIXADO: 'destructive',
};

const ESTADO_LABELS: Record<string, string> = {
  NOVO: 'Novo',
  EM_USO: 'Em Uso',
  EM_MANUTENCAO: 'Em Manutenção',
  EM_TRANSFERENCIA: 'Em Transferência',
  OBSOLETO: 'Obsoleto',
  BAIXADO: 'Baixado',
};

const columns: TableColumn<AtivoDto>[] = [
  {
    key: 'codigoInterno',
    label: 'Código',
    sortKey: 'codigoInterno',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">
        {row.codigoInterno}
      </span>
    ),
  },
  {
    key: 'nome',
    label: 'Ativo',
    sortKey: 'nome',
    render: (row) => (
      <div className="space-y-0.5">
        <div className="font-medium">{row.nome}</div>
        {(row.marca || row.modelo) && (
          <div className="text-xs text-muted-foreground">
            {[row.marca, row.modelo].filter(Boolean).join(' ')}
          </div>
        )}
      </div>
    ),
  },
  {
    key: 'categoria',
    label: 'Categoria',
    mobileHidden: true,
    render: (row) => row.categoria?.nome ?? <span className="text-muted-foreground">—</span>,
  },
  {
    key: 'estado',
    label: 'Estado',
    render: (row) => (
      <StatusBadge
        status={row.estado}
        variant={ESTADO_VARIANTES[row.estado]}
        label={ESTADO_LABELS[row.estado]}
      />
    ),
  },
  {
    key: 'localizacao',
    label: 'Localização',
    mobileHidden: true,
    render: (row) => (
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <MapPin className="h-3 w-3" />
        <span className="truncate max-w-[120px]" title={row.localizacaoId}>
          {row.localizacaoId.slice(0, 8)}…
        </span>
      </div>
    ),
  },
  {
    key: 'valorCompra',
    label: 'Valor',
    sortKey: 'valorCompra',
    mobileHidden: true,
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="font-medium tabular-nums">
        MT {Number(row.valorCompra).toLocaleString('pt-MZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </span>
    ),
  },
  {
    key: 'dataAquisicao',
    label: 'Aquisição',
    sortKey: 'dataAquisicao',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-muted-foreground text-sm">
        {new Date(row.dataAquisicao).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
  {
    key: 'acoes',
    label: '',
    className: 'w-10',
    render: (row) => {
      const podeEditar = row.estado !== 'BAIXADO';

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={`Acções para ${row.codigoInterno}`}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/inventario/ativos/${row.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                Ver detalhe
              </Link>
            </DropdownMenuItem>
            {podeEditar && (
              <DropdownMenuItem asChild>
                <Link href={`/inventario/ativos/${row.id}/editar`}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <div className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
              <AtivoAcoes id={row.id} estado={row.estado} modoCompacto />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

interface AtivosTableProps {
  data: AtivoDto[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function AtivosTable({ data, nextCursor, currentOrderBy, currentOrderDir }: AtivosTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/inventario/ativos/${row.id}`}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem ativos registados"
          description="Crie o primeiro ativo para começar a gerir o inventário da empresa."
        />
      }
    />
  );
}
