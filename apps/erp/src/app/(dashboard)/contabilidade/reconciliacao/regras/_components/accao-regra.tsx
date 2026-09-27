'use client';

/**
 * Desactivar e reactivar uma regra de sugestão (issue #140). Confirmação sem
 * dados a recolher ⇒ `AlertDialog`. Não há eliminar: a regra desactivada deixa
 * de ser proposta, e pode voltar.
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
import {
  activarRegraSugestaoAction,
  desactivarRegraSugestaoAction,
} from '@/server/actions/reconciliacao.actions';

export type TipoAccaoRegra = 'desactivar' | 'activar';

const TEXTO: Record<TipoAccaoRegra, { botao: string; titulo: string; aCorrer: string; feito: string; descricao: string }> = {
  desactivar: {
    botao: 'Desactivar',
    titulo: 'Desactivar a regra',
    aCorrer: 'A desactivar…',
    feito: 'desactivada',
    descricao:
      'A regra deixa de ser usada para sugerir lançamentos. As sugestões já aceites não mudam, e a regra pode voltar a ser activada.',
  },
  activar: {
    botao: 'Activar',
    titulo: 'Activar a regra',
    aCorrer: 'A activar…',
    feito: 'activada',
    descricao: 'A regra volta a ser usada para sugerir lançamentos, pela ordem da sua prioridade.',
  },
};

const ACCAO = {
  desactivar: desactivarRegraSugestaoAction,
  activar: activarRegraSugestaoAction,
} as const;

export function AccaoRegra({ tipo, id, rotulo }: { tipo: TipoAccaoRegra; id: string; rotulo: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const t = TEXTO[tipo];

  const confirmar = () => {
    startTransition(async () => {
      const r = await ACCAO[tipo]({ id });
      setAberto(false);
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(`Regra «${rotulo}» ${t.feito}.`);
      router.refresh();
    });
  };

  return (
    <AlertDialog open={aberto} onOpenChange={setAberto}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={pending} aria-label={`${t.botao} a regra ${rotulo}`}>
          {t.botao}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t.titulo} «{rotulo}»?
          </AlertDialogTitle>
          <AlertDialogDescription>{t.descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirmar();
            }}
            disabled={pending}
            className={tipo === 'desactivar' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
          >
            {pending ? t.aCorrer : t.botao}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
