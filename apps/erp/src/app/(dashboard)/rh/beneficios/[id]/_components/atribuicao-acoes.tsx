'use client';

/**
 * Acções sobre uma atribuição de benefício (#162): suspender, reactivar e terminar.
 * Sem dados a recolher ⇒ cada uma só pede confirmação num `AlertDialog`. Terminar grava a
 * data de fim de hoje (omissão do serviço); uma atribuição terminada não oferece acções e
 * deixa de entrar na folha (#95).
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
import { Button, buttonVariants } from '@/components/ui/button';
import {
  suspenderBeneficioAction,
  reactivarBeneficioAction,
  terminarBeneficioAction,
} from '@/server/actions/beneficios.actions';

type Accao = 'suspender' | 'reactivar' | 'terminar';

const TEXTOS: Record<Accao, { botao: string; titulo: string; descricao: string; sucesso: string; aCorrer: string }> = {
  suspender: {
    botao: 'Suspender',
    titulo: 'Suspender esta atribuição?',
    descricao: 'Enquanto estiver suspensa, o benefício não entra na folha de pagamento. Pode reactivá-la mais tarde.',
    sucesso: 'Atribuição suspensa.',
    aCorrer: 'A suspender…',
  },
  reactivar: {
    botao: 'Reactivar',
    titulo: 'Reactivar esta atribuição?',
    descricao: 'O benefício volta a entrar na folha de pagamento a partir do próximo processamento.',
    sucesso: 'Atribuição reactivada.',
    aCorrer: 'A reactivar…',
  },
  terminar: {
    botao: 'Terminar',
    titulo: 'Terminar esta atribuição?',
    descricao:
      'A atribuição termina com a data de hoje e deixa de entrar na folha de pagamento. Esta acção é definitiva: para voltar a dar o benefício, faça uma atribuição nova.',
    sucesso: 'Atribuição terminada.',
    aCorrer: 'A terminar…',
  },
};

function executar(accao: Accao, id: string) {
  if (accao === 'suspender') return suspenderBeneficioAction({ id });
  if (accao === 'reactivar') return reactivarBeneficioAction({ id });
  return terminarBeneficioAction({ id });
}

function ConfirmarAccao({ accao, atribuicaoId }: { accao: Accao; atribuicaoId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const t = TEXTOS[accao];

  const confirmar = () => {
    startTransition(async () => {
      const r = await executar(accao, atribuicaoId);
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(t.sucesso);
      setAberto(false);
      router.refresh();
    });
  };

  return (
    <AlertDialog open={aberto} onOpenChange={setAberto}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant={accao === 'terminar' ? 'ghost' : 'outline'} disabled={pending}>
          {t.botao}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.titulo}</AlertDialogTitle>
          <AlertDialogDescription>{t.descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className={accao === 'terminar' ? buttonVariants({ variant: 'destructive' }) : undefined}
            onClick={(e) => {
              e.preventDefault();
              confirmar();
            }}
            disabled={pending}
          >
            {pending ? t.aCorrer : t.botao}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AtribuicaoAcoes({ atribuicaoId, status }: { atribuicaoId: string; status: string }) {
  if (status === 'ACTIVO') {
    return (
      <>
        <ConfirmarAccao accao="suspender" atribuicaoId={atribuicaoId} />
        <ConfirmarAccao accao="terminar" atribuicaoId={atribuicaoId} />
      </>
    );
  }
  if (status === 'SUSPENSO') {
    return (
      <>
        <ConfirmarAccao accao="reactivar" atribuicaoId={atribuicaoId} />
        <ConfirmarAccao accao="terminar" atribuicaoId={atribuicaoId} />
      </>
    );
  }
  return null;
}
