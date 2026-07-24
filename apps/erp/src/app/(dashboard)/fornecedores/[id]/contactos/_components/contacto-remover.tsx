'use client';

/**
 * Botão de remoção de contacto — acção destrutiva via AlertDialog (única
 * excepção ao padrão sem-modais).
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
import { removerContactoFornecedorAction } from '@/server/actions/fornecedores.actions';

interface Props {
  contactoId: string;
  nome: string;
}

export function ContactoRemover({ contactoId, nome }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);

  const handleRemover = () => {
    startTransition(async () => {
      const result = await removerContactoFornecedorAction({ contactoId });
      if (result.ok) {
        toast.success('Contacto removido.');
        setAberto(false);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Não foi possível remover o contacto.');
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
          <span className="sr-only">Remover contacto</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover contacto?</AlertDialogTitle>
          <AlertDialogDescription>
            O contacto “{nome}” será removido permanentemente deste fornecedor.
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
