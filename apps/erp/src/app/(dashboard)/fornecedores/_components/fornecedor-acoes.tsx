'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import { arquivarFornecedorAction } from '@/server/actions/fornecedores.actions';

interface FornecedorAcoesProps {
  id: string;
  status: string;
  modoCompacto?: boolean;
}

/**
 * Acções de estado de um fornecedor.
 *
 * Padrão canónico: useTransition + AlertDialog (acção destrutiva: arquivar).
 */
export function FornecedorAcoes({ id, status, modoCompacto = false }: FornecedorAcoesProps) {
  const router = useRouter();
  const [arquivarPending, startArquivar] = useTransition();
  const [dialogAberto, setDialogAberto] = useState(false);

  const podeArquivar = status !== 'INATIVO';

  const handleArquivar = () => {
    startArquivar(async () => {
      const result = await arquivarFornecedorAction({ id });
      if (result.ok) {
        toast.success('Fornecedor arquivado com sucesso.');
        setDialogAberto(false);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao arquivar o fornecedor.');
      }
    });
  };

  if (!podeArquivar) return null;

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
          {modoCompacto ? 'Arquivar' : 'Arquivar Fornecedor'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Arquivar fornecedor?</AlertDialogTitle>
          <AlertDialogDescription>
            O fornecedor passará ao estado inactivo e não aparecerá nas pesquisas padrão.
            Esta acção pode ser revertida editando o fornecedor.
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
