'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserX } from 'lucide-react';
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
import { desativarCliente } from '@/server/actions/clientes.actions';

interface ClienteAcoesProps {
  id: string;
  status: string;
  modoCompacto?: boolean;
}

/**
 * Acções de estado de um cliente.
 *
 * PADRÃO CANÓNICO: useTransition + AlertDialog (único modal permitido).
 * AlertDialog para desativar (acção destrutiva).
 */
export function ClienteAcoes({ id, status, modoCompacto = false }: ClienteAcoesProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [motivo, setMotivo] = useState('');
  const [dialogAberto, setDialogAberto] = useState(false);

  const podeDesativar = status === 'ATIVO' || status === 'SUSPENSO';

  const handleDesativar = () => {
    startTransition(async () => {
      const result = await desativarCliente({ id });
      if (result.ok) {
        toast.success('Cliente desactivado com sucesso.');
        setDialogAberto(false);
        setMotivo('');
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao desactivar o cliente.');
      }
    });
  };

  if (!podeDesativar) return null;

  return (
    <AlertDialog open={dialogAberto} onOpenChange={setDialogAberto}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full justify-start"
          disabled={pending}
        >
          <UserX className="h-4 w-4 mr-1.5" />
          {modoCompacto ? 'Desactivar' : 'Desactivar Cliente'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desactivar cliente?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acção não pode ser revertida directamente. O cliente passará ao estado
            Inactivo. Clientes com crédito utilizado não podem ser desactivados.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-2 space-y-1.5">
          <Label htmlFor={`motivo-${id}`} className="text-sm font-medium">
            Motivo (opcional)
          </Label>
          <Textarea
            id={`motivo-${id}`}
            className="resize-none"
            placeholder="Descreva o motivo da desactivação…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            maxLength={500}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setMotivo('')}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDesativar}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? 'A desactivar…' : 'Confirmar Desactivação'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
