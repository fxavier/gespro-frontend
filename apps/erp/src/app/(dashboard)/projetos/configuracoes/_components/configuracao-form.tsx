'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormPage, UnsavedChangesGuard } from '@/components/patterns';
import { actualizarConfiguracaoProjetoAction } from '@/server/actions/projetos.actions';

const TIPOS_TAREFA = [
  { value: 'TAREFA', label: 'Tarefa' },
  { value: 'BUG', label: 'Bug' },
  { value: 'MELHORIA', label: 'Melhoria' },
  { value: 'DOCUMENTACAO', label: 'Documentação' },
  { value: 'TESTE', label: 'Teste' },
];

const Schema = z.object({
  politicaAprovacaoTimesheet: z.enum(['MANUAL', 'AUTOMATICA']),
  tiposTarefaAtivos: z.array(z.string()).min(1, 'Seleccione pelo menos um tipo de tarefa'),
  observacoes: z.string().max(2000).optional(),
});
type FormValues = z.infer<typeof Schema>;
type ActionState =
  | { ok: true; data: void }
  | { ok: false; error: { code: string; message: string } }
  | null;

interface ConfiguracaoFormProps {
  projetoId: string;
  configuracao: {
    politicaAprovacaoTimesheet: string;
    tiposTarefaAtivos: string[];
    observacoes: string | null;
  };
}

export function ConfiguracaoForm({ projetoId, configuracao }: ConfiguracaoFormProps) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<ActionState, FormValues>(
    async (_prev, data) => {
      return actualizarConfiguracaoProjetoAction({
        projetoId,
        politicaAprovacaoTimesheet: data.politicaAprovacaoTimesheet,
        tiposTarefaAtivos: data.tiposTarefaAtivos as ('TAREFA' | 'BUG' | 'MELHORIA' | 'DOCUMENTACAO' | 'TESTE')[],
        observacoes: data.observacoes || undefined,
      }) as Promise<ActionState>;
    },
    null,
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      politicaAprovacaoTimesheet: (configuracao.politicaAprovacaoTimesheet as 'MANUAL' | 'AUTOMATICA') ?? 'MANUAL',
      tiposTarefaAtivos: configuracao.tiposTarefaAtivos,
      observacoes: configuracao.observacoes ?? '',
    },
  });

  useEffect(() => {
    if (state?.ok) {
      toast.success('Configurações guardadas com sucesso');
    } else if (state?.ok === false) {
      toast.error(state.error.message);
    }
  }, [state]);

  const tiposTarefaAtivos = watch('tiposTarefaAtivos');

  function toggleTipo(value: string) {
    const current = tiposTarefaAtivos ?? [];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setValue('tiposTarefaAtivos', updated, { shouldDirty: true });
  }

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty} />
      <FormPage
        actions={
          <Button type="submit" form="config-form" disabled={isPending}>
            {isPending ? 'A guardar…' : 'Guardar Configurações'}
          </Button>
        }
      >
        <form id="config-form" onSubmit={handleSubmit((d) => dispatch(d))} className="space-y-6">
          {/* Política de aprovação */}
          <div className="space-y-1.5">
            <Label htmlFor="politicaAprovacaoTimesheet">Política de Aprovação de Timesheet</Label>
            <Select
              value={watch('politicaAprovacaoTimesheet')}
              onValueChange={(v) => setValue('politicaAprovacaoTimesheet', v as 'MANUAL' | 'AUTOMATICA', { shouldDirty: true })}
            >
              <SelectTrigger id="politicaAprovacaoTimesheet">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MANUAL">Manual — o gestor aprova cada registo</SelectItem>
                <SelectItem value="AUTOMATICA">Automática — aprovação sem intervenção</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tipos de tarefa activos */}
          <div className="space-y-2">
            <Label>Tipos de Tarefa Activos</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TIPOS_TAREFA.map((t) => (
                <label key={t.value} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={(tiposTarefaAtivos ?? []).includes(t.value)}
                    onCheckedChange={() => toggleTipo(t.value)}
                  />
                  <span className="text-sm">{t.label}</span>
                </label>
              ))}
            </div>
            {errors.tiposTarefaAtivos && (
              <p className="text-xs text-destructive">{errors.tiposTarefaAtivos.message}</p>
            )}
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              {...register('observacoes')}
              rows={3}
              placeholder="Notas adicionais sobre as configurações deste projecto…"
            />
          </div>
        </form>
      </FormPage>
    </>
  );
}
