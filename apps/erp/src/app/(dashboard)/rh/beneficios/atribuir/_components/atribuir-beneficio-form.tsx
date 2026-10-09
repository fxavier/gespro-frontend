'use client';

/**
 * Formulário de atribuição de benefício a colaborador — CLIENT COMPONENT.
 */

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { atribuirBeneficioAction } from '@/server/actions/beneficios.actions';
import { Button } from '@/components/ui/button';
import { Combobox, FormPage, FormSection } from '@/components/patterns';
import type { ComboboxOption } from '@/components/patterns';
import { CampoColaborador } from '../../../_components/campo-colaborador';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const FormSchema = z.object({
  beneficioId: z.string().min(1, 'Benefício é obrigatório'),
  colaboradorId: z.string().min(1, 'Colaborador é obrigatório'),
  dataInicio: z.string().min(1, 'Data de início é obrigatória'),
  dataFim: z.string().optional(),
  comparticipacaoEmpresa: z.string().optional(),
  descontoColaborador: z.string().optional(),
  observacoes: z.string().max(500).optional(),
});

type FormValues = z.infer<typeof FormSchema>;

interface AtribuirBeneficioFormProps {
  beneficioIdPreenchido?: string;
  beneficioNome?: string;
  opcoesBeneficio: ComboboxOption[];
  opcoesColaborador: ComboboxOption[];
}

export function AtribuirBeneficioForm({
  beneficioIdPreenchido,
  beneficioNome,
  opcoesBeneficio,
  opcoesColaborador,
}: AtribuirBeneficioFormProps) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      beneficioId: beneficioIdPreenchido ?? '',
      colaboradorId: '',
    },
  });

  const [, formAction] = useActionState(
    async (_prev: unknown, data: FormData) => {
      const values = Object.fromEntries(data.entries());

      const result = await atribuirBeneficioAction({
        beneficioId: values.beneficioId as string,
        colaboradorId: values.colaboradorId as string,
        dataInicio: new Date(values.dataInicio as string),
        dataFim: values.dataFim ? new Date(values.dataFim as string) : undefined,
        comparticipacaoEmpresa: (values.comparticipacaoEmpresa as string) || undefined,
        descontoColaborador: (values.descontoColaborador as string) || undefined,
        observacoes: (values.observacoes as string) || undefined,
      });

      if (result.ok) {
        toast.success('Benefício atribuído com sucesso');
        const destino = beneficioIdPreenchido
          ? `/rh/beneficios/${beneficioIdPreenchido}`
          : '/rh/beneficios';
        router.push(destino);
      } else {
        toast.error(result.error.message);
      }
      return result;
    },
    null,
  );

  const onSubmit = handleSubmit(async (data) => {
    const formData = new FormData();
    Object.entries(data).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') formData.append(k, String(v));
    });
    await formAction(formData);
  });

  return (
    <form onSubmit={onSubmit}>
      <FormPage
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                router.push(beneficioIdPreenchido ? `/rh/beneficios/${beneficioIdPreenchido}` : '/rh/beneficios')
              }
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'A atribuir…' : 'Atribuir Benefício'}
            </Button>
          </>
        }
      >
      <FormSection title="Atribuição">
      {/* Benefício */}
      <div className="space-y-2">
        <Label htmlFor="beneficioId">Benefício *</Label>
        {beneficioIdPreenchido && beneficioNome ? (
          <>
            <Input id="beneficioId" value={beneficioNome} readOnly className="bg-muted" />
            <input type="hidden" {...register('beneficioId')} value={beneficioIdPreenchido} />
          </>
        ) : (
          <Controller
            control={control}
            name="beneficioId"
            render={({ field }) => (
              <Combobox
                id="beneficioId"
                options={opcoesBeneficio}
                value={field.value}
                onChange={field.onChange}
                pesquisaAPartirDe={0}
                placeholder="Seleccione o benefício"
                searchPlaceholder="Pesquisar benefício…"
                emptyText="Nenhum benefício activo encontrado."
              />
            )}
          />
        )}
        {errors.beneficioId && (
          <p className="text-destructive text-sm">{errors.beneficioId.message}</p>
        )}
      </div>

      {/* Colaborador */}
      <Controller
        control={control}
        name="colaboradorId"
        render={({ field }) => (
          <CampoColaborador
            opcoesIniciais={opcoesColaborador}
            value={field.value}
            onChange={field.onChange}
            erro={errors.colaboradorId?.message}
          />
        )}
      />

      {/* Datas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="dataInicio">Data de Início *</Label>
          <Input id="dataInicio" type="date" {...register('dataInicio')} />
          {errors.dataInicio && (
            <p className="text-destructive text-sm">{errors.dataInicio.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="dataFim">Data de Fim (opcional)</Label>
          <Input id="dataFim" type="date" {...register('dataFim')} />
        </div>
      </div>

      {/* Valores personalizados */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="comparticipacaoEmpresa">Comparticipação Empresa (MZN)</Label>
          <Input
            id="comparticipacaoEmpresa"
            type="number"
            step="0.01"
            min="0"
            {...register('comparticipacaoEmpresa')}
            placeholder="Herda do benefício"
          />
          <p className="text-xs text-muted-foreground">Deixar em branco para herdar do benefício.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="descontoColaborador">Desconto Colaborador (MZN)</Label>
          <Input
            id="descontoColaborador"
            type="number"
            step="0.01"
            min="0"
            {...register('descontoColaborador')}
            placeholder="Herda do benefício"
          />
          <p className="text-xs text-muted-foreground">Deixar em branco para herdar do benefício.</p>
        </div>
      </div>

      {/* Observações */}
      <div className="space-y-2">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea
          id="observacoes"
          {...register('observacoes')}
          rows={2}
          placeholder="Notas sobre esta atribuição…"
        />
      </div>

      </FormSection>
      </FormPage>
    </form>
  );
}
