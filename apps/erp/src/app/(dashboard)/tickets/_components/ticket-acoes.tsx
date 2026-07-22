'use client';

/**
 * Acções de estado de um Ticket.
 *
 * PADRÃO CANÓNICO de mutação de estado no GestPro:
 * 1. useTransition — controla pending state
 * 2. AlertDialog — ÚNICA excepção à regra "sem modais" (acção destrutiva: cancelar)
 * 3. toast sonner — feedback assíncrono
 * 4. router.refresh() — força re-fetch dos Server Components
 *
 * Reutilizar em: listagem, detalhe.
 */

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { XCircle, ChevronDown } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { transitarTicketAction } from '@/server/actions/tickets.actions';
import { TRANSICOES_TICKET } from '@/lib/state-machines';
import type { EstadoTicket } from '@/server/services/operacoes/ticket.interface';

const ESTADO_LABELS: Record<EstadoTicket, string> = {
  ABERTO: 'Aberto',
  EM_PROGRESSO: 'Em Progresso',
  AGUARDANDO_CLIENTE: 'A Aguardar Cliente',
  AGUARDANDO_TERCEIRO: 'A Aguardar Terceiro',
  RESOLVIDO: 'Resolvido',
  FECHADO: 'Fechado',
  CANCELADO: 'Cancelado',
};

interface TicketAcoesProps {
  id: string;
  estado: EstadoTicket;
  modoCompacto?: boolean;
}

export function TicketAcoes({ id, estado, modoCompacto = false }: TicketAcoesProps) {
  const router = useRouter();
  const [transitarPending, startTransitar] = useTransition();
  const [cancelarPending, startCancelar] = useTransition();
  const [motivo, setMotivo] = useState('');
  const [dialogAberto, setDialogAberto] = useState(false);

  const transicoesDisponiveis = (TRANSICOES_TICKET[estado] ?? []).filter(
    (s) => s !== 'CANCELADO'
  ) as EstadoTicket[];

  const podeCancelar = estado !== 'CANCELADO' && estado !== 'FECHADO';

  const handleTransitar = (estadoAlvo: EstadoTicket) => {
    startTransitar(async () => {
      const result = await transitarTicketAction({
        ticketId: id,
        estadoAlvo,
        descricao: `Estado alterado para ${ESTADO_LABELS[estadoAlvo]}`,
      });
      if (result.ok) {
        toast.success(`Ticket movido para "${ESTADO_LABELS[estadoAlvo]}".`);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao transitar o ticket.');
      }
    });
  };

  const handleCancelar = () => {
    if (!motivo.trim()) {
      toast.error('Indique o motivo do cancelamento.');
      return;
    }
    startCancelar(async () => {
      const result = await transitarTicketAction({
        ticketId: id,
        estadoAlvo: 'CANCELADO',
        descricao: motivo.trim(),
      });
      if (result.ok) {
        toast.success('Ticket cancelado.');
        setDialogAberto(false);
        setMotivo('');
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao cancelar o ticket.');
      }
    });
  };

  if (transicoesDisponiveis.length === 0 && !podeCancelar) return null;

  return (
    <div className={modoCompacto ? 'flex gap-1' : 'flex items-center gap-2'}>
      {transicoesDisponiveis.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" disabled={transitarPending}>
              {transitarPending ? 'A actualizar…' : 'Mudar Estado'}
              <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {transicoesDisponiveis.map((s) => (
              <DropdownMenuItem key={s} onClick={() => handleTransitar(s)}>
                {ESTADO_LABELS[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
              {modoCompacto ? 'Cancelar' : 'Cancelar Ticket'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar ticket?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acção não pode ser revertida. O ticket passará ao estado Cancelado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-2 space-y-1.5">
              <Label htmlFor={`motivo-cancel-${id}`} className="text-sm font-medium">
                Motivo do cancelamento{' '}
                <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <Textarea
                id={`motivo-cancel-${id}`}
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
