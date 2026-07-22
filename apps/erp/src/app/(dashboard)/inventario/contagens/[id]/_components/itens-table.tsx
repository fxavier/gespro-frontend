'use client';

/**
 * Tabela de itens de contagem com acções inline — CLIENT COMPONENT.
 * Definições de colunas com funções render vivem sempre num módulo 'use client'.
 */

import { useTransition, useState } from 'react';
import { toast } from 'sonner';
import { Check, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { DataTable, StatusBadge } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import { registarContagemItemAction, justificarItemContagemAction } from '@/server/actions/inventario.actions';
import type { ItemContagemStockDto } from '@/server/services/inventario/contagem-stock.interface';

interface ItensTableProps {
  contagemId: string;
  itens: ItemContagemStockDto[];
  status: string;
  cega: boolean;
}

export function ItensTable({ contagemId, itens, status, cega }: ItensTableProps) {
  const [isPending, startTransition] = useTransition();
  const [justifOpen, setJustifOpen] = useState<string | null>(null);
  const [justifTexto, setJustifTexto] = useState('');
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});

  const podeEditar = status === 'EM_CONTAGEM';

  function handleRegistar(item: ItemContagemStockDto) {
    const qtd = quantidades[item.id];
    if (!qtd) {
      toast.error('Indique a quantidade contada');
      return;
    }
    startTransition(async () => {
      const result = await registarContagemItemAction({
        contagemId,
        itemId: item.id,
        quantidadeContada: qtd,
      });
      if (result.ok) {
        toast.success('Contagem registada');
        setQuantidades((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleJustificar(itemId: string) {
    if (!justifTexto.trim()) {
      toast.error('A justificativa não pode estar vazia');
      return;
    }
    startTransition(async () => {
      const result = await justificarItemContagemAction({
        contagemId,
        itemId,
        justificativa: justifTexto,
      });
      if (result.ok) {
        toast.success('Justificativa registada');
        setJustifOpen(null);
        setJustifTexto('');
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const columns: TableColumn<ItemContagemStockDto>[] = [
    {
      key: 'produtoId',
      label: 'Produto',
      render: (row) => <span className="font-mono text-xs text-muted-foreground">{row.produtoId}</span>,
    },
    {
      key: 'localizacaoId',
      label: 'Localização',
      mobileHidden: true,
      render: (row) => <span className="text-muted-foreground text-sm">{row.localizacaoId}</span>,
    },
    {
      key: 'saldoSistema',
      label: 'Saldo Sistema',
      mobileHidden: cega,
      render: (row) =>
        cega && status === 'EM_CONTAGEM' ? (
          <span className="text-muted-foreground italic text-sm">Oculto</span>
        ) : (
          <span className="tabular-nums font-medium">{row.saldoSistema}</span>
        ),
    },
    {
      key: 'quantidadeContada',
      label: 'Qtd. Contada',
      render: (row) => {
        if (!podeEditar || row.status === 'AJUSTADO') {
          return <span className="tabular-nums">{row.quantidadeContada ?? '—'}</span>;
        }
        return (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0"
              step="0.000001"
              className="w-24 h-7 text-sm tabular-nums"
              placeholder={row.quantidadeContada ?? '0'}
              value={quantidades[row.id] ?? row.quantidadeContada ?? ''}
              onChange={(e) =>
                setQuantidades((prev) => ({ ...prev, [row.id]: e.target.value }))
              }
              disabled={isPending}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => handleRegistar(row)}
              disabled={isPending || !quantidades[row.id]}
              title="Registar contagem"
            >
              <Check className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
    {
      key: 'diferenca',
      label: 'Diferença',
      mobileHidden: true,
      render: (row) => {
        if (!row.diferenca) return <span className="text-muted-foreground">—</span>;
        const val = parseFloat(row.diferenca);
        const cls = val > 0 ? 'text-success' : val < 0 ? 'text-destructive' : 'text-muted-foreground';
        return <span className={`tabular-nums font-medium ${cls}`}>{val > 0 ? `+${row.diferenca}` : row.diferenca}</span>;
      },
    },
    {
      key: 'status',
      label: 'Estado',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'acoes',
      label: '',
      render: (row) => {
        if (!podeEditar || row.status === 'AJUSTADO') return null;
        return (
          <AlertDialog open={justifOpen === row.id} onOpenChange={(open) => {
            setJustifOpen(open ? row.id : null);
            if (!open) setJustifTexto('');
          }}>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                title="Justificar discrepância"
                disabled={isPending}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Justificar Discrepância</AlertDialogTitle>
                <AlertDialogDescription>
                  Indique o motivo da discrepância para este item. Esta acção não gera ajuste de stock.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea
                placeholder="Motivo da discrepância..."
                value={justifTexto}
                onChange={(e) => setJustifTexto(e.target.value)}
                rows={4}
                className="mt-2"
              />
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleJustificar(row.id)} disabled={!justifTexto.trim()}>
                  Guardar Justificativa
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={itens}
    />
  );
}
