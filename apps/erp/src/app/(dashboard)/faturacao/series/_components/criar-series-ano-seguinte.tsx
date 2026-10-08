'use client';

/**
 * «Criar séries de <ano+1>» (#235). Confirmação sem dados a recolher ⇒ `AlertDialog`.
 * Cria uma série activa por tipo que ainda não tenha série nenhuma no ano seguinte; os
 * tipos já configurados ficam como estão (regra do serviço).
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarPlus } from 'lucide-react';
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
import { criarSeriesAnoSeguinte } from '@/server/actions/faturacao.actions';

export function CriarSeriesAnoSeguinte({ ano }: { ano: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);

  const confirmar = () => {
    startTransition(async () => {
      const r = await criarSeriesAnoSeguinte(undefined);
      setAberto(false);
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      const { criadas } = r.data;
      toast.success(
        criadas === 0
          ? `Todos os tipos já tinham séries de ${r.data.ano}; nada foi criado.`
          : `${criadas === 1 ? '1 série' : `${criadas} séries`} de ${r.data.ano} ${criadas === 1 ? 'criada' : 'criadas'}.`,
      );
      router.refresh();
    });
  };

  return (
    <AlertDialog open={aberto} onOpenChange={setAberto}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          <CalendarPlus className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Criar séries de {ano}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Criar as séries de {ano}?</AlertDialogTitle>
          <AlertDialogDescription>
            Cria uma série activa, a começar no n.º 1, para cada tipo de documento que ainda não tenha série em {ano}.
            Os tipos que já têm série nesse ano não são alterados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirmar();
            }}
            disabled={pending}
          >
            {pending ? 'A criar…' : 'Criar séries'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
