'use client';

/**
 * Desactivar / reactivar uma conta bancária (#465): confirmação em AlertDialog (só confirma,
 * não recolhe dados). Uma conta configurada num meio do POS leva aviso, mas não é bloqueada.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Power } from 'lucide-react';
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
import { definirContaBancariaActiva } from '@/server/actions/contabilidade.actions';

export function ActivarContaBancaria({
  id,
  descricao,
  ativo,
  meiosPOS,
}: {
  id: string;
  descricao: string;
  ativo: boolean;
  /** Rótulos dos meios de pagamento do POS que debitam esta conta. */
  meiosPOS: string[];
}) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const [aberto, setAberto] = useState(false);
  const verbo = ativo ? 'Desactivar' : 'Reactivar';

  const confirmar = () => {
    iniciar(async () => {
      const r = await definirContaBancariaActiva({ id, ativo: !ativo });
      if (!r.ok) {
        toast.error(r.error.message ?? `Não foi possível ${verbo.toLowerCase()} a conta.`);
        return;
      }
      toast.success(`Conta «${descricao}» ${ativo ? 'desactivada' : 'reactivada'}.`);
      setAberto(false);
      router.refresh();
    });
  };

  return (
    <AlertDialog open={aberto} onOpenChange={setAberto}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={aCorrer}>
          <Power className="h-4 w-4 mr-1.5" aria-hidden="true" />
          {verbo}…
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {verbo} a conta «{descricao}»?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {ativo
              ? 'A conta deixa de ser oferecida nos pagamentos e sai da reconciliação bancária. O histórico mantém-se e pode reactivá-la depois.'
              : 'A conta volta a ser oferecida nos pagamentos e na reconciliação bancária.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {ativo && meiosPOS.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Atenção: esta conta está configurada no POS para {meiosPOS.join(', ')}. A configuração
            mantém-se e as vendas com esse meio continuam a debitar a conta contabilística dela; para
            mudar, escolha outra conta em Meios de pagamento do POS.
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={aCorrer}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirmar();
            }}
            disabled={aCorrer}
          >
            {aCorrer ? `A ${verbo.toLowerCase()}…` : `${verbo} conta`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
