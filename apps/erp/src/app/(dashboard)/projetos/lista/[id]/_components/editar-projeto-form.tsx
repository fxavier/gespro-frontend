'use client';

/**
 * Formulário de edição de Projecto — CLIENT COMPONENT.
 * Padrão: useActionState + FormPage(actions=…) + UnsavedChangesGuard standalone.
 */

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
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
import { FormPage, UnsavedChangesGuard } from '@/components/patterns';
import { actualizarProjetoAction } from '@/server/actions/projetos.actions';

const Schema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').max(200),
  descricao: z.string().max(2000).optional(),
  prioridade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']),
  dataFimPrevista: z.string().min(1, 'Data de conclusão obrigatória'),
  orcamentoPlanejado: z.coerce.number().nonnegative().optional(),
  horasEstimadas: z.coerce.number().int().positive().optional(),
  observacoes: z.string().max(2000).optional(),
  tags: z.string().max(500).optional(),
});

type FormValues = z.infer<typeof Schema>;
type ActionState = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string; details?: unknown } } | null;

interface Props {
  id: string;
  defaultValues: {
    nome: string;
    descricao?: string | null;
    prioridade: string;
    dataFimPrevista: Date;
    orcamentoPlanejado?: string | number | null;
    horasEstimadas?: number | null;
    observacoes?: string | null;
    tags: string[];
  };
}

export function EditarProjetoForm({ id, defaultValues }: Props) {
  const router = useRouter();

  const [state, dispatch, isPending] = useActionState<ActionState, FormValues>(
    async (_prev, data) => {
      return actualizarProjetoAction({
        id,
        data: {
          nome: data.nome,
          descricao: data.descricao || undefined,
          prioridade: data.prioridade,
          dataFimPrevista: new Date(data.dataFimPrevista),
          orcamentoPlanejado: data.orcamentoPlanejado,
          horasEstimadas: data.horasEstimadas,
          observacoes: data.observacoes || undefined,
          tags: (data.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
        },
      });
    },
    null
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      nome: defaultValues.nome,
      descricao: defaultValues.descricao ?? '',
      prioridade: defaultValues.prioridade as FormValues['prioridade'],
      dataFimPrevista: defaultValues.dataFimPrevista.toISOString().slice(0, 10),
      orcamentoPlanejado: defaultValues.orcamentoPlanejado
        ? Number(defaultValues.orcamentoPlanejado)
        : undefined,
      horasEstimadas: defaultValues.horasEstimadas ?? undefined,
      observacoes: defaultValues.observacoes ?? '',
      tags: defaultValues.tags.join(', '),
    },
  });

  const isDirty = form.formState.isDirty;
  const errors = form.formState.errors;

  useEffect(() => {
    if (!state) return;
    if (!state.ok) {
      const details = state.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof FormValues, { type: 'server', message: messages[0] });
        });
      } else {
        toast.error(state.error.message ?? 'Erro ao guardar alterações.');
      }
    } else {
      toast.success('Projecto actualizado com sucesso.');
      router.push(`/projetos/lista/${id}`);
      router.refresh();
    }
  }, [state, form, router, id]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));

  const handleCancel = () => {
    if (isDirty) {
      if (!window.confirm('Tem alterações não guardadas. Tem a certeza que pretende sair?')) return;
    }
    router.push(`/projetos/lista/${id}`);
  };

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={isPending}>
              <X className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A guardar…' : 'Guardar Alterações'}
            </Button>
          </>
        }
      >
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="nome">Nome <span className="text-destructive">*</span></Label>
            <Input id="nome" {...form.register('nome')} />
            {errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prioridade">Prioridade</Label>
            <Select
              value={form.watch('prioridade')}
              onValueChange={(v) => form.setValue('prioridade', v as FormValues['prioridade'])}
            >
              <SelectTrigger id="prioridade">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BAIXA">Baixa</SelectItem>
                <SelectItem value="MEDIA">Média</SelectItem>
                <SelectItem value="ALTA">Alta</SelectItem>
                <SelectItem value="CRITICA">Crítica</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dataFimPrevista">Data de Conclusão Prevista <span className="text-destructive">*</span></Label>
            <Input type="date" id="dataFimPrevista" {...form.register('dataFimPrevista')} />
            {errors.dataFimPrevista && (
              <p className="text-xs text-destructive">{errors.dataFimPrevista.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="orcamentoPlanejado">Orçamento Planeado (MT)</Label>
            <Input type="number" min="0" id="orcamentoPlanejado" {...form.register('orcamentoPlanejado')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="horasEstimadas">Horas Estimadas</Label>
            <Input type="number" min="1" id="horasEstimadas" {...form.register('horasEstimadas')} />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="tags">Tags <span className="text-xs text-muted-foreground">(separadas por vírgula)</span></Label>
            <Input id="tags" {...form.register('tags')} placeholder="Ex.: mobile, urgente, client-a" />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea rows={4} id="descricao" {...form.register('descricao')} />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea rows={3} id="observacoes" {...form.register('observacoes')} />
          </div>
        </div>
      </FormPage>
    </>
  );
}
