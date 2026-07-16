'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { criarManutencaoAction } from '@/server/actions/inventario.actions';
import { ManutencaoAtivoCreateSchema, type ManutencaoAtivoCreate } from '@/lib/validations/inventario-ativos';
import type { AtivoDto } from '@/server/services/inventario/ativos.interface';

type FormState =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

interface NovaManutencaoFormProps {
  ativos: Pick<AtivoDto, 'id' | 'nome' | 'codigoInterno'>[];
}

export function NovaManutencaoForm({ ativos }: NovaManutencaoFormProps) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, ManutencaoAtivoCreate>(
    (_prev, input) => criarManutencaoAction(input),
    null
  );

  const form = useForm<ManutencaoAtivoCreate>({
    resolver: zodResolver(ManutencaoAtivoCreateSchema),
    defaultValues: {
      ativoId: '',
      tipo: 'PREVENTIVA',
      prioridade: undefined,
      dataAgendada: new Date(),
      titulo: '',
      descricao: '',
      procedimentos: '',
      custoEstimado: undefined,
      observacoes: '',
      pecas: [],
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (!state) return;
    if (!state.ok) {
      const details = state.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof ManutencaoAtivoCreate, { type: 'server', message: messages[0] });
        });
      } else {
        toast.error(state.error.message ?? 'Ocorreu um erro ao criar a manutenção.');
      }
    } else {
      toast.success('Manutenção criada com sucesso!');
      router.push('/inventario/manutencao');
    }
  }, [state, form, router]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));
  const isDirty = form.formState.isDirty;

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={isDirty} />

      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => router.push('/inventario/manutencao')} disabled={isPending}>
              <X className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A guardar…' : 'Criar Manutenção'}
            </Button>
          </>
        }
      >
        <FormSection title="Informações Básicas" description="Identificação e tipo de manutenção">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="ativoId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ativo *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar ativo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ativos.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.codigoInterno} — {a.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Tipo de manutenção" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="PREVENTIVA">Preventiva</SelectItem>
                      <SelectItem value="CORRETIVA">Corretiva</SelectItem>
                      <SelectItem value="INSPECAO">Inspecção</SelectItem>
                      <SelectItem value="CALIBRACAO">Calibração</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="titulo"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Título *</FormLabel>
                  <FormControl>
                    <Input placeholder="Título da manutenção" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Descrição *</FormLabel>
                  <FormControl>
                    <Textarea
                      className="resize-none"
                      placeholder="Descreva os trabalhos a realizar…"
                      rows={3}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection title="Agendamento e Prioridade" description="Datas e nível de urgência">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="prioridade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prioridade</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar prioridade" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="BAIXA">Baixa</SelectItem>
                      <SelectItem value="MEDIA">Média</SelectItem>
                      <SelectItem value="ALTA">Alta</SelectItem>
                      <SelectItem value="CRITICA">Crítica</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dataAgendada"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data Agendada *</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                      onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="custoEstimado"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Custo Estimado (MT)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="tabular-nums"
                      placeholder="0.00"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      className="resize-none"
                      placeholder="Observações adicionais…"
                      rows={2}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        {state && !state.ok && !state.error.details && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {state.error.message}
          </div>
        )}
      </FormPage>
    </Form>
  );
}
