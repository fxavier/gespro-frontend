'use client';

/**
 * Eliminar uma rubrica criada pelo tenant (soft delete). Confirmação destrutiva
 * ⇒ `AlertDialog`. Com contas mapeadas o serviço recusa (`RUBRICA_COM_CONTAS`);
 * o diálogo di-lo antes e desactiva a confirmação, mas a regra é do serviço.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
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
import { eliminarRubricaAction } from '@/server/actions/fluxo-caixa.actions';

export function EliminarRubrica({ id, rotulo, temContas }: { id: string; rotulo: string; temContas: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);

  const confirmar = () => {
    startTransition(async () => {
      const r = await eliminarRubricaAction({ id });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(`Rubrica ${rotulo} eliminada.`);
      setAberto(false);
      router.refresh();
    });
  };

  return (
    <AlertDialog open={aberto} onOpenChange={setAberto}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          disabled={pending}
          aria-label={`Eliminar a rubrica ${rotulo}`}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar a rubrica {rotulo}?</AlertDialogTitle>
          <AlertDialogDescription>
            {temContas
              ? 'Esta rubrica ainda tem contas mapeadas: reatribua-as ou desmapeie-as antes de a eliminar.'
              : 'A rubrica deixa de aparecer na DFC e na configuração. O código fica reservado. A alteração cria uma versão nova do mapeamento, por validar.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirmar();
            }}
            disabled={pending || temContas}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? 'A eliminar…' : 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
