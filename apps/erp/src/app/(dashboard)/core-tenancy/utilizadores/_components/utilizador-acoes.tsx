'use client';

/**
 * Acções de estado de um utilizador.
 * Padrão: useTransition + AlertDialog (única excepção à regra "sem modais").
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import { desactivarUtilizador, reactivarUtilizador } from '@/server/actions/plataforma.actions';

interface UtilizadorAcoesProps {
  id: string;
  nome: string;
  /** Inactivo → «Reactivar» em vez de «Desactivar» (#179). */
  ativo?: boolean;
  modoCompacto?: boolean;
}

export function UtilizadorAcoes({ id, nome, ativo = true, modoCompacto = false }: UtilizadorAcoesProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDesactivar = () => {
    startTransition(async () => {
      const result = await desactivarUtilizador({ id });
      if (result.ok) {
        toast.success(`Utilizador "${nome}" desactivado com sucesso.`);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao desactivar o utilizador.');
      }
    });
  };

  const handleReactivar = () => {
    startTransition(async () => {
      const result = await reactivarUtilizador({ id });
      if (result.ok) {
        toast.success(`Utilizador "${nome}" reactivado com sucesso.`);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao reactivar o utilizador.');
      }
    });
  };

  if (!ativo) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start px-2"
        disabled={isPending}
        onClick={handleReactivar}
      >
        <UserCheck className="h-4 w-4 mr-2" />
        {isPending ? 'A reactivar…' : modoCompacto ? 'Reactivar' : 'Reactivar Utilizador'}
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full justify-start px-2"
          disabled={isPending}
        >
          <UserX className="h-4 w-4 mr-2" />
          {modoCompacto ? 'Desactivar' : 'Desactivar Utilizador'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desactivar utilizador?</AlertDialogTitle>
          <AlertDialogDescription>
            O utilizador <strong>{nome}</strong> perderá acesso ao sistema imediatamente.
            Pode reactivá-lo mais tarde pelo mesmo menu.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDesactivar}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? 'A desactivar…' : 'Confirmar Desactivação'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
