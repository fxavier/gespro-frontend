'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, XCircle } from 'lucide-react';
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
import { submeterRequisicaoAction, cancelarRequisicaoAction } from '@/server/actions/compras.actions';

interface RequisicaoAcoesProps {
  id: string;
  status: string;
  /**
   * Modo compacto para uso em tabelas/painéis laterais.
   * Quando false (padrão), rótulos completos são mostrados.
   */
  modoCompacto?: boolean;
}

/**
 * Acções de estado de uma requisição de compra.
 *
 * PADRÃO CANÓNICO de mutação de estado no GestPro:
 *
 * 1. `useTransition` — controla pending state sem bloquear renders concorrentes
 * 2. `AlertDialog` — ÚNICA excepção à regra "sem modais" (acção destrutiva: cancelar)
 *    O AlertDialog inclui um campo `motivo` obrigatório — nunca cancelar sem justificativa
 * 3. `toast` sonner — feedback assíncrono para resultado (sucesso ou erro)
 * 4. `router.refresh()` — força re-fetch dos Server Components sem recarregar a página
 *
 * Reutilizar em: listagem (RequisicoesTable), detalhe ([id]/page), painel (@panel).
 * NÃO duplicar a lógica de submeter/cancelar — usar sempre este componente.
 */
export function RequisicaoAcoes({ id, status, modoCompacto = false }: RequisicaoAcoesProps) {
  const router = useRouter();
  const [submeterPending, startSubmeter] = useTransition();
  const [cancelarPending, startCancelar] = useTransition();
  const [motivo, setMotivo] = useState('');
  const [dialogAberto, setDialogAberto] = useState(false);

  const podeSubmeter = status === 'RASCUNHO';
  const podeCancelar =
    status !== 'CANCELADA' &&
    status !== 'REJEITADA' &&
    status !== 'CONVERTIDA';

  const handleSubmeter = () => {
    startSubmeter(async () => {
      const result = await submeterRequisicaoAction({ id });
      if (result.ok) {
        toast.success('Requisição submetida para aprovação com sucesso.');
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao submeter a requisição.');
      }
    });
  };

  const handleCancelar = () => {
    if (!motivo.trim()) {
      toast.error('Indique o motivo do cancelamento.');
      return;
    }
    startCancelar(async () => {
      const result = await cancelarRequisicaoAction({ id, motivo: motivo.trim() });
      if (result.ok) {
        toast.success('Requisição cancelada.');
        setDialogAberto(false);
        setMotivo('');
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao cancelar a requisição.');
      }
    });
  };

  if (!podeSubmeter && !podeCancelar) return null;

  return (
    <div className={modoCompacto ? 'flex gap-1' : 'flex items-center gap-2'}>
      {podeSubmeter && (
        <Button
          size="sm"
          disabled={submeterPending}
          onClick={handleSubmeter}
        >
          <Send className="h-4 w-4 mr-1.5" />
          {submeterPending ? 'A submeter…' : modoCompacto ? 'Submeter' : 'Submeter para Aprovação'}
        </Button>
      )}

      {podeCancelar && (
        <AlertDialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
              disabled={cancelarPending}
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              {modoCompacto ? 'Cancelar' : 'Cancelar Requisição'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar requisição?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acção não pode ser revertida. A requisição passará ao estado
                Cancelada e não poderá ser submetida novamente.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {/* Campo de motivo obrigatório — impede cancelamentos sem justificativa */}
            <div className="py-2 space-y-1.5">
              <Label htmlFor={`motivo-${id}`} className="text-sm font-medium">
                Motivo do cancelamento{' '}
                <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <Textarea
                id={`motivo-${id}`}
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
              <AlertDialogCancel onClick={() => setMotivo('')}>
                Voltar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCancelar}
                disabled={cancelarPending || !motivo.trim()}
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
