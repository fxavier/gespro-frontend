'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, CheckCircle2, Pause, Play, XCircle } from 'lucide-react';
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
import { transitarStatusInventarioFisicoAction } from '@/server/actions/inventario.actions';

type Status = 'PLANEJADO' | 'AGENDADO' | 'EM_ANDAMENTO' | 'PAUSADO' | 'CONCLUIDO' | 'CANCELADO';

/** Transições da máquina `TRANSICOES_INVENTARIO_FISICO`, por estado de origem (sem o cancelamento). */
const ACOES: Record<string, Array<{ para: Status; rotulo: string; sucesso: string; icone: typeof Play }>> = {
  PLANEJADO: [{ para: 'AGENDADO', rotulo: 'Agendar', sucesso: 'Inventário agendado.', icone: CalendarClock }],
  AGENDADO: [{ para: 'EM_ANDAMENTO', rotulo: 'Iniciar', sucesso: 'Inventário iniciado.', icone: Play }],
  EM_ANDAMENTO: [
    { para: 'CONCLUIDO', rotulo: 'Concluir', sucesso: 'Inventário concluído.', icone: CheckCircle2 },
    { para: 'PAUSADO', rotulo: 'Pausar', sucesso: 'Inventário pausado.', icone: Pause },
  ],
  PAUSADO: [{ para: 'EM_ANDAMENTO', rotulo: 'Retomar', sucesso: 'Inventário retomado.', icone: Play }],
};

const TERMINAIS = new Set(['CONCLUIDO', 'CANCELADO']);

/** Botões de transição do inventário físico (#117). Cancelar pede confirmação num AlertDialog. */
export function InventarioFisicoAcoes({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarAberto, setConfirmarAberto] = useState(false);

  if (TERMINAIS.has(status)) return null;

  const transitar = (novoStatus: Status, sucesso: string) => {
    setErro(null);
    iniciar(async () => {
      const r = await transitarStatusInventarioFisicoAction({ inventarioId: id, novoStatus });
      if (!r.ok) {
        const msg = r.error.message ?? 'Não foi possível mudar o estado do inventário.';
        setErro(msg);
        toast.error(msg);
        return;
      }
      setConfirmarAberto(false);
      toast.success(sucesso);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {(ACOES[status] ?? []).map(({ para, rotulo, sucesso, icone: Icone }) => (
          <Button key={para} size="sm" disabled={aCorrer} onClick={() => transitar(para, sucesso)}>
            <Icone className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {rotulo}
          </Button>
        ))}

        <AlertDialog open={confirmarAberto} onOpenChange={setConfirmarAberto}>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
              disabled={aCorrer}
            >
              <XCircle className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Cancelar inventário
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar este inventário?</AlertDialogTitle>
              <AlertDialogDescription>
                O inventário passa a Cancelado e não pode voltar a ser iniciado nem contado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={aCorrer}>Voltar</AlertDialogCancel>
              <AlertDialogAction
                disabled={aCorrer}
                onClick={(e) => {
                  e.preventDefault();
                  transitar('CANCELADO', 'Inventário cancelado.');
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Cancelar inventário
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
