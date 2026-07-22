'use client';

/**
 * Tabela de produtos do catálogo — CLIENT COMPONENT.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { MoreHorizontal, Edit, Eye, Archive } from 'lucide-react';
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
import type { ProdutoDto } from '@/server/services/inventario/catalogo.interface';
import { arquivarProdutoAction } from '@/server/actions/inventario.actions';

function ArquivarButton({ id, nome }: { id: string; nome: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleArquivar = () => {
    startTransition(async () => {
      const result = await arquivarProdutoAction({ id });
      if (result.ok) {
        toast.success(`Produto "${nome}" arquivado.`);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao arquivar produto.');
      }
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          className="text-destructive focus:text-destructive"
        >
          <Archive className="mr-2 h-4 w-4" />
          Arquivar
        </DropdownMenuItem>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Arquivar produto?</AlertDialogTitle>
          <AlertDialogDescription>
            O produto <strong>{nome}</strong> será desactivado e deixará de aparecer em listas activas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleArquivar}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? 'A arquivar…' : 'Arquivar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const columns: TableColumn<ProdutoDto>[] = [
  {
    key: 'sku',
    label: 'SKU',
    sortKey: 'sku',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.sku}</span>
    ),
  },
  {
    key: 'nome',
    label: 'Produto',
    sortKey: 'nome',
    render: (row) => (
      <div className="space-y-0.5">
        <div className="font-medium">{row.nome}</div>
        {row.marca && (
          <div className="text-xs text-muted-foreground">{row.marca}</div>
        )}
      </div>
    ),
  },
  {
    key: 'categoria',
    label: 'Categoria',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">{row.categoria?.nome ?? '—'}</span>
    ),
  },
  {
    key: 'unidadeMedida',
    label: 'Un.',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">{row.unidadeMedida}</span>
    ),
  },
  {
    key: 'precoVenda',
    label: 'P. Venda',
    sortKey: 'precoVenda',
    mobileHidden: true,
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums font-medium">
        MT {Number(row.precoVenda).toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    ),
  },
  {
    key: 'ativo',
    label: 'Estado',
    render: (row) => (
      <StatusBadge
        status={row.ativo ? 'ATIVO' : 'INATIVO'}
        variant={row.ativo ? 'success' : 'secondary'}
        label={row.ativo ? 'Activo' : 'Inactivo'}
      />
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
            <Link href={`/produtos/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
          {row.ativo && (
            <DropdownMenuItem asChild>
              <Link href={`/produtos/${row.id}/editar`}>
                <Edit className="mr-2 h-4 w-4" />
                Editar
              </Link>
            </DropdownMenuItem>
          )}
          {row.ativo && (
            <>
              <DropdownMenuSeparator />
              <div onClick={(e) => e.stopPropagation()}>
                <ArquivarButton id={row.id} nome={row.nome} />
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface ProdutosTableProps {
  data: ProdutoDto[];
  nextCursor?: string | null;
  currentOrderBy?: string;
  currentOrderDir?: string;
}

export function ProdutosTable({ data, nextCursor, currentOrderBy, currentOrderDir }: ProdutosTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/produtos/${row.id}`}
      nextCursor={nextCursor}
      currentOrderBy={currentOrderBy}
      currentOrderDir={currentOrderDir as 'asc' | 'desc'}
      emptyState={
        <EmptyState
          title="Sem produtos no catálogo"
          description="Adicione o primeiro produto ao catálogo da empresa."
        />
      }
    />
  );
}
