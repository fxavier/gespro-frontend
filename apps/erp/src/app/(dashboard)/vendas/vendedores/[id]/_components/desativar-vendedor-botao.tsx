'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UserX } from 'lucide-react';
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
import { desativarVendedor } from '@/server/actions/vendas.actions';

interface Props {
  id: string;
  nome: string;
}

/**
 * Desactivar vendedor (#131) — não apaga: o vendedor fica Inactivo, continua na listagem e as
 * comissões dele não mudam. Reactiva-se em «Editar» (estado Activo).
 */
export function DesativarVendedorBotao({ id, nome }: Props) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();

  const desativar = () => {
    iniciar(async () => {
      const r = await desativarVendedor({ id });
      if (!r.ok) {
        toast.error(r.error.message ?? 'Não foi possível desactivar o vendedor.');
        return;
      }
      toast.success('Vendedor desactivado.');
      router.refresh();
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={aCorrer}>
          <UserX className="h-4 w-4 mr-2" aria-hidden="true" />
          {aCorrer ? 'A desactivar…' : 'Desactivar'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desactivar {nome}?</AlertDialogTitle>
          <AlertDialogDescription>
            O vendedor fica Inactivo mas não é apagado: continua na listagem e as comissões dele
            mantêm-se. Pode reactivá-lo em «Editar».
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={desativar}>Desactivar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
