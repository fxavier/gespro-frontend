'use client';

import Link from 'next/link';
import { MoreHorizontal, Eye, FileCheck, XCircle } from 'lucide-react';
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

export interface CotacaoResumo {
  id: string;
  numero: string;
  clienteNome: string;
  dataEmissao: string;
  dataValidade: string;
  total: string;
  status: string;
}

const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString('pt-PT') : '—';
const fmtMZN = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });

const columns: TableColumn<CotacaoResumo>[] = [
  {
    key: 'numero',
    label: 'Nº Cotação',
    render: (row) => <span className="font-mono font-medium text-primary">{row.numero}</span>,
  },
  {
    key: 'clienteNome',
    label: 'Cliente',
    render: (row) => <span className="font-medium">{row.clienteNome}</span>,
  },
  {
    key: 'dataEmissao',
    label: 'Emissão',
    mobileHidden: true,
    render: (row) => <span className="text-sm text-muted-foreground">{fmtDate(row.dataEmissao)}</span>,
  },
  {
    key: 'dataValidade',
    label: 'Validade',
    mobileHidden: true,
    render: (row) => <span className="text-sm text-muted-foreground">{fmtDate(row.dataValidade)}</span>,
  },
  {
    key: 'total',
    label: 'Valor',
    className: 'text-right tabular-nums font-semibold',
    headerClassName: 'text-right',
    render: (row) => fmtMZN.format(parseFloat(row.total)),
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'acoes',
    label: '',
    className: 'w-10',
    render: (row) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/faturacao/cotacoes/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/faturacao/cotacoes/${row.id}/converter`}>
              <FileCheck className="mr-2 h-4 w-4" />
              Converter em Proforma
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={`/faturacao/cotacoes/${row.id}/rejeitar`} className="text-destructive">
              <XCircle className="mr-2 h-4 w-4" />
              Rejeitar
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface CotacoesTableProps {
  data: CotacaoResumo[];
  nextCursor?: string | null;
}

export function CotacoesTable({ data, nextCursor }: CotacoesTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/faturacao/cotacoes/${row.id}`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem cotações comerciais"
          description="Crie a primeira cotação para um cliente."
        />
      }
    />
  );
}
