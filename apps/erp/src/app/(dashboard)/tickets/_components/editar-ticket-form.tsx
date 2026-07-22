'use client';

/**
 * Formulário de edição de ticket — Client Component.
 * Segue o padrão golden standard: useTransition + server action.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { atualizarTicketAction } from '@/server/actions/tickets.actions';
import type { TicketDetalhe } from '@/server/services/operacoes/ticket.interface';

interface EditarTicketFormProps {
  ticket: TicketDetalhe;
}

export function EditarTicketForm({ ticket }: EditarTicketFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    startTransition(async () => {
      const result = await atualizarTicketAction({
        id: ticket.id,
        titulo: data.get('titulo') as string,
        descricao: data.get('descricao') as string,
        prioridade: data.get('prioridade') as 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE',
        observacoes: data.get('observacoes') as string || undefined,
      });

      if (result.ok) {
        toast.success('Ticket actualizado com sucesso.');
        router.push(`/tickets/${ticket.id}`);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao actualizar o ticket.');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      <div className="space-y-1.5">
        <Label htmlFor="titulo">Título</Label>
        <Input
          id="titulo"
          name="titulo"
          defaultValue={ticket.titulo}
          required
          maxLength={300}
          placeholder="Título do ticket…"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="prioridade">Prioridade</Label>
        <Select name="prioridade" defaultValue={ticket.prioridade}>
          <SelectTrigger id="prioridade">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BAIXA">Baixa</SelectItem>
            <SelectItem value="NORMAL">Normal</SelectItem>
            <SelectItem value="ALTA">Alta</SelectItem>
            <SelectItem value="URGENTE">Urgente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea
          id="descricao"
          name="descricao"
          defaultValue={ticket.descricao}
          required
          rows={6}
          maxLength={5000}
          placeholder="Descrição detalhada do ticket…"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea
          id="observacoes"
          name="observacoes"
          defaultValue={ticket.observacoes ?? ''}
          rows={3}
          maxLength={1000}
          placeholder="Observações adicionais (opcional)…"
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'A guardar…' : 'Guardar Alterações'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
