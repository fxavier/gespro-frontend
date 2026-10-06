'use client';

/**
 * Confirmação de «Marcar como vencida» no detalhe da factura.
 *
 * AlertDialog é a única excepção à regra «sem modais» — só confirma, não recolhe dados.
 * A action muda o que a página mostra (o estado e o próprio botão): useTransition +
 * router.refresh (CLAUDE.md, «Formulários cuja action muda o que a página mostra»).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarX, Loader2 } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { marcarFaturaVencida } from '@/server/actions/faturacao.actions';

export function MarcarVencidaButton({ faturaId, numero }: { faturaId: string; numero: string }) {
  const [open, setOpen] = useState(false);
  const [aCorrer, iniciarTransicao] = useTransition();
  const router = useRouter();

  function confirmar() {
    iniciarTransicao(async () => {
      const res = await marcarFaturaVencida({ faturaId });
      if (!res.ok) {
        toast.error(res.error?.message ?? 'Não foi possível marcar a factura como vencida');
        return;
      }
      toast.success(`Factura ${numero} marcada como vencida`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline">
          <CalendarX className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Marcar como vencida
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Marcar a factura {numero} como vencida?</AlertDialogTitle>
          <AlertDialogDescription>
            O prazo de pagamento já passou. A factura passa ao estado Vencida e continua a
            aceitar pagamentos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={aCorrer}>Cancelar</AlertDialogCancel>
          <Button type="button" onClick={confirmar} disabled={aCorrer}>
            {aCorrer && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />}
            Marcar como vencida
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
