'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { transitarStatusManutencaoAction } from '@/server/actions/inventario.actions';
import { TRANSICOES_MANUTENCAO_ATIVO } from '@/lib/state-machines';

interface ManutencaoAcoesProps {
  id: string;
  status: string;
  modoCompacto?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  AGENDADA: 'Agendada',
  EM_ANDAMENTO: 'Em Andamento',
  ORCAMENTO: 'Orçamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

const STATUS_ACOES: Record<string, string> = {
  AGENDADA: 'Iniciar',
  EM_ANDAMENTO: 'Concluir',
  ORCAMENTO: 'Retomar',
};

/**
 * Acções de estado de uma manutenção.
 * AlertDialog apenas para CANCELADA (acção destrutiva).
 */
export function ManutencaoAcoes({ id, status, modoCompacto = false }: ManutencaoAcoesProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cancelarPending, startCancelar] = useTransition();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [motivo, setMotivo] = useState('');

  const transicoesValidas = TRANSICOES_MANUTENCAO_ATIVO[status] ?? [];
  const transicoesNaoDestrutivasValidas = transicoesValidas.filter((t) => t !== 'CANCELADA');
  const podeCancelar = transicoesValidas.includes('CANCELADA');

  const handleTransitar = (novoStatus: string) => {
    startTransition(async () => {
      const result = await transitarStatusManutencaoAction({
        manutencaoId: id,
        novoStatus: novoStatus as 'AGENDADA' | 'EM_ANDAMENTO' | 'ORCAMENTO' | 'CONCLUIDA' | 'CANCELADA',
      });
      if (result.ok) {
        toast.success(`Manutenção transitada para ${STATUS_LABELS[novoStatus] ?? novoStatus}.`);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao transitar estado da manutenção.');
      }
    });
  };

  const handleCancelar = () => {
    startCancelar(async () => {
      const result = await transitarStatusManutencaoAction({
        manutencaoId: id,
        novoStatus: 'CANCELADA',
        motivoCancelamento: motivo.trim() || undefined,
      });
      if (result.ok) {
        toast.success('Manutenção cancelada.');
        setDialogAberto(false);
        setMotivo('');
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao cancelar a manutenção.');
      }
    });
  };

  if (transicoesValidas.length === 0) return null;

  return (
    <div className={modoCompacto ? 'flex gap-1 flex-wrap' : 'flex items-center gap-2 flex-wrap'}>
      {transicoesNaoDestrutivasValidas.map((novoStatus) => (
        <Button
          key={novoStatus}
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => handleTransitar(novoStatus)}
        >
          {pending ? 'A processar…' : (STATUS_ACOES[status] ?? STATUS_LABELS[novoStatus])}
        </Button>
      ))}

      {podeCancelar && (
        <AlertDialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
              disabled={cancelarPending}
            >
              Cancelar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar manutenção?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acção cancelará a manutenção. Por favor indique o motivo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-2 space-y-1.5">
              <Label htmlFor={`motivo-cancel-${id}`} className="text-sm font-medium">
                Motivo do cancelamento <span className="text-muted-foreground text-xs">(opcional)</span>
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
