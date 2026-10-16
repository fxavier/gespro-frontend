'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { TRANSICOES_AGENDAMENTO } from '@/lib/state-machines';
import { transitarAgendamentoAction } from '@/server/actions/servicos.actions';

type Estado = 'CONFIRMADO' | 'EM_ANDAMENTO' | 'CANCELADO' | 'NAO_COMPARECEU';

/** Transições de um clique; as terminais pedem confirmação. CONCLUIDO tem rota própria (notas). */
const ACCOES: Record<Estado, { rotulo: string; sucesso: string; confirmar?: { titulo: string; texto: string } }> = {
  CONFIRMADO: { rotulo: 'Confirmar', sucesso: 'Agendamento confirmado.' },
  EM_ANDAMENTO: { rotulo: 'Iniciar', sucesso: 'Agendamento em andamento.' },
  NAO_COMPARECEU: {
    rotulo: 'Não compareceu',
    sucesso: 'Registado que o cliente não compareceu.',
    confirmar: { titulo: 'Registar que o cliente não compareceu?', texto: 'O agendamento fica fechado e não pode voltar atrás.' },
  },
  CANCELADO: {
    rotulo: 'Cancelar agendamento',
    sucesso: 'Agendamento cancelado.',
    confirmar: { titulo: 'Cancelar o agendamento?', texto: 'O agendamento fica cancelado e não pode voltar atrás.' },
  },
};

export function AgendamentoAcoes({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [dialogo, setDialogo] = useState<Estado | null>(null);
  const permitidos = TRANSICOES_AGENDAMENTO[status] ?? [];

  const transitar = (novoStatus: Estado) =>
    startTransition(async () => {
      const r = await transitarAgendamentoAction({ agendamentoId: id, novoStatus });
      setDialogo(null);
      if (r.ok) {
        toast.success(ACCOES[novoStatus].sucesso);
        router.refresh();
      } else {
        toast.error(r.error.message ?? 'Não foi possível mudar o estado.');
      }
    });

  return (
    <>
      {permitidos.includes('CONCLUIDO') && (
        <Button size="sm" asChild>
          <Link href={`/servicos/agendamentos/${id}/concluir`}>Concluir</Link>
        </Button>
      )}
      {(Object.keys(ACCOES) as Estado[])
        .filter((e) => permitidos.includes(e))
        .map((e) => {
          const { rotulo, confirmar } = ACCOES[e];
          if (!confirmar) {
            return (
              <Button key={e} size="sm" onClick={() => transitar(e)} disabled={pendente}>
                {rotulo}
              </Button>
            );
          }
          return (
            <AlertDialog key={e} open={dialogo === e} onOpenChange={(aberto) => setDialogo(aberto ? e : null)}>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={pendente}>
                  {rotulo}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{confirmar.titulo}</AlertDialogTitle>
                  <AlertDialogDescription>{confirmar.texto}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(ev) => {
                      ev.preventDefault();
                      transitar(e);
                    }}
                    disabled={pendente}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {pendente ? 'A gravar…' : rotulo}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          );
        })}
    </>
  );
}
