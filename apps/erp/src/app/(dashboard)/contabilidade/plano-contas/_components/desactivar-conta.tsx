'use client';

/**
 * Desactivar uma conta do plano.
 *
 * O AlertDialog é a excepção prevista à regra sem-modais: confirmação de acção
 * destrutiva. A regra de negócio vive no serviço — uma conta com lançamentos
 * não se desactiva — e aqui mostra-se o motivo em vez de um erro seco.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban } from 'lucide-react';
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
import { desativarContaPGC } from '@/server/actions/contabilidade.actions';

export function DesactivarConta({
  id,
  codigo,
  nome,
  movimentos,
}: {
  id: string;
  codigo: string;
  nome: string;
  /** Lançamentos de sempre: com um que seja, o serviço recusa. */
  movimentos: number;
}) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();
  const impedida = movimentos > 0;

  const desactivar = () => {
    iniciarTransicao(async () => {
      const res = await desativarContaPGC({ id });
      if (!res.ok) {
        toast.error(res.error.message ?? 'Não foi possível desactivar a conta.');
        return;
      }
      toast.success(`Conta ${codigo} desactivada.`);
      router.refresh();
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Ban className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Desactivar
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {impedida ? 'Esta conta não pode ser desactivada' : `Desactivar ${codigo}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {impedida ? (
              <>
                A conta <strong>{nome}</strong> tem {movimentos} lançamento(s) registado(s).
                Desactivá-la esconderia contas que o balancete e o razão continuam a usar. Uma
                conta com histórico fica — o que se faz é deixar de lançar nela.
              </>
            ) : (
              <>
                A conta <strong>{nome}</strong> deixa de aparecer para novos lançamentos. Como
                nunca foi movimentada, nada do que está registado muda. Pode reactivá-la depois
                pela edição.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{impedida ? 'Entendido' : 'Cancelar'}</AlertDialogCancel>
          {!impedida && (
            <Button type="button" size="sm" onClick={desactivar} disabled={aCorrer}>
              {aCorrer ? 'A desactivar…' : 'Desactivar conta'}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
