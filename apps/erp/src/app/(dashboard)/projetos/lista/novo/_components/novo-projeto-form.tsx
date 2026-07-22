'use client';

/**
 * Formulário de criação de Projecto — CLIENT COMPONENT.
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
import { criarProjetoAction } from '@/server/actions/projetos.actions';

const Schema = z.object({
  codigo: z.string().min(1, 'Código obrigatório').max(20),
  nome: z.string().min(1, 'Nome obrigatório').max(200),
  descricao: z.string().max(2000).optional(),
  tipo: z.enum(['INTERNO', 'EXTERNO', 'PESQUISA', 'DESENVOLVIMENTO']),
  prioridade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']),
  dataInicio: z.string().min(1, 'Data de início obrigatória'),
  dataFimPrevista: z.string().min(1, 'Data de conclusão obrigatória'),
  orcamentoPlanejado: z.coerce.number().nonnegative().optional(),
  horasEstimadas: z.coerce.number().int().positive().optional(),
  observacoes: z.string().max(2000).optional(),
  tags: z.string().max(500).optional(),
}).refine(
  (d) => new Date(d.dataFimPrevista) >= new Date(d.dataInicio),
  { message: 'Data de conclusão não pode ser anterior à data de início', path: ['dataFimPrevista'] },
);

type FormValues = z.infer<typeof Schema>;
type ActionState = { ok: true; data: { id?: string } } | { ok: false; error: { code: string; message: string; details?: unknown } } | null;

const today = new Date().toISOString().slice(0, 10);
const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export function NovoProjetoForm() {
  const router = useRouter();

  const [state, dispatch, isPending] = useActionState<ActionState, FormValues>(
    async (_prev, data) => {
      return criarProjetoAction({
        codigo: data.codigo,
        nome: data.nome,
        descricao: data.descricao || undefined,
        tipo: data.tipo,
        prioridade: data.prioridade,
        dataInicio: new Date(data.dataInicio),
        dataFimPrevista: new Date(data.dataFimPrevista),
        orcamentoPlanejado: data.orcamentoPlanejado,
        horasEstimadas: data.horasEstimadas,
        observacoes: data.observacoes || undefined,
        tags: (data.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
      }) as Promise<ActionState>;
    },
    null
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      codigo: '',
      nome: '',
      descricao: '',
      tipo: 'INTERNO',
      prioridade: 'MEDIA',
      dataInicio: today,
      dataFimPrevista: thirtyDaysLater,
      tags: '',
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
        toast.error(state.error.message ?? 'Erro ao criar projecto.');
      }
    } else {
      toast.success('Projecto criado com sucesso.');
      router.push(`/projetos/lista/${state.data?.id ?? ''}`);
    }
  }, [state, form, router]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));

  const handleCancel = () => {
    if (isDirty) {
      if (!window.confirm('Tem alterações não guardadas. Tem a certeza que pretende sair?')) return;
    }
    router.push('/projetos/lista');
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
              {isPending ? 'A criar…' : 'Criar Projecto'}
            </Button>
          </>
        }
      >
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="codigo">Código <span className="text-destructive">*</span></Label>
            <Input id="codigo" {...form.register('codigo')} placeholder="PRJ-001" />
            {errors.codigo && <p className="text-xs text-destructive">{errors.codigo.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome <span className="text-destructive">*</span></Label>
            <Input id="nome" {...form.register('nome')} placeholder="Nome do projecto" />
            {errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select
              value={form.watch('tipo')}
              onValueChange={(v) => form.setValue('tipo', v as FormValues['tipo'])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="INTERNO">Interno</SelectItem>
                <SelectItem value="EXTERNO">Externo</SelectItem>
                <SelectItem value="PESQUISA">Pesquisa</SelectItem>
                <SelectItem value="DESENVOLVIMENTO">Desenvolvimento</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <Select
              value={form.watch('prioridade')}
              onValueChange={(v) => form.setValue('prioridade', v as FormValues['prioridade'])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BAIXA">Baixa</SelectItem>
                <SelectItem value="MEDIA">Média</SelectItem>
                <SelectItem value="ALTA">Alta</SelectItem>
                <SelectItem value="CRITICA">Crítica</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dataInicio">Data de Início <span className="text-destructive">*</span></Label>
            <Input type="date" id="dataInicio" {...form.register('dataInicio')} />
            {errors.dataInicio && <p className="text-xs text-destructive">{errors.dataInicio.message}</p>}
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
            <Input type="number" min="0" id="orcamentoPlanejado" {...form.register('orcamentoPlanejado')} placeholder="0" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="horasEstimadas">Horas Estimadas</Label>
            <Input type="number" min="1" id="horasEstimadas" {...form.register('horasEstimadas')} placeholder="Ex.: 240" />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="tags">Tags <span className="text-xs text-muted-foreground">(separadas por vírgula)</span></Label>
            <Input id="tags" {...form.register('tags')} placeholder="Ex.: mobile, urgente, client-a" />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea rows={4} id="descricao" {...form.register('descricao')} placeholder="Contexto, objectivos e premissas do projecto." />
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
