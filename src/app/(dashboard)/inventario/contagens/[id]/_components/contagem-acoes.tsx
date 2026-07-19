'use client';

/**
 * Acções de contagem (Reconciliar, Concluir, Cancelar) — CLIENT COMPONENT.
 * AlertDialog para confirmações destrutivas; sem Dialog para criar/editar.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, ClipboardCheck, XCircle } from 'lucide-react';
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
  reconciliarContagemAction,
  concluirContagemAction,
  cancelarContagemAction,
} from '@/server/actions/inventario.actions';

interface ContagemAcoesProps {
  contagemId: string;
  status: string;
}

export function ContagemAcoes({ contagemId, status }: ContagemAcoesProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleReconciliar() {
    startTransition(async () => {
      const result = await reconciliarContagemAction({
        contagemId,
        limiarDiscrepanciaPct: 5,
        gerarLancamentoContabilistico: false,
      });
      if (result.ok) {
        toast.success(`Reconciliação concluída: ${result.data.ajustesGerados} ajuste(s) gerado(s)`);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleConcluir() {
    startTransition(async () => {
      const result = await concluirContagemAction({ contagemId });
      if (result.ok) {
        toast.success('Contagem concluída com sucesso');
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleCancelar() {
    startTransition(async () => {
      const result = await cancelarContagemAction({
        contagemId,
        motivo: 'Cancelada pelo utilizador',
      });
      if (result.ok) {
        toast.success('Contagem cancelada');
        router.push('/inventario/contagens');
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {status === 'EM_CONTAGEM' && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="default" size="sm" disabled={isPending}>
              <ClipboardCheck className="h-4 w-4 mr-2" />
              Reconciliar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reconciliar Contagem</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acção irá gerar ajustes de stock para todos os itens com diferença.
                A operação é atómica: ou todos os ajustes são aplicados, ou nenhum.
                Itens pendentes sem justificativa impedirão a reconciliação.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleReconciliar}>
                Confirmar Reconciliação
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {status === 'RECONCILIADA' && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="default" size="sm" disabled={isPending}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Concluir
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Concluir Contagem</AlertDialogTitle>
              <AlertDialogDescription>
                Ao concluir, a contagem fica imutável. Não será possível fazer alterações.
                Para corrigir, será necessário abrir uma nova contagem.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleConcluir}>
                Confirmar Conclusão
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {['EM_CONTAGEM', 'RECONCILIADA', 'RASCUNHO'].includes(status) && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={isPending}>
              <XCircle className="h-4 w-4 mr-2" />
              Cancelar Contagem
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar Contagem</AlertDialogTitle>
              <AlertDialogDescription>
                Tem a certeza que pretende cancelar esta contagem? Esta acção não pode ser revertida.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction onClick={handleCancelar} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Confirmar Cancelamento
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
