'use client';

/**
 * Desmapear uma conta (ajuste 4 do grafo `dfc`). Confirmação destrutiva sem
 * dados a recolher ⇒ `AlertDialog`, a única excepção à regra sem modais.
 * `useTransition` + `router.refresh()`: a linha desaparece com a revalidação,
 * por isso o resultado vai num toast (global), não em estado do componente.
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
import { desmapearContaAction } from '@/server/actions/fluxo-caixa.actions';

export function DesmapearConta({ contaId, rotulo }: { contaId: string; rotulo: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);

  const confirmar = () => {
    startTransition(async () => {
      const r = await desmapearContaAction({ contaId });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(`Conta ${rotulo} desmapeada. O mapeamento passou a uma versão nova, por validar.`);
      setAberto(false);
      router.refresh();
    });
  };

  return (
    <AlertDialog open={aberto} onOpenChange={setAberto}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="text-destructive underline-offset-2 hover:underline disabled:opacity-50"
          disabled={pending}
        >
          Desmapear
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desmapear a conta {rotulo}?</AlertDialogTitle>
          <AlertDialogDescription>
            A conta fica sem rubrica. Se tiver movimento no intervalo pedido, a DFC deixa de sair e mostra-a como
            impedimento até ser mapeada de novo. A alteração cria uma versão nova do mapeamento, por validar.
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
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? 'A desmapear…' : 'Desmapear'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
