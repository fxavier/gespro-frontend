'use client';

/**
 * Acções de transição de estado de Formação — CLIENT COMPONENT.
 * As transições válidas vêm de TRANSICOES_FORMACAO (client-safe, state-machines.ts).
 * AlertDialog para a confirmação destrutiva (cancelar).
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PlayCircle, CheckCircle, XCircle } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { TRANSICOES_FORMACAO } from '@/lib/state-machines';
import { transitarStatusFormacaoAction } from '@/server/actions/rh.actions';

interface Props {
  id: string;
  status: string;
}

export function FormacaoAcoes({ id, status }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const destinos = TRANSICOES_FORMACAO[status] ?? [];

  const transitar = (novoStatus: string, mensagem: string) => {
    startTransition(async () => {
      const result = await transitarStatusFormacaoAction({ id, novoStatus });
      if (result.ok) {
        toast.success(mensagem);
        router.refresh();
      } else {
        toast.error(result.error?.message ?? 'Erro ao actualizar estado');
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      {destinos.includes('EM_ANDAMENTO') && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => transitar('EM_ANDAMENTO', 'Formação iniciada')}
        >
          <PlayCircle className="h-4 w-4 mr-1.5" />
          Iniciar
        </Button>
      )}
      {destinos.includes('CONCLUIDA') && (
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => transitar('CONCLUIDA', 'Formação concluída')}
        >
          <CheckCircle className="h-4 w-4 mr-1.5" />
          Concluir
        </Button>
      )}
      {destinos.includes('CANCELADA') && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={isPending}>
              <XCircle className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar formação?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acção não pode ser desfeita. A formação ficará no estado Cancelada.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Manter</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => transitar('CANCELADA', 'Formação cancelada')}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Cancelar Formação
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
