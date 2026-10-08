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
import { aprovarQualidadeOrdemAction } from '@/server/actions/producao.actions';

interface QualidadeAcoesProps {
  id: string;
  numero: string;
}

/**
 * #166 — aprovar é uma confirmação (AlertDialog, sem campos); reprovar recolhe o motivo,
 * logo é rota própria (`/producao/ordens/<id>/reprovar-qualidade`). Só montado pelo detalhe
 * quando a ordem está EM_PRODUCAO e a sessão tem `producao:ordens:update`.
 */
export function QualidadeAcoes({ id, numero }: QualidadeAcoesProps) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const [aberto, setAberto] = useState(false);

  const aprovar = () => {
    iniciar(async () => {
      const r = await aprovarQualidadeOrdemAction({ id });
      if (r.ok) {
        toast.success(`Qualidade da ordem ${numero} aprovada.`);
        setAberto(false);
        router.refresh();
      } else {
        toast.error(r.error.message ?? 'Não foi possível aprovar a qualidade.');
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <AlertDialog open={aberto} onOpenChange={setAberto}>
        <AlertDialogTrigger asChild>
          <Button size="sm" disabled={aCorrer}>
            <CheckCircle className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Aprovar qualidade
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar a qualidade da ordem {numero}?</AlertDialogTitle>
            <AlertDialogDescription>
              Fica registado que a produção passou o controlo de qualidade; a ordem pode depois
              ser concluída e o produto acabado dá entrada em stock.
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
              {aCorrer ? 'A registar…' : 'Aprovar'}
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
        <Link href={`/producao/ordens/${id}/reprovar-qualidade`}>
          <XCircle className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Reprovar qualidade
        </Link>
      </Button>
    </div>
  );
}
