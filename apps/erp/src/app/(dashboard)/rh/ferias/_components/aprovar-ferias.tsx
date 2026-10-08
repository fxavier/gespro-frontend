'use client';

/**
 * Aprovar um pedido de férias PENDENTE (#156). Confirmação sem dados a recolher ⇒
 * `AlertDialog`, a única excepção à regra sem modais. Aprovar desconta os dias do saldo do
 * período aquisitivo. `useTransition` + `router.refresh()`: a linha muda de ramo com a
 * revalidação, por isso o resultado vai num toast (global). Molde: `AprovarAusencia` (#94).
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
import { Button } from '@/components/ui/button';
import { aprovarFeriasAction } from '@/server/actions/rh.actions';

export function AprovarFerias({
  solicitacaoId,
  colaboradorNome,
  diasSolicitados,
}: {
  solicitacaoId: string;
  colaboradorNome: string;
  diasSolicitados: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);

  const confirmar = () => {
    startTransition(async () => {
      const r = await aprovarFeriasAction({ solicitacaoId, status: 'APROVADA' });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success('Férias aprovadas.');
      setAberto(false);
      router.refresh();
    });
  };

  return (
    <AlertDialog open={aberto} onOpenChange={setAberto}>
      <AlertDialogTrigger asChild>
        <Button size="sm" disabled={pending}>
          Aprovar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Aprovar as férias de {colaboradorNome}?</AlertDialogTitle>
          <AlertDialogDescription>
            {diasSolicitados} dia(s) são descontados do saldo do período aquisitivo. A aprovação não
            pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirmar();
            }}
            disabled={pending}
          >
            {pending ? 'A aprovar…' : 'Aprovar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
