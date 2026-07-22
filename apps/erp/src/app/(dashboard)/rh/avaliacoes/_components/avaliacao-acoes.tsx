'use client';

/**
 * Acções de transição de estado de Avaliação — CLIENT COMPONENT.
 * Usa AlertDialog para confirmação destrutiva.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
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
import { transitarStatusAvaliacaoAction } from '@/server/actions/rh.actions';
import { PlayCircle, CheckCircle, XCircle } from 'lucide-react';

interface Props {
  id: string;
  status: string;
}

export function AvaliacaoAcoes({ id, status }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const transitar = (novoStatus: string, mensagem: string) => {
    startTransition(async () => {
      const result = await transitarStatusAvaliacaoAction({ id, novoStatus });
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
      {status === 'PENDENTE' && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => transitar('EM_ANDAMENTO', 'Avaliação iniciada')}
        >
          <PlayCircle className="h-4 w-4 mr-1.5" />
          Iniciar
        </Button>
      )}
      {status === 'EM_ANDAMENTO' && (
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => transitar('CONCLUIDA', 'Avaliação concluída')}
        >
          <CheckCircle className="h-4 w-4 mr-1.5" />
          Concluir
        </Button>
      )}
      {(status === 'PENDENTE' || status === 'EM_ANDAMENTO') && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={isPending}>
              <XCircle className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar avaliação?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acção não pode ser desfeita. A avaliação ficará no estado Cancelada.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Manter</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => transitar('CANCELADA', 'Avaliação cancelada')}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Cancelar Avaliação
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
