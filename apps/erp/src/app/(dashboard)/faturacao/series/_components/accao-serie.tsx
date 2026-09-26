'use client';

/**
 * Desactivar, reactivar e eliminar uma série (#149, ticket 7.3). Confirmação
 * sem dados a recolher ⇒ `AlertDialog`. As regras (S1, S3) são do serviço: o
 * diálogo avisa antes, mas a recusa do servidor chega ao utilizador tal qual.
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
  activarSerieDocumento,
  desactivarSerieDocumento,
  eliminarSerieDocumento,
} from '@/server/actions/faturacao.actions';

export type TipoAccaoSerie = 'desactivar' | 'activar' | 'eliminar';

const TEXTO: Record<TipoAccaoSerie, { botao: string; titulo: string; confirmar: string; aCorrer: string; feito: string }> = {
  desactivar: {
    botao: 'Desactivar',
    titulo: 'Desactivar a série',
    confirmar: 'Desactivar',
    aCorrer: 'A desactivar…',
    feito: 'desactivada',
  },
  activar: {
    botao: 'Activar',
    titulo: 'Activar a série',
    confirmar: 'Activar',
    aCorrer: 'A activar…',
    feito: 'activada',
  },
  eliminar: {
    botao: 'Eliminar',
    titulo: 'Eliminar a série',
    confirmar: 'Eliminar',
    aCorrer: 'A eliminar…',
    feito: 'eliminada',
  },
};

const ACCAO = {
  desactivar: desactivarSerieDocumento,
  activar: activarSerieDocumento,
  eliminar: eliminarSerieDocumento,
} as const;

interface Props {
  tipo: TipoAccaoSerie;
  id: string;
  /** Ex.: «FAT/2026 — Factura». */
  rotulo: string;
  /** Texto do corpo do diálogo (consequências). */
  descricao: string;
  /** Aviso destacado (p.ex. deixar de poder emitir o tipo no ano corrente). */
  aviso?: string;
}

export function AccaoSerie({ tipo, id, rotulo, descricao, aviso }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const t = TEXTO[tipo];
  const destrutiva = tipo !== 'activar';

  const confirmar = () => {
    startTransition(async () => {
      const r = await ACCAO[tipo]({ id });
      if (!r.ok) {
        toast.error(r.error.message);
        setAberto(false);
        return;
      }
      toast.success(`Série ${rotulo} ${t.feito}.`);
      setAberto(false);
      router.refresh();
    });
  };

  return (
    <AlertDialog open={aberto} onOpenChange={setAberto}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          className={tipo === 'eliminar' ? 'text-destructive hover:text-destructive hover:bg-destructive/10' : undefined}
          aria-label={`${t.botao} a série ${rotulo}`}
        >
          {t.botao}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t.titulo} {rotulo}?
          </AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        {aviso && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            data-testid="aviso-unica-activa"
          >
            {aviso}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirmar();
            }}
            disabled={pending}
            className={destrutiva ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
          >
            {pending ? t.aCorrer : t.confirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
