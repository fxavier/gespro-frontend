'use client';

/**
 * Repor a palavra-passe de um utilizador (ADR-0030 §6).
 *
 * O AlertDialog é a única excepção à regra sem-modais, e vale aqui pelo mesmo
 * motivo de sempre: é uma confirmação destrutiva — a palavra-passe actual
 * deixa de funcionar no instante em que se carrega no botão.
 *
 * A nova aparece uma única vez, neste ecrã. Não é guardada em lado nenhum.
 */

import { useState, useTransition } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
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
import { reporPalavraPasse } from '@/server/actions/plataforma.actions';

export function ReporPalavraPasse({ id, nome }: { id: string; nome: string }) {
  const [aCorrer, iniciarTransicao] = useTransition();
  const [nova, setNova] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const repor = () => {
    iniciarTransicao(async () => {
      const res = await reporPalavraPasse({ id });
      if (!res.ok) {
        toast.error(res.error.message ?? 'Não foi possível repor a palavra-passe.');
        return;
      }
      setNova(res.data.palavraPasse);
    });
  };

  const copiar = async () => {
    if (!nova) return;
    try {
      await navigator.clipboard.writeText(nova);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.error('O navegador não deixou copiar. Anote a palavra-passe antes de fechar.');
    }
  };

  return (
    <AlertDialog
      onOpenChange={(aberto) => {
        if (!aberto) setNova(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Repor palavra-passe
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        {nova ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Palavra-passe reposta</AlertDialogTitle>
              <AlertDialogDescription>
                Entregue-a a <strong>{nome}</strong>. Não volta a ser mostrada, e no próximo
                acesso é pedido que a troque.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <p className="rounded-lg border bg-muted/40 p-4 text-center font-mono text-lg tracking-wide">
              {nova}
            </p>

            <AlertDialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={copiar}>
                {copiado ? (
                  <Check className="h-4 w-4 mr-1.5" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4 mr-1.5" aria-hidden="true" />
                )}
                {copiado ? 'Copiado' : 'Copiar'}
              </Button>
              <AlertDialogAction>Já anotei</AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Repor a palavra-passe de {nome}?</AlertDialogTitle>
              <AlertDialogDescription>
                A palavra-passe actual deixa de funcionar imediatamente. Vai receber uma
                provisória para entregar ao próprio, que terá de a mudar ao entrar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <Button type="button" size="sm" onClick={repor} disabled={aCorrer}>
                {aCorrer ? 'A repor…' : 'Repor palavra-passe'}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
