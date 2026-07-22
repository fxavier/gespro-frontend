'use client';

/**
 * Formulário de criação de ticket — Client Component.
 * Segue o padrão golden standard: useTransition + server action, sem Dialog.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
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
import { criarTicketAction } from '@/server/actions/tickets.actions';
import type { CategoriaTicketResumo } from '@/server/services/operacoes/ticket.interface';

interface NovoTicketFormProps {
  categorias: CategoriaTicketResumo[];
}

export function NovoTicketForm({ categorias }: NovoTicketFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    startTransition(async () => {
      const categoriaId = data.get('categoriaId') as string;
      const result = await criarTicketAction({
        titulo: data.get('titulo') as string,
        descricao: data.get('descricao') as string,
        tipo: data.get('tipo') as 'INCIDENTE' | 'REQUISICAO' | 'PROBLEMA' | 'MUDANCA' | 'CONSULTA',
        prioridade: data.get('prioridade') as 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE',
        categoriaId: categoriaId || undefined,
        observacoes: (data.get('observacoes') as string) || undefined,
        tags: [],
      });

      if (result.ok) {
        toast.success('Ticket criado com sucesso.');
        router.push(`/tickets/${result.data.id}`);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao criar ticket.');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      <div className="space-y-1.5">
        <Label htmlFor="titulo">Título *</Label>
        <Input
          id="titulo"
          name="titulo"
          required
          minLength={3}
          maxLength={300}
          placeholder="Descreva brevemente o problema…"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="tipo">Tipo *</Label>
          <Select name="tipo" defaultValue="INCIDENTE" required>
            <SelectTrigger id="tipo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="INCIDENTE">Incidente</SelectItem>
              <SelectItem value="REQUISICAO">Requisição</SelectItem>
              <SelectItem value="PROBLEMA">Problema</SelectItem>
              <SelectItem value="MUDANCA">Mudança</SelectItem>
              <SelectItem value="CONSULTA">Consulta</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="prioridade">Prioridade *</Label>
          <Select name="prioridade" defaultValue="NORMAL" required>
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
      </div>

      {categorias.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="categoriaId">Categoria</Label>
          <Select name="categoriaId">
            <SelectTrigger id="categoriaId">
              <SelectValue placeholder="Sem categoria" />
            </SelectTrigger>
            <SelectContent>
              {categorias.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="descricao">Descrição *</Label>
        <Textarea
          id="descricao"
          name="descricao"
          required
          minLength={10}
          maxLength={5000}
          rows={6}
          placeholder="Descreva o problema em detalhe…"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea
          id="observacoes"
          name="observacoes"
          rows={3}
          maxLength={2000}
          placeholder="Informações adicionais (opcional)…"
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'A criar…' : 'Criar Ticket'}
        </Button>
        <Button type="button" variant="outline" asChild disabled={pending}>
          <Link href="/tickets/lista">Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
