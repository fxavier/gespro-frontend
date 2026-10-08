'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send, XCircle } from 'lucide-react';
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
import { enviarCotacaoAction, cancelarCotacaoAction } from '@/server/actions/compras.actions';

interface Props {
  id: string;
  numero: string;
  podeEnviar: boolean;
  podeCancelar: boolean;
}

/**
 * Enviar e cancelar uma cotação (#109). Cancelar é destrutivo e pede confirmação num
 * AlertDialog — só confirmação, sem recolher dados (um campo de texto seria uma rota).
 */
export function CotacaoAcoes({ id, numero, podeEnviar, podeCancelar }: Props) {
  const router = useRouter();
  const [enviando, iniciarEnvio] = useTransition();
  const [cancelando, iniciarCancelamento] = useTransition();
  const [aberto, setAberto] = useState(false);

  if (!podeEnviar && !podeCancelar) return null;

  const enviar = () => {
    iniciarEnvio(async () => {
      const r = await enviarCotacaoAction({ cotacaoId: id });
      if (!r.ok) {
        toast.error(r.error.message ?? 'Não foi possível enviar a cotação.');
        return;
      }
      toast.success('Cotação enviada aos fornecedores.');
      router.refresh();
    });
  };

  const cancelar = () => {
    iniciarCancelamento(async () => {
      const r = await cancelarCotacaoAction({ cotacaoId: id, motivo: 'Cancelada no detalhe da cotação' });
      setAberto(false);
      if (!r.ok) {
        toast.error(r.error.message ?? 'Não foi possível cancelar a cotação.');
        return;
      }
      toast.success('Cotação cancelada.');
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      {podeEnviar && (
        <Button size="sm" onClick={enviar} disabled={enviando}>
          <Send className="h-4 w-4 mr-1.5" aria-hidden="true" />
          {enviando ? 'A enviar…' : 'Enviar aos fornecedores'}
        </Button>
      )}

      {podeCancelar && (
        <AlertDialog open={aberto} onOpenChange={setAberto}>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
              disabled={cancelando}
            >
              <XCircle className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Cancelar cotação
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar a cotação {numero}?</AlertDialogTitle>
              <AlertDialogDescription>
                A cotação passa a Cancelada e deixa de aceitar respostas ou adjudicação. Esta acção
                não pode ser revertida.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  cancelar();
                }}
                disabled={cancelando}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {cancelando ? 'A cancelar…' : 'Cancelar cotação'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
