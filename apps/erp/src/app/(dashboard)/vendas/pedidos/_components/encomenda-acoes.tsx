'use client';

/**
 * Acções de estado no detalhe de uma encomenda (#129): «Converter em Venda» e «Cancelar
 * Encomenda», ambas confirmadas num AlertDialog (confirmar, não recolher dados).
 * «Confirmar» não vive aqui: precisa da localização, logo é rota própria (`[id]/confirmar`).
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
import {
  cancelarEncomenda,
  converterEncomendaEmVendaACredito,
} from '@/server/actions/vendas.actions';

interface EncomendaAcoesProps {
  id: string;
  numero: string;
  podeConverter: boolean;
  podeCancelar: boolean;
}

export function EncomendaAcoes({ id, numero, podeConverter, podeCancelar }: EncomendaAcoesProps) {
  const router = useRouter();
  const [aConverter, startConverter] = useTransition();
  const [aCancelar, startCancelar] = useTransition();
  const [converterAberto, setConverterAberto] = useState(false);
  const [cancelarAberto, setCancelarAberto] = useState(false);

  const converter = () => {
    startConverter(async () => {
      const result = await converterEncomendaEmVendaACredito({ encomendaId: id });
      setConverterAberto(false);
      if (result.ok) {
        toast.success(`Encomenda ${numero} convertida em venda.`);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const cancelar = () => {
    startCancelar(async () => {
      const result = await cancelarEncomenda({ id });
      setCancelarAberto(false);
      if (result.ok) {
        toast.success(`Encomenda ${numero} cancelada.`);
        // Cancelar apaga logicamente: o detalhe deixa de existir.
        router.push('/vendas/pedidos');
      } else {
        toast.error(result.error.message);
        router.refresh();
      }
    });
  };

  if (!podeConverter && !podeCancelar) return null;

  return (
    <>
      {podeConverter && (
        <AlertDialog open={converterAberto} onOpenChange={setConverterAberto}>
          <AlertDialogTrigger asChild>
            <Button size="sm" disabled={aConverter}>
              Converter em Venda
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Converter a encomenda {numero} em venda?</AlertDialogTitle>
              <AlertDialogDescription>
                É criada uma venda a crédito pelo total da encomenda, o stock reservado é
                consumido e a venda é lançada na contabilidade. A encomenda fica concluída.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  converter();
                }}
                disabled={aConverter}
              >
                {aConverter ? 'A converter…' : 'Converter'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {podeCancelar && (
        <AlertDialog open={cancelarAberto} onOpenChange={setCancelarAberto}>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={aCancelar}
            >
              Cancelar Encomenda
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar a encomenda {numero}?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acção não pode ser revertida. O stock reservado é libertado e a encomenda
                deixa de aparecer na listagem.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  cancelar();
                }}
                disabled={aCancelar}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {aCancelar ? 'A cancelar…' : 'Confirmar cancelamento'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
