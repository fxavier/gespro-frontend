'use client';

/**
 * Reactivar uma conta do plano (#142) — o par de `DesactivarConta`.
 *
 * Confirmação em AlertDialog (excepção prevista à regra sem-modais). A conta volta
 * a aparecer para novos lançamentos; nada do que está registado muda.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { reativarContaPGC } from '@/server/actions/contabilidade.actions';

export function ReactivarConta({ id, codigo, nome }: { id: string; codigo: string; nome: string }) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();

  const reactivar = () => {
    iniciarTransicao(async () => {
      const res = await reativarContaPGC({ id });
      if (!res.ok) {
        toast.error(res.error.message ?? 'Não foi possível reactivar a conta.');
        return;
      }
      toast.success(`Conta ${codigo} reactivada.`);
      router.refresh();
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <RotateCcw className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Reactivar
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Reactivar ${codigo}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            A conta <strong>{nome}</strong> volta a aparecer para novos lançamentos. Nada do que
            está registado muda.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button type="button" size="sm" onClick={reactivar} disabled={aCorrer}>
            {aCorrer ? 'A reactivar…' : 'Reactivar conta'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
