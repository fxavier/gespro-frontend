'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';
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
  apagarPlano,
  arquivarPlano,
  desarquivarPlano,
} from '@/server/actions/plataforma-planos.actions';

interface PlanoAcoesProps {
  id: string;
  codigo: string;
  arquivado: boolean;
  assinaturas: number;
}

function textoAssinaturas(n: number): string {
  return n === 1 ? '1 assinatura' : `${n} assinaturas`;
}

/**
 * Editar, arquivar/desarquivar e apagar um plano (#526). O `AlertDialog` só confirma — não
 * recolhe dados. Com assinaturas, «Apagar» explica porque não se pode e oferece arquivar.
 */
export function PlanoAcoes({ id, codigo, arquivado, assinaturas }: PlanoAcoesProps) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [dialogo, setDialogo] = useState<'arquivar' | 'apagar' | null>(null);

  const arquivar = () =>
    startTransition(async () => {
      const r = await arquivarPlano({ id });
      setDialogo(null);
      if (r.ok) {
        toast.success(`Plano ${codigo} arquivado.`);
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });

  const desarquivar = () =>
    startTransition(async () => {
      const r = await desarquivarPlano({ id });
      if (r.ok) {
        toast.success(`Plano ${codigo} desarquivado.`);
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });

  const apagar = () =>
    startTransition(async () => {
      const r = await apagarPlano({ id });
      setDialogo(null);
      if (r.ok) {
        toast.success(`Plano ${codigo} apagado.`);
        router.push('/plataforma/planos');
      } else {
        toast.error(r.error.message);
      }
    });

  const aberto = (qual: 'arquivar' | 'apagar') => ({
    open: dialogo === qual,
    onOpenChange: (v: boolean) => setDialogo(v ? qual : null),
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href={`/plataforma/planos/${id}/editar`}>
          <Pencil className="h-4 w-4" aria-hidden />
          Editar
        </Link>
      </Button>

      {arquivado ? (
        <Button variant="outline" size="sm" disabled={pendente} onClick={desarquivar}>
          <ArchiveRestore className="h-4 w-4" aria-hidden />
          Desarquivar
        </Button>
      ) : (
        <AlertDialog {...aberto('arquivar')}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={pendente}>
              <Archive className="h-4 w-4" aria-hidden />
              Arquivar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Arquivar o plano {codigo}?</AlertDialogTitle>
              <AlertDialogDescription>
                Sai do site e de checkouts novos. {assinaturas > 0 ? `As ${textoAssinaturas(assinaturas)} existentes mantêm o plano e os limites.` : ''}{' '}
                Pode desarquivá-lo depois.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pendente}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={pendente}
                onClick={(e) => {
                  e.preventDefault();
                  arquivar();
                }}
              >
                Arquivar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <AlertDialog {...aberto('apagar')}>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={pendente}
            className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Apagar
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          {assinaturas > 0 ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>O plano {codigo} não pode ser apagado</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem {textoAssinaturas(assinaturas)}.{' '}
                  {arquivado
                    ? 'Já está arquivado: fora do site e de checkouts novos, e quem o tem mantém-no.'
                    : 'Arquive-o: sai do site e de checkouts novos, e quem já o tem mantém-no.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pendente}>Fechar</AlertDialogCancel>
                {!arquivado && (
                  <AlertDialogAction
                    disabled={pendente}
                    onClick={(e) => {
                      e.preventDefault();
                      arquivar();
                    }}
                  >
                    Arquivar em vez disso
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Apagar o plano {codigo}?</AlertDialogTitle>
                <AlertDialogDescription>
                  O plano deixa de existir. Esta acção não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pendente}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={pendente}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={(e) => {
                    e.preventDefault();
                    apagar();
                  }}
                >
                  Apagar
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
