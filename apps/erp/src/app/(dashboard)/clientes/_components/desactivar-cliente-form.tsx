'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormSection } from '@/components/patterns';
import { desativarCliente } from '@/server/actions/clientes.actions';

interface DesactivarClienteFormProps {
  id: string;
}

/**
 * Formulário de desactivação (#136): o motivo segue para o servidor e fica no histórico
 * do cliente. `useTransition` + `router.push`: a action revalida `/clientes` e a ficha
 * deixa de existir para este cliente.
 */
export function DesactivarClienteForm({ id }: DesactivarClienteFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [motivo, setMotivo] = useState('');

  const submeter = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await desativarCliente({ id, motivo });
      if (result.ok) {
        toast.success('Cliente desactivado com sucesso.');
        router.push('/clientes');
      } else {
        toast.error(result.error.message ?? 'Erro ao desactivar o cliente.');
      }
    });
  };

  return (
    <form onSubmit={submeter} className="space-y-6">
      <FormSection
        title="Desactivar cliente"
        description="Esta acção não pode ser revertida directamente. O cliente passará ao estado Inactivo. Clientes com facturas por pagar não podem ser desactivados."
      >
        <div className="space-y-1.5">
          <Label htmlFor="motivo-desactivacao">Motivo (opcional)</Label>
          <Textarea
            id="motivo-desactivacao"
            className="resize-none"
            placeholder="Descreva o motivo da desactivação…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">
            O motivo fica registado no histórico do cliente.
          </p>
        </div>
      </FormSection>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href={`/clientes/${id}`}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Voltar
          </Link>
        </Button>
        <Button type="submit" variant="destructive" disabled={pending}>
          <UserX className="h-4 w-4 mr-1.5" />
          {pending ? 'A desactivar…' : 'Confirmar Desactivação'}
        </Button>
      </div>
    </form>
  );
}
