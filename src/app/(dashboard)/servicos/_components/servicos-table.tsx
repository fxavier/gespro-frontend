'use client';

/**
 * Tabela de serviços — CLIENT COMPONENT.
 * Regra golden standard: definições de colunas com funções render/rowHref
 * vivem sempre num módulo Client Component.
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
import type { ServicoResumo } from '@/server/services/compras/servico.service.interface';
import { ServicoAcoes } from './servico-acoes';

const columns: TableColumn<ServicoResumo>[] = [
  {
    key: 'codigo',
    label: 'Código',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">
        {row.codigo}
      </span>
    ),
  },
  {
    key: 'nome',
    label: 'Nome do Serviço',
    sortKey: 'nome',
    render: (row) => (
      <div>
        <p className="font-medium">{row.nome}</p>
        {row.categoriaNome && (
          <p className="text-xs text-muted-foreground">{row.categoriaNome}</p>
        )}
      </div>
    ),
  },
  {
    key: 'tipoServico',
    label: 'Tipo',
    mobileHidden: true,
    render: (row) => <StatusBadge status={row.tipoServico} />,
  },
  {
    key: 'preco',
    label: 'Preço',
    sortKey: 'preco',
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="font-medium tabular-nums">
        MT{' '}
        {row.preco.toLocaleString('pt-MZ', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
    ),
  },
  {
    key: 'disponivel',
    label: 'Disponível',
    mobileHidden: true,
    render: (row) => (
      <StatusBadge status={row.disponivel ? 'DISPONIVEL' : 'INDISPONIVEL'} />
    ),
  },
  {
    key: 'ativo',
    label: 'Estado',
    render: (row) => (
      <StatusBadge status={row.ativo ? 'ATIVO' : 'INATIVO'} />
    ),
  },
  {
    key: 'totalVendas',
    label: 'Vendas',
    mobileHidden: true,
    sortKey: 'totalVendas',
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums text-muted-foreground">
        {row.totalVendas}
      </span>
    ),
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
            aria-label={`Acções para ${row.nome}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/servicos/lista/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/servicos/lista/${row.id}/editar`}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
            <ServicoAcoes id={row.id} ativo={row.ativo} modoCompacto />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface ServicosTableProps {
  data: ServicoResumo[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function ServicosTable({
  data,
  nextCursor,
  currentOrderBy,
  currentOrderDir,
}: ServicosTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/servicos/lista/${row.id}`}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem serviços registados"
          description="Crie o primeiro serviço para começar a gerir agendamentos."
        />
      }
    />
  );
}
