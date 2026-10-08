'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle, XCircle } from 'lucide-react';
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
import { decidirAprovacaoAction } from '@/server/actions/compras.actions';

interface RequisicaoDecisaoProps {
  id: string;
  numero: string;
  /** Nível corrente em que o utilizador da sessão tem uma decisão PENDENTE. */
  nivel: number;
}

/**
 * Decisão do aprovador pendente sobre uma requisição (#108).
 *
 * Só é montado pelo detalhe quando a sessão tem uma decisão PENDENTE no nível corrente
 * e a permissão `compras:aprovacao:decidir`. Aprovar é uma confirmação (AlertDialog, sem
 * campos); rejeitar recolhe um motivo, logo é rota própria (`/[id]/rejeitar`).
 */
export function RequisicaoDecisao({ id, numero, nivel }: RequisicaoDecisaoProps) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const [aberto, setAberto] = useState(false);

  const aprovar = () => {
    iniciar(async () => {
      const r = await decidirAprovacaoAction({ documentoId: id, nivel, status: 'APROVADO' });
      if (r.ok) {
        toast.success(`Requisição ${numero} aprovada (nível ${nivel}).`);
        setAberto(false);
        router.refresh();
      } else {
        toast.error(r.error.message ?? 'Não foi possível aprovar a requisição.');
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <AlertDialog open={aberto} onOpenChange={setAberto}>
        <AlertDialogTrigger asChild>
          <Button size="sm" disabled={aCorrer}>
            <CheckCircle className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Aprovar…
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar a requisição {numero}?</AlertDialogTitle>
            <AlertDialogDescription>
              Regista a sua decisão no nível {nivel} do circuito. Se for o último nível a fechar,
              a requisição fica aprovada; senão, segue para o nível seguinte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aCorrer}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                aprovar();
              }}
              disabled={aCorrer}
            >
              {aCorrer ? 'A registar…' : 'Confirmar aprovação'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Button
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
        asChild
      >
        <Link href={`/compras/requisicoes/${id}/rejeitar`}>
          <XCircle className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Rejeitar…
        </Link>
      </Button>
    </div>
  );
}
