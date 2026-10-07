'use client';

/**
 * Aprovar uma ausência PENDENTE (#94). Confirmação sem dados a recolher ⇒ `AlertDialog`,
 * a única excepção à regra sem modais. Se a folha do mês já existir, o diálogo avisa que
 * tem de ser recalculada — o payroll só desconta ausências APROVADA no processamento.
 * `useTransition` + `router.refresh()`: a linha muda de ramo com a revalidação, por isso o
 * resultado vai num toast (global).
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
import { aprovarAusenciaAction } from '@/server/actions/rh.actions';

const AVISO_FOLHA =
  'A folha salarial deste mês já existe: tem de ser recalculada para descontar esta ausência.';

export function AprovarAusencia({
  id,
  colaboradorNome,
  folhaDoMesExiste,
}: {
  id: string;
  colaboradorNome: string;
  folhaDoMesExiste: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);

  const confirmar = () => {
    startTransition(async () => {
      const r = await aprovarAusenciaAction({ id });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success('Ausência aprovada.');
      if (folhaDoMesExiste) toast.warning(AVISO_FOLHA);
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
          <AlertDialogTitle>Aprovar a ausência de {colaboradorNome}?</AlertDialogTitle>
          <AlertDialogDescription>
            Uma falta não justificada ou licença sem vencimento aprovada é descontada na folha do mês.
            A aprovação não pode ser desfeita.
          </AlertDialogDescription>
          {folhaDoMesExiste && <p className="text-sm font-medium text-destructive">{AVISO_FOLHA}</p>}
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
