'use client';

/**
 * Confirmar um lançamento em rascunho (RASCUNHO → LANÇADO).
 *
 * Existe em dois sítios — no menu da listagem e no detalhe — porque quem abre
 * o detalhe para conferir as partidas antes de confirmar não devia ter de
 * voltar à lista para o fazer. O AlertDialog é a excepção prevista à regra
 * sem-modais: confirmação de acção irreversível, sem campos a preencher.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
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
import { confirmarLancamento } from '@/server/actions/contabilidade.actions';

export function ConfirmarLancamento({ id, numero }: { id: string; numero: string }) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm">
          <CheckCircle2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Confirmar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar o lançamento {numero}?</AlertDialogTitle>
          <AlertDialogDescription>
            Depois de lançado fica imutável — é assim que um documento contabilístico se comporta.
            Correcções posteriores fazem-se por estorno, nunca por alteração.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={aCorrer}
            onClick={() =>
              iniciarTransicao(async () => {
                const res = await confirmarLancamento({ id });
                if (!res.ok) {
                  toast.error(res.error.message ?? 'Erro ao confirmar o lançamento.');
                  return;
                }
                toast.success('Lançamento confirmado.');
                router.refresh();
              })
            }
          >
            {aCorrer ? 'A confirmar…' : 'Confirmar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
