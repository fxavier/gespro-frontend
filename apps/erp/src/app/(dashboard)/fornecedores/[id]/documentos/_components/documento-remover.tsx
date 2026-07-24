'use client';

/**
 * Remoção de documento de fornecedor — acção destrutiva via AlertDialog.
 * A action apaga o metadado E o objeto no storage (RF5, serviço removerDocumento).
 */
import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
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
import { removerDocumentoFornecedorAction } from '@/server/actions/fornecedores.actions';

interface Props {
  documentoId: string;
  nome: string;
}

export function DocumentoRemover({ documentoId, nome }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);

  const handleRemover = () => {
    startTransition(async () => {
      const result = await removerDocumentoFornecedorAction({ documentoId });
      if (result.ok) {
        toast.success('Documento removido.');
        setAberto(false);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Não foi possível remover o documento.');
      }
    });
  };

  return (
    <AlertDialog open={aberto} onOpenChange={setAberto}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          disabled={pending}
        >
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">Remover documento</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover documento?</AlertDialogTitle>
          <AlertDialogDescription>
            O documento “{nome}” e o respectivo ficheiro serão removidos
            permanentemente. Esta acção não pode ser revertida.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRemover}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? 'A remover…' : 'Remover'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
