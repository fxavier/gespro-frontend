'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore } from 'lucide-react';
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
import {
  arquivarFornecedorAction,
  reactivarFornecedorAction,
} from '@/server/actions/fornecedores.actions';

interface FornecedorAcoesProps {
  id: string;
  status: string;
  /** Fornecedor arquivado (deletedAt preenchido): mostra «Reactivar» em vez de «Arquivar». */
  arquivado?: boolean;
  modoCompacto?: boolean;
}

/**
 * Acções de estado de um fornecedor.
 *
 * Padrão canónico: useTransition + AlertDialog (arquivar; reactivar desfaz o arquivo).
 */
export function FornecedorAcoes({ id, status, arquivado = false, modoCompacto = false }: FornecedorAcoesProps) {
  if (arquivado) return <ReactivarFornecedor id={id} />;
  return <ArquivarFornecedor id={id} status={status} modoCompacto={modoCompacto} />;
}

function ArquivarFornecedor({ id, status, modoCompacto }: { id: string; status: string; modoCompacto: boolean }) {
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
            Pode desfazê-lo mais tarde com «Reactivar», no detalhe do fornecedor (lista de arquivados).
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

function ReactivarFornecedor({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startReactivar] = useTransition();
  const [dialogAberto, setDialogAberto] = useState(false);

  const handleReactivar = () => {
    startReactivar(async () => {
      const result = await reactivarFornecedorAction({ id });
      if (result.ok) {
        toast.success('Fornecedor reactivado.');
        setDialogAberto(false);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao reactivar o fornecedor.');
      }
    });
  };

  return (
    <AlertDialog open={dialogAberto} onOpenChange={setDialogAberto}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          <ArchiveRestore className="h-4 w-4 mr-2" />
          Reactivar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reactivar fornecedor?</AlertDialogTitle>
          <AlertDialogDescription>
            O fornecedor sai dos arquivados, volta ao estado activo e reaparece nas pesquisas padrão.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleReactivar} disabled={pending}>
            {pending ? 'A reactivar…' : 'Confirmar reactivação'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
