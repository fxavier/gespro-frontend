'use client';

/**
 * Tabela de requisições de compra — CLIENT COMPONENT.
 *
 * REGRA GOLDEN STANDARD: definições de colunas com funções `render`/`rowHref`
 * VIVEM SEMPRE num módulo Client Component. Funções não serializam para o servidor
 * ("Functions cannot be passed directly to Client Components unless marked with
 * 'use server'"). O Server Component pai importa este wrapper; os dados
 * RequisicaoCompraResumo são objectos planos e serializam correctamente.
 *
 * Os 7 agentes UI paralelos devem replicar este padrão nos seus módulos.
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
import type { RequisicaoCompraResumo } from '@/server/services/compras/compras.service.interface';
import { RequisicaoAcoes } from './requisicao-acoes';

const columns: TableColumn<RequisicaoCompraResumo>[] = [
  {
    key: 'numero',
    label: 'Número',
    sortKey: 'numero',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">
        {row.numero}
      </span>
    ),
  },
  {
    key: 'data',
    label: 'Data',
    sortKey: 'createdAt',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-muted-foreground">
        {new Date(row.data).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
  {
    key: 'solicitante',
    label: 'Solicitante',
    render: (row) => row.solicitanteNome,
  },
  {
    key: 'departamento',
    label: 'Departamento',
    mobileHidden: true,
    render: (row) => row.departamento,
  },
  {
    key: 'prioridade',
    label: 'Prioridade',
    mobileHidden: true,
    // StatusBadge usa STATUS_MAP global — não duplicar mapa local
    render: (row) => <StatusBadge status={row.prioridade} />,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'valorTotal',
    label: 'Valor Total',
    sortKey: 'valorTotal',
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="font-medium tabular-nums">
        MT{' '}
        {row.valorTotal.toLocaleString('pt-MZ', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
    ),
  },
  {
    key: 'aprovacao',
    label: 'Aprovação',
    mobileHidden: true,
    className: 'text-center tabular-nums',
    headerClassName: 'text-center',
    render: (row) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {row.nivelAprovacaoActual}/{row.totalNiveis}
      </span>
    ),
  },
  {
    key: 'acoes',
    label: '',
    className: 'w-10',
    render: (row) => {
      const podeEditar = row.status === 'RASCUNHO' || row.status === 'PENDENTE';

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={`Acções para ${row.numero}`}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/compras/requisicoes/${row.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                Ver detalhe
              </Link>
            </DropdownMenuItem>
            {podeEditar && (
              <DropdownMenuItem asChild>
                <Link href={`/compras/requisicoes/${row.id}/editar`}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {/* RequisicaoAcoes: padrão canónico de mutação de estado */}
            <div className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
              <RequisicaoAcoes id={row.id} status={row.status} modoCompacto />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

interface RequisicoesTableProps {
  data: RequisicaoCompraResumo[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function RequisicoesTable({
  data,
  nextCursor,
  currentOrderBy,
  currentOrderDir,
}: RequisicoesTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/compras/requisicoes/${row.id}`}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem requisições de compra"
          description="Crie a primeira requisição para dar início ao processo de compras."
        />
      }
    />
  );
}
