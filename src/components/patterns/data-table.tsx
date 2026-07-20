'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { EmptyState } from './empty-state';
import { type ReactNode } from 'react';

export interface TableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  /** Se true, a coluna fica oculta em ecrãs pequenos */
  mobileHidden?: boolean;
  sortKey?: string;
}

interface DataTableProps<T extends { id: string }> {
  data: T[];
  columns: TableColumn<T>[];
  /** Gera o href para a linha; se omitido, não há navegação ao clicar */
  rowHref?: (row: T) => string;
  /** Cursor do próximo registo para paginação */
  nextCursor?: string | null;
  /** Cursor da página actual (para botão Anterior) — não implementado no cursor-forward */
  prevCursor?: string | null;
  emptyState?: ReactNode;
  isLoading?: boolean;
  className?: string;
  /** Parâmetro searchParam que guarda o cursor (default: 'cursor') */
  cursorParam?: string;
  /** Parâmetro orderBy */
  orderByParam?: string;
  /** Parâmetro orderDir */
  orderDirParam?: string;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

function TableSkeleton({ cols, rows = 8 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/**
 * Tabela de dados server-paginada com cursor.
 * Colunas responsivas: as marcadas com mobileHidden desaparecem em <md.
 */
export function DataTable<T extends { id: string }>({
  data,
  columns,
  rowHref,
  nextCursor,
  emptyState,
  isLoading,
  className,
  cursorParam = 'cursor',
  orderByParam = 'orderBy',
  orderDirParam = 'orderDir',
  currentOrderBy,
  currentOrderDir = 'desc',
}: DataTableProps<T>) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleNextPage = () => {
    if (!nextCursor) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(cursorParam, nextCursor);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handlePrevPage = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(cursorParam);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleSort = (sortKey: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(cursorParam);
    if (currentOrderBy === sortKey) {
      params.set(orderDirParam, currentOrderDir === 'asc' ? 'desc' : 'asc');
    } else {
      params.set(orderByParam, sortKey);
      params.set(orderDirParam, 'desc');
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const hasCursor = !!searchParams.get(cursorParam);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    'h-10 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                    col.mobileHidden && 'hidden md:table-cell',
                    col.headerClassName
                  )}
                >
                  {col.sortKey ? (
                    <button
                      onClick={() => handleSort(col.sortKey!)}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      {col.label}
                      {currentOrderBy === col.sortKey ? (
                        currentOrderDir === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                      )}
                    </button>
                  ) : (
                    col.label
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              <TableSkeleton cols={columns.length} />
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="p-0">
                  {emptyState ?? (
                    <EmptyState
                      title="Sem registos"
                      description="Nenhum registo encontrado com os filtros actuais."
                    />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    'h-11',
                    rowHref && 'cursor-pointer hover:bg-muted/50 transition-colors'
                  )}
                  onClick={
                    rowHref
                      ? (e) => {
                          // Não navegar se clicou num botão/link dentro da linha
                          const target = e.target as HTMLElement;
                          if (
                            target.closest('button') ||
                            target.closest('a') ||
                            target.closest('[role="button"]')
                          ) {
                            return;
                          }
                          router.push(rowHref(row));
                        }
                      : undefined
                  }
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(
                        'text-sm py-2.5',
                        col.mobileHidden && 'hidden md:table-cell',
                        col.className
                      )}
                    >
                      {col.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Controlos de paginação (cursor-based) */}
      {(hasCursor || nextCursor) && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>
            {data.length > 0 && (
              <span>{data.length} registo{data.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasCursor && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevPage}
                disabled={isLoading}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
            )}
            {nextCursor && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={isLoading}
                aria-label="Próxima página"
              >
                Seguinte
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { TableSkeleton };
