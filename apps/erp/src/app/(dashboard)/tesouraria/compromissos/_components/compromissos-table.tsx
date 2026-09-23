'use client';

/**
 * Tabela de compromissos de tesouraria — CLIENT COMPONENT (colunas com
 * `render`/`rowHref` não atravessam a fronteira RSC).
 *
 * Sem modais: editar é rota dedicada; o `AlertDialog` só CONFIRMA a
 * eliminação (soft delete), nunca recolhe dados — a única excepção admitida.
 * Datas por `format-date.ts`, dinheiro por `formatMZN`, estado via
 * `StatusBadge` com o mapa único (ENTRADA/SAIDA/ATIVO/INATIVO registados lá).
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { eliminarCompromissoAction } from '@/server/actions/tesouraria.actions';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';
import { cn } from '@/lib/utils';

/** Linha já serializada na fronteira SC→CC (`Decimal`→string, `Date`→ISO). */
export interface CompromissoLinha {
  id: string;
  descricao: string;
  tipo: 'ENTRADA' | 'SAIDA';
  valor: string;
  dataPrevista: string;
  recorrencia: 'UNICA' | 'MENSAL' | 'TRIMESTRAL' | 'ANUAL';
  dataFimRecorrencia: string | null;
  ativo: boolean;
}

export const RECORRENCIA_LABELS: Record<CompromissoLinha['recorrencia'], string> = {
  UNICA: 'Única',
  MENSAL: 'Mensal',
  TRIMESTRAL: 'Trimestral',
  ANUAL: 'Anual',
};

function EliminarCompromisso({ row }: { row: CompromissoLinha }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [isPending, startTransition] = useTransition();

  const eliminar = () => {
    startTransition(async () => {
      const result = await eliminarCompromissoAction({ id: row.id });
      if (result.ok) {
        toast.success('Compromisso eliminado.');
        setAberto(false);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao eliminar o compromisso.');
      }
    });
  };

  return (
    <AlertDialog open={aberto} onOpenChange={setAberto}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          aria-label={`Eliminar compromisso ${row.descricao}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar compromisso?</AlertDialogTitle>
          <AlertDialogDescription>
            «{row.descricao}» deixa de entrar na projecção de tesouraria. A
            eliminação é lógica e não afecta documentos do ERP.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              eliminar();
            }}
            disabled={isPending}
          >
            {isPending ? 'A eliminar…' : 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const columns: TableColumn<CompromissoLinha>[] = [
  {
    key: 'descricao',
    label: 'Descrição',
    render: (row) => <span className="font-medium">{row.descricao}</span>,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => <StatusBadge status={row.tipo} />,
  },
  {
    key: 'valor',
    label: 'Valor',
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span
        className={cn(
          'font-medium tabular-nums',
          row.tipo === 'ENTRADA' ? 'text-success' : 'text-destructive',
        )}
      >
        {row.tipo === 'ENTRADA' ? '+' : '−'}
        {formatMZN(row.valor)}
      </span>
    ),
  },
  {
    key: 'dataPrevista',
    label: 'Data prevista',
    render: (row) => (
      <span className="tabular-nums">{formatarData(row.dataPrevista)}</span>
    ),
  },
  {
    key: 'recorrencia',
    label: 'Recorrência',
    mobileHidden: true,
    render: (row) => (
      <span className="text-muted-foreground">
        {RECORRENCIA_LABELS[row.recorrencia]}
        {row.dataFimRecorrencia && (
          <span className="tabular-nums">
            {' '}
            até {formatarData(row.dataFimRecorrencia)}
          </span>
        )}
      </span>
    ),
  },
  {
    key: 'ativo',
    label: 'Estado',
    mobileHidden: true,
    render: (row) => <StatusBadge status={row.ativo ? 'ATIVO' : 'INATIVO'} />,
  },
  {
    key: 'acoes',
    label: '',
    className: 'w-20',
    render: (row) => (
      <div
        className="flex items-center justify-end gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={`Editar compromisso ${row.descricao}`}
        >
          <Link href={`/tesouraria/compromissos/${row.id}/editar`}>
            <Pencil className="h-4 w-4" />
          </Link>
        </Button>
        <EliminarCompromisso row={row} />
      </div>
    ),
  },
];

interface CompromissosTableProps {
  data: CompromissoLinha[];
  nextCursor?: string | null;
}

export function CompromissosTable({ data, nextCursor }: CompromissosTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/tesouraria/compromissos/${row.id}/editar`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem compromissos manuais"
          description="Crie um compromisso para incluir na projecção obrigações ou direitos que não nascem de documentos do ERP — rendas, prestações, financiamentos."
        />
      }
    />
  );
}
