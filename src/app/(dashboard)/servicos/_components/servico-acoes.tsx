'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive } from 'lucide-react';
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
import { arquivarServicoAction } from '@/server/actions/servicos.actions';

interface ServicoAcoesProps {
  id: string;
  ativo: boolean;
  modoCompacto?: boolean;
}

/**
 * Acções de estado de um serviço.
 * Padrão canónico: useTransition + AlertDialog (acção destrutiva: arquivar).
 */
export function ServicoAcoes({ id, ativo, modoCompacto = false }: ServicoAcoesProps) {
  const router = useRouter();
  const [arquivarPending, startArquivar] = useTransition();
  const [dialogAberto, setDialogAberto] = useState(false);

  const handleArquivar = () => {
    startArquivar(async () => {
      const result = await arquivarServicoAction({ id });
      if (result.ok) {
        toast.success('Serviço arquivado com sucesso.');
        setDialogAberto(false);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao arquivar o serviço.');
      }
    });
  };

  if (!ativo) return null;

  return (
    <AlertDialog open={dialogAberto} onOpenChange={setDialogAberto}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 px-2"
          disabled={arquivarPending}
        >
          <Archive className="h-4 w-4 mr-2" />
          {modoCompacto ? 'Arquivar' : 'Arquivar Serviço'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Arquivar serviço?</AlertDialogTitle>
          <AlertDialogDescription>
            O serviço passará ao estado inactivo e não estará disponível para novos agendamentos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleArquivar}
            disabled={arquivarPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {arquivarPending ? 'A arquivar…' : 'Confirmar Arquivo'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
