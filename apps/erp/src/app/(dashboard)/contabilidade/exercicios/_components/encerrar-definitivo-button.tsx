'use client';

/**
 * Encerramento definitivo do exercício (ADR-0035 §1) — irreversível. Confirmação destrutiva sem
 * dados a recolher ⇒ `AlertDialog`, a única excepção à regra sem modais. O cartão muda de ramo
 * com a revalidação, por isso o resultado vai num toast e a página refresca de imediato.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
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
import { encerrarExercicioDefinitivo } from '@/server/actions/contabilidade.actions';

export function EncerrarDefinitivoButton({ exercicioId, codigo }: { exercicioId: string; codigo: string }) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();
  const [aberto, setAberto] = useState(false);

  const confirmar = () => {
    iniciarTransicao(async () => {
      const res = await encerrarExercicioDefinitivo({ exercicioId });
      setAberto(false);
      if (!res.ok) {
        toast.error(res.error.message ?? 'Não foi possível encerrar o exercício em definitivo.');
        return;
      }
      toast.success(`Exercício ${codigo} encerrado em definitivo.`);
      router.refresh();
    });
  };

  return (
    <AlertDialog open={aberto} onOpenChange={setAberto}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="destructive" disabled={aCorrer}>
          <Lock className="h-3.5 w-3.5 mr-1.5" />
          Encerrar definitivamente
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Encerrar o exercício {codigo} em definitivo?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta operação é irreversível. Depois do encerramento definitivo, o exercício {codigo} não pode
            voltar a ser reaberto e nenhum dos seus períodos aceita lançamentos. Faça-o só depois de as contas
            do exercício estarem aprovadas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirmar();
            }}
            disabled={aCorrer}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {aCorrer ? 'A encerrar…' : 'Encerrar definitivamente'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
