'use client';

import { useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { reverterCorrespondenciaAction } from '@/server/actions/reconciliacao.actions';

/**
 * Reverter uma correspondência (rejeitar uma sugestão ou desfazer uma
 * reconciliação). É uma confirmação, não recolha de dados — a excepção do
 * AlertDialog. A linha fica no histórico, marcada revertida (RF §18).
 */
export function ReverterCorrespondencia({
  correspondenciaId, rotulo, titulo, descricao, icone,
}: { correspondenciaId: string; rotulo: string; titulo: string; descricao: string; icone?: ReactNode }) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const reverter = () =>
    iniciar(async () => {
      const r = await reverterCorrespondenciaAction({ id: correspondenciaId });
      if (!r.ok) return void toast.error(r.error.message);
      toast.success('Correspondência revertida.');
      router.refresh();
    });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" disabled={aCorrer}>
          {icone}
          {rotulo}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={reverter}>{rotulo}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
