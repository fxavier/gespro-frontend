'use client';

/**
 * Acções de estado no detalhe de uma devolução PENDENTE (#130): «Aprovar» e «Rejeitar», cada
 * uma confirmada num AlertDialog (confirmar, não recolher dados). «Processar» e «Criar Troca»
 * recolhem dados (localização, produto), logo são rotas próprias e não vivem aqui.
 */

import { useState, useTransition } from 'react';
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
import { aprovarDevolucao, rejeitarDevolucao } from '@/server/actions/vendas.actions';

interface DevolucaoAcoesProps {
  id: string;
  numero: string;
}

export function DevolucaoAcoes({ id, numero }: DevolucaoAcoesProps) {
  const router = useRouter();
  const [aAprovar, startAprovar] = useTransition();
  const [aRejeitar, startRejeitar] = useTransition();
  const [aprovarAberto, setAprovarAberto] = useState(false);
  const [rejeitarAberto, setRejeitarAberto] = useState(false);

  const aprovar = () => {
    startAprovar(async () => {
      const result = await aprovarDevolucao({ id });
      setAprovarAberto(false);
      if (result.ok) toast.success(`Devolução ${numero} aprovada.`);
      else toast.error(result.error.message);
      router.refresh();
    });
  };

  const rejeitar = () => {
    startRejeitar(async () => {
      const result = await rejeitarDevolucao({ id });
      setRejeitarAberto(false);
      if (result.ok) toast.success(`Devolução ${numero} rejeitada.`);
      else toast.error(result.error.message);
      router.refresh();
    });
  };

  return (
    <>
      <AlertDialog open={aprovarAberto} onOpenChange={setAprovarAberto}>
        <AlertDialogTrigger asChild>
          <Button size="sm" disabled={aAprovar || aRejeitar}>
            Aprovar
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar a devolução {numero}?</AlertDialogTitle>
            <AlertDialogDescription>
              Aprovada, a devolução pode ser processada (nota de crédito e entrada do stock) ou
              convertida numa troca.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                aprovar();
              }}
              disabled={aAprovar}
            >
              {aAprovar ? 'A aprovar…' : 'Aprovar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rejeitarAberto} onOpenChange={setRejeitarAberto}>
        <AlertDialogTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={aAprovar || aRejeitar}
          >
            Rejeitar
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeitar a devolução {numero}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acção não pode ser revertida: a devolução rejeitada não se aprova, não se
              processa nem dá origem a uma troca.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                rejeitar();
              }}
              disabled={aRejeitar}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {aRejeitar ? 'A rejeitar…' : 'Rejeitar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
