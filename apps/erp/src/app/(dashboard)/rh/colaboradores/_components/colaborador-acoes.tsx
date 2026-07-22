'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { arquivarColaboradorAction, transitarStatusColaboradorAction } from '@/server/actions/rh.actions';

interface ColaboradorAcoesProps {
  id: string;
  status: string;
  modoCompacto?: boolean;
}

/**
 * Acções de estado de um colaborador.
 * Padrão canónico: useTransition + AlertDialog (só destrutivo) + toast + router.refresh().
 */
export function ColaboradorAcoes({ id, status, modoCompacto = false }: ColaboradorAcoesProps) {
  const router = useRouter();
  const [arquivarPending, startArquivar] = useTransition();
  const [transitarPending, startTransitar] = useTransition();
  const [dialogAberto, setDialogAberto] = useState(false);

  const podeActivar = status === 'PERIODO_EXPERIMENTAL' || status === 'AFASTADO' || status === 'FERIAS';
  const podeInactivar = status === 'ACTIVO' || status === 'PERIODO_EXPERIMENTAL';
  const podeArquivar = status === 'INACTIVO';

  const handleTransitar = (novoStatus: string) => {
    startTransitar(async () => {
      const result = await transitarStatusColaboradorAction({ id, novoStatus });
      if (result.ok) {
        toast.success('Estado actualizado com sucesso.');
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao actualizar o estado.');
      }
    });
  };

  const handleArquivar = () => {
    startArquivar(async () => {
      const result = await arquivarColaboradorAction({ id });
      if (result.ok) {
        toast.success('Colaborador arquivado.');
        setDialogAberto(false);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao arquivar o colaborador.');
      }
    });
  };

  const isPending = arquivarPending || transitarPending;

  return (
    <div className={modoCompacto ? 'flex gap-1 flex-col' : 'flex items-center gap-2 flex-wrap'}>
      {podeActivar && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => handleTransitar('ACTIVO')}
        >
          {transitarPending ? 'A processar…' : 'Activar'}
        </Button>
      )}

      {podeInactivar && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => handleTransitar('INACTIVO')}
        >
          {transitarPending ? 'A processar…' : 'Desactivar'}
        </Button>
      )}

      {podeArquivar && (
        <AlertDialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
              disabled={isPending}
            >
              {modoCompacto ? 'Arquivar' : 'Arquivar Colaborador'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Arquivar colaborador?</AlertDialogTitle>
              <AlertDialogDescription>
                O colaborador será arquivado (soft delete). Esta acção não pode ser revertida
                directamente nesta interface.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleArquivar}
                disabled={arquivarPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {arquivarPending ? 'A arquivar…' : 'Confirmar Arquivamento'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
