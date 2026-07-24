'use client';

import { useTransition } from 'react';
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
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { registarAusenciaAction } from '@/server/actions/rh.actions';

const TIPOS = [
  { value: 'FALTA', label: 'Falta' },
  { value: 'ATESTADO_MEDICO', label: 'Atestado Médico' },
  { value: 'LICENCA_MATERNIDADE', label: 'Licença de Maternidade' },
  { value: 'LICENCA_PATERNIDADE', label: 'Licença de Paternidade' },
  { value: 'LICENCA_SEM_VENCIMENTO', label: 'Licença sem Vencimento' },
  { value: 'LICENCA_NOJO', label: 'Licença por Nojo' },
  { value: 'LICENCA_CASAMENTO', label: 'Licença por Casamento' },
  { value: 'OUTRO', label: 'Outro' },
] as const;

const FormSchema = z
  .object({
    colaboradorId: z.string().min(1, 'Colaborador obrigatório'),
    tipo: z.enum([
      'FALTA', 'ATESTADO_MEDICO', 'LICENCA_MATERNIDADE', 'LICENCA_PATERNIDADE',
      'LICENCA_SEM_VENCIMENTO', 'LICENCA_NOJO', 'LICENCA_CASAMENTO', 'OUTRO',
    ]),
    dataInicio: z.string().min(1, 'Data de início obrigatória'),
    dataFim: z.string().min(1, 'Data de fim obrigatória'),
    justificada: z.boolean().default(false),
    justificativa: z.string().max(1000).optional(),
    observacoes: z.string().max(1000).optional(),
  })
  .refine((d) => d.dataFim >= d.dataInicio, {
    message: 'Data de fim não pode ser anterior à data de início',
    path: ['dataFim'],
  });
type FormValues = z.infer<typeof FormSchema>;

export function NovaAusenciaForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      colaboradorId: '',
      tipo: 'FALTA',
      dataInicio: '',
      dataFim: '',
      justificada: false,
      justificativa: '',
      observacoes: '',
    },
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await registarAusenciaAction({
        colaboradorId: values.colaboradorId,
        tipo: values.tipo,
        dataInicio: values.dataInicio,
        dataFim: values.dataFim,
        justificada: values.justificada,
        justificativa: values.justificativa || undefined,
        observacoes: values.observacoes || undefined,
      } as never);
      if (result?.ok) {
        toast.success('Ausência registada com sucesso.');
        router.push('/rh/ausencias');
      } else {
        toast.error(result?.error?.message ?? 'Erro ao registar ausência.');
      }
    });
  });

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="ghost" onClick={() => router.push('/rh/ausencias')}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button type="button" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-2" />
              {isPending ? 'A registar…' : 'Registar Ausência'}
            </Button>
          </>
        }
      >
        <FormSection title="Ausência" description="Colaborador, tipo e período da ausência">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="colaboradorId">ID do Colaborador *</Label>
              <Input id="colaboradorId" {...register('colaboradorId')} placeholder="ID do colaborador (CUID)" />
              {errors.colaboradorId && (
                <p className="text-sm text-destructive">{errors.colaboradorId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo *</Label>
              <Select value={watch('tipo')} onValueChange={(v) => setValue('tipo', v as FormValues['tipo'])}>
                <SelectTrigger id="tipo" aria-label="Tipo de ausência">
                  <SelectValue placeholder="Seleccione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.tipo && <p className="text-sm text-destructive">{errors.tipo.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dataInicio">Data de Início *</Label>
              <Input id="dataInicio" type="date" {...register('dataInicio')} />
              {errors.dataInicio && <p className="text-sm text-destructive">{errors.dataInicio.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataFim">Data de Fim *</Label>
              <Input id="dataFim" type="date" {...register('dataFim')} />
              {errors.dataFim && <p className="text-sm text-destructive">{errors.dataFim.message}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="justificada"
              checked={watch('justificada')}
              onCheckedChange={(v) => setValue('justificada', v)}
            />
            <Label htmlFor="justificada">Justificada</Label>
          </div>
        </FormSection>

        <FormSection title="Detalhes" description="Justificativa e observações (opcional)">
          <div className="space-y-2">
            <Label htmlFor="justificativa">Justificativa</Label>
            <Textarea id="justificativa" {...register('justificativa')} placeholder="Justificativa (opcional)" rows={3} />
            {errors.justificativa && <p className="text-sm text-destructive">{errors.justificativa.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea id="observacoes" {...register('observacoes')} placeholder="Observações (opcional)" rows={3} />
            {errors.observacoes && <p className="text-sm text-destructive">{errors.observacoes.message}</p>}
          </div>
        </FormSection>
      </FormPage>
    </>
  );
}
