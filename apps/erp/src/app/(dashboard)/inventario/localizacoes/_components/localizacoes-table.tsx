'use client';

/**
 * Tabela de localizações — CLIENT COMPONENT.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { MoreHorizontal, Edit, PowerOff, MapPin } from 'lucide-react';
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
import type { LocalizacaoDto } from '@/server/services/inventario/stock.interface';
import { desactivarLocalizacaoAction } from '@/server/actions/inventario.actions';

const TIPO_LABELS: Record<string, string> = {
  ARMAZEM: 'Armazém',
  ESCRITORIO: 'Escritório',
  DEPARTAMENTO: 'Departamento',
  FILIAL: 'Filial',
  PRATELEIRA: 'Prateleira',
  SALA: 'Sala',
  ANDAR: 'Andar',
  AREA_TECNICA: 'Área Técnica',
};

function DesactivarButton({ id, nome }: { id: string; nome: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleDesactivar = () => {
    startTransition(async () => {
      const result = await desactivarLocalizacaoAction({ id });
      if (result.ok) {
        toast.success(`Localização "${nome}" desactivada.`);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao desactivar localização.');
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
          <PowerOff className="mr-2 h-4 w-4" />
          Desactivar
        </DropdownMenuItem>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desactivar localização?</AlertDialogTitle>
          <AlertDialogDescription>
            A localização <strong>{nome}</strong> será desactivada e deixará de estar disponível para novos ativos e stock.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDesactivar}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? 'A desactivar…' : 'Desactivar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const columns: TableColumn<LocalizacaoDto>[] = [
  {
    key: 'codigo',
    label: 'Código',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.codigo}</span>
    ),
  },
  {
    key: 'nome',
    label: 'Localização',
    render: (row) => (
      <div className="flex items-center gap-2">
        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div>
          <div className="font-medium">{row.nome}</div>
          {row.endereco && (
            <div className="text-xs text-muted-foreground truncate max-w-[180px]">{row.endereco}</div>
          )}
        </div>
      </div>
    ),
  },
  {
    key: 'tipo',
    label: 'Tipo',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">{TIPO_LABELS[row.tipo] ?? row.tipo}</span>
    ),
  },
  {
    key: 'capacidade',
    label: 'Capacidade',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-sm text-muted-foreground">
        {row.capacidade ? Number(row.capacidade).toLocaleString('pt-MZ') : '—'}
      </span>
    ),
  },
  {
    key: 'ativa',
    label: 'Estado',
    render: (row) => (
      <StatusBadge
        status={row.ativa ? 'ATIVA' : 'INATIVA'}
        variant={row.ativa ? 'success' : 'secondary'}
        label={row.ativa ? 'Activa' : 'Inactiva'}
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
            <Link href={`/inventario/localizacoes/${row.id}/editar`}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Link>
          </DropdownMenuItem>
          {row.ativa && (
            <>
              <DropdownMenuSeparator />
              <div onClick={(e) => e.stopPropagation()}>
                <DesactivarButton id={row.id} nome={row.nome} />
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface LocalizacoesTableProps {
  data: LocalizacaoDto[];
  nextCursor?: string | null;
}

export function LocalizacoesTable({ data, nextCursor }: LocalizacoesTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem localizações registadas"
          description="Crie a primeira localização para organizar o stock e os ativos."
        />
      }
    />
  );
}
