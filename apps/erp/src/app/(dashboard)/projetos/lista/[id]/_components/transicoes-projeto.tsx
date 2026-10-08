'use client';

/**
 * Botões de estado do projecto (#167). As transições permitidas vêm do Server Component
 * (`TRANSICOES_PROJETO[status]`, que vive num módulo `server-only`); aqui só se desenha um
 * botão por transição e se chama `transitarStatusProjetoAction`. Cancelar é destrutivo e pede
 * confirmação por `AlertDialog` (o único modal permitido).
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Archive, Ban, CheckCircle2, Pause, Play } from 'lucide-react';
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
import { transitarStatusProjetoAction } from '@/server/actions/projetos.actions';

interface Props {
  id: string;
  status: string;
  transicoes: string[];
}

function rotulo(alvo: string, actual: string): string {
  switch (alvo) {
    case 'EM_ANDAMENTO':
      return actual === 'PAUSADO' ? 'Retomar' : 'Iniciar';
    case 'PAUSADO':
      return 'Pausar';
    case 'CONCLUIDO':
      return 'Concluir';
    case 'CANCELADO':
      return 'Cancelar projecto';
    case 'ARQUIVADO':
      return 'Arquivar';
    default:
      return alvo;
  }
}

const ICONE: Record<string, typeof Play> = {
  EM_ANDAMENTO: Play,
  PAUSADO: Pause,
  CONCLUIDO: CheckCircle2,
  CANCELADO: Ban,
  ARQUIVADO: Archive,
};

export function TransicoesProjeto({ id, status, transicoes }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function transitar(novoStatus: string) {
    startTransition(async () => {
      const r = await transitarStatusProjetoAction({ id, novoStatus });
      if (r.ok) {
        toast.success('Estado do projecto actualizado.');
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  }

  if (transicoes.length === 0) return null;

  return (
    <>
      {transicoes.map((alvo) => {
        const Icone = ICONE[alvo] ?? Play;
        const texto = rotulo(alvo, status);
        if (alvo === 'CANCELADO') {
          return (
            <AlertDialog key={alvo}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isPending}>
                  <Icone className="h-4 w-4 mr-1.5" />
                  {texto}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar o projecto?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Um projecto cancelado já não se retoma; só pode ser arquivado.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => transitar(alvo)} disabled={isPending}>
                    Confirmar cancelamento
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          );
        }
        return (
          <Button
            key={alvo}
            variant={alvo === 'EM_ANDAMENTO' || alvo === 'CONCLUIDO' ? 'default' : 'outline'}
            size="sm"
            disabled={isPending}
            onClick={() => transitar(alvo)}
          >
            <Icone className="h-4 w-4 mr-1.5" />
            {texto}
          </Button>
        );
      })}
    </>
  );
}
