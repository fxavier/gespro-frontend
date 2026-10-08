'use client';

/**
 * Cancelar o próprio pedido de férias PENDENTE (#156). Destrutivo e sem dados a recolher ⇒
 * `AlertDialog`. Só aparece a quem submeteu o pedido; o serviço volta a verificá-lo.
 */
import { useState, useTransition } from 'react';
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
import { Button, buttonVariants } from '@/components/ui/button';
import { cancelarSolicitacaoFeriasAction } from '@/server/actions/rh.actions';

export function CancelarFerias({ solicitacaoId }: { solicitacaoId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);

  const confirmar = () => {
    startTransition(async () => {
      const r = await cancelarSolicitacaoFeriasAction({ solicitacaoId });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success('Pedido de férias cancelado.');
      setAberto(false);
      router.refresh();
    });
  };

  return (
    <AlertDialog open={aberto} onOpenChange={setAberto}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" disabled={pending}>
          Cancelar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar o seu pedido de férias?</AlertDialogTitle>
          <AlertDialogDescription>
            O pedido deixa de estar pendente e os dias deixam de ficar reservados. Para voltar a
            pedir, submeta um pedido novo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            onClick={(e) => {
              e.preventDefault();
              confirmar();
            }}
            disabled={pending}
          >
            {pending ? 'A cancelar…' : 'Cancelar pedido'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
