'use client';

/**
 * Tabela de lançamentos contabilísticos — CLIENT COMPONENT.
 * Funções render VIVEM aqui (regra golden standard).
 */

import Link from 'next/link';
import { MoreHorizontal, Eye, RotateCcw } from 'lucide-react';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import { confirmarLancamento } from '@/server/actions/contabilidade.actions';

export interface LancamentoResumo {
  id: string;
  numero: string;
  data: string;
  historico: string;
  status: string;
  origem: string;
  totalDebito: string;
  diarioNome: string;
}

const formatMZN = (v: string) => {
  const n = parseFloat(v);
  return `MT ${n.toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function ConfirmarLancamentoBtn({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          className="text-primary"
        >
          <Eye className="mr-2 h-4 w-4" />
          Confirmar
        </DropdownMenuItem>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar lançamento?</AlertDialogTitle>
          <AlertDialogDescription>
            O lançamento ficará imutável após confirmação. Esta acção não pode ser desfeita —
            utilize o estorno para correcções posteriores.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await confirmarLancamento({ id });
                if (result.ok) {
                  toast.success('Lançamento confirmado.');
                  router.refresh();
                } else {
                  toast.error(result.error.message ?? 'Erro ao confirmar lançamento.');
                }
              })
            }
          >
            {isPending ? 'A confirmar…' : 'Confirmar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const columns: TableColumn<LancamentoResumo>[] = [
  {
    key: 'numero',
    label: 'Número',
    sortKey: 'numero',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.numero}</span>
    ),
  },
  {
    key: 'data',
    label: 'Data',
    sortKey: 'data',
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
    key: 'diarioNome',
    label: 'Diário',
    mobileHidden: true,
    render: (row) => <span className="text-sm">{row.diarioNome}</span>,
  },
  {
    key: 'historico',
    label: 'Histórico',
    render: (row) => (
      <span className="text-sm line-clamp-1">{row.historico}</span>
    ),
  },
  {
    key: 'totalDebito',
    label: 'Valor',
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums font-medium">{formatMZN(row.totalDebito)}</span>
    ),
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
            <Link href={`/contabilidade/lancamentos/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
          {row.status === 'RASCUNHO' && (
            <>
              <DropdownMenuSeparator />
              <ConfirmarLancamentoBtn id={row.id} />
            </>
          )}
          {row.status === 'LANCADO' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/contabilidade/lancamentos/${row.id}/estornar`}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Estornar
                </Link>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface LancamentosTableProps {
  data: LancamentoResumo[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function LancamentosTable({ data, nextCursor, currentOrderBy, currentOrderDir }: LancamentosTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/contabilidade/lancamentos/${row.id}`}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem lançamentos"
          description="Crie o primeiro lançamento contabilístico."
        />
      }
    />
  );
}
