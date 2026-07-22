'use client';

/**
 * Acções de um papel (role).
 * AlertDialog para remoção destrutiva.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
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
import { removerRole } from '@/server/actions/plataforma.actions';

interface RoleAcoesProps {
  id: string;
  nome: string;
  modoCompacto?: boolean;
}

export function RoleAcoes({ id, nome, modoCompacto = false }: RoleAcoesProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRemover = () => {
    startTransition(async () => {
      const result = await removerRole({ id });
      if (result.ok) {
        toast.success(`Papel "${nome}" removido com sucesso.`);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao remover o papel.');
      }
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full justify-start px-2"
          disabled={isPending}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          {modoCompacto ? 'Remover' : 'Remover Papel'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover papel?</AlertDialogTitle>
          <AlertDialogDescription>
            O papel <strong>{nome}</strong> será permanentemente removido. Os utilizadores com este
            papel perderão as permissões associadas. Esta acção não pode ser revertida.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRemover}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? 'A remover…' : 'Confirmar Remoção'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
