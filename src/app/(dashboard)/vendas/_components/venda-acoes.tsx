'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { XCircle, CheckCircle, Package } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import { transitarVendaAction, cancelarVenda } from '@/server/actions/vendas.actions';
import type { StatusVenda } from '@/server/services/comercial/venda.interface';

interface VendaAcoesProps {
  id: string;
  status: string;
  modoCompacto?: boolean;
}

/**
 * Acções de estado de uma venda.
 * Padrão canónico: useTransition + AlertDialog para acções destrutivas.
 */
export function VendaAcoes({ id, status, modoCompacto = false }: VendaAcoesProps) {
  const router = useRouter();
  const [confirmarPending, startConfirmar] = useTransition();
  const [cancelarPending, startCancelar] = useTransition();
  const [motivo, setMotivo] = useState('');
  const [dialogAberto, setDialogAberto] = useState(false);

  const podeConfirmar = status === 'PENDENTE' || status === 'RASCUNHO';
  const podeCancelar = !['CANCELADA', 'CONCLUIDA', 'DEVOLVIDA'].includes(status);

  const handleConfirmar = () => {
    startConfirmar(async () => {
      const result = await transitarVendaAction({
        vendaId: id,
        paraStatus: 'CONFIRMADA' as StatusVenda,
      });
      if (result.ok) {
        toast.success('Venda confirmada com sucesso.');
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao confirmar a venda.');
      }
    });
  };

  const handleCancelar = () => {
    startCancelar(async () => {
      const result = await cancelarVenda({ id, motivo: motivo.trim() || undefined });
      if (result.ok) {
        toast.success('Venda cancelada.');
        setDialogAberto(false);
        setMotivo('');
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao cancelar a venda.');
      }
    });
  };

  if (!podeConfirmar && !podeCancelar) return null;

  return (
    <div className={modoCompacto ? 'flex flex-col gap-1' : 'flex items-center gap-2'}>
      {podeConfirmar && status === 'PENDENTE' && (
        <Button
          variant="ghost"
          size="sm"
          disabled={confirmarPending}
          onClick={handleConfirmar}
          className="w-full justify-start"
        >
          <CheckCircle className="h-4 w-4 mr-1.5" />
          {confirmarPending ? 'A confirmar…' : 'Confirmar'}
        </Button>
      )}

      {podeConfirmar && status === 'RASCUNHO' && (
        <Button
          variant="ghost"
          size="sm"
          disabled={confirmarPending}
          onClick={handleConfirmar}
          className="w-full justify-start"
        >
          <Package className="h-4 w-4 mr-1.5" />
          {confirmarPending ? 'A processar…' : 'Submeter'}
        </Button>
      )}

      {podeCancelar && (
        <AlertDialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full justify-start"
              disabled={cancelarPending}
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              {modoCompacto ? 'Cancelar' : 'Cancelar Venda'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar venda?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acção não pode ser revertida. O stock reservado será libertado.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="py-2 space-y-1.5">
              <Label htmlFor={`motivo-venda-${id}`} className="text-sm font-medium">
                Motivo (opcional)
              </Label>
              <Textarea
                id={`motivo-venda-${id}`}
                className="resize-none"
                placeholder="Descreva o motivo do cancelamento…"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground tabular-nums text-right">
                {motivo.length}/500
              </p>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setMotivo('')}>Voltar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCancelar}
                disabled={cancelarPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {cancelarPending ? 'A cancelar…' : 'Confirmar Cancelamento'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
