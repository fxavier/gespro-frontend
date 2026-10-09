'use client';

/**
 * Desactivar um circuito de aprovação (#445): confirmação em AlertDialog (só confirma, não
 * recolhe dados). Depois disso o «Submeter» deixa de o usar e pode activar-se outro do tipo.
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
import { desactivarConfiguracaoWorkflowAction } from '@/server/actions/compras.actions';

export function DesactivarCircuito({ id, nome }: { id: string; nome: string }) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const [aberto, setAberto] = useState(false);

  const confirmar = () => {
    iniciar(async () => {
      const r = await desactivarConfiguracaoWorkflowAction({ id });
      if (!r.ok) {
        toast.error(r.error.message ?? 'Não foi possível desactivar o circuito.');
        return;
      }
      toast.success(`Circuito «${nome}» desactivado.`);
      setAberto(false);
      router.refresh();
    });
  };

  return (
    <AlertDialog open={aberto} onOpenChange={setAberto}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={aCorrer}>
          <Power className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Desactivar…
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desactivar o circuito «{nome}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Os documentos submetidos a seguir deixam de usar este circuito; sem outro activo do mesmo
            tipo, ficam aprovados de imediato. Pode voltar a activá-lo editando-o.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={aCorrer}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirmar();
            }}
            disabled={aCorrer}
          >
            {aCorrer ? 'A desactivar…' : 'Desactivar circuito'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
