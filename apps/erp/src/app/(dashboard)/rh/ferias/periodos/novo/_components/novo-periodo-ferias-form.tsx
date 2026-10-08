'use client';

import { useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CampoDia,
  ComboboxRemoto,
  FormPage,
  FormSection,
  UnsavedChangesGuard,
} from '@/components/patterns';
import type { ComboboxOption } from '@/components/patterns';
import { CreateFeriasSchema, type CreateFeriasInput } from '@/lib/validations/rh';
import { iniciarPeriodoFeriasAction, listarColaboradoresAction } from '@/server/actions/rh.actions';

export function NovoPeriodoFeriasForm({ opcoesIniciais }: { opcoesIniciais: ComboboxOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<CreateFeriasInput>({
    resolver: zodResolver(CreateFeriasSchema) as unknown as Resolver<CreateFeriasInput>,
    defaultValues: { colaboradorId: '' },
  });

  const procurar = useCallback(async (q: string): Promise<ComboboxOption[] | null> => {
    const r = await listarColaboradoresAction({ search: q, take: 25 });
    return r.ok ? r.data.items.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` })) : null;
  }, []);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const r = await iniciarPeriodoFeriasAction(values);
      if (r.ok) {
        toast.success('Período aquisitivo iniciado.');
        router.push('/rh/ferias');
      } else {
        toast.error(r.error.message);
      }
    });
  });

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty && !isPending} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="ghost" onClick={() => router.push('/rh/ferias')}>
              Cancelar
            </Button>
            <Button type="button" disabled={isPending} onClick={onSubmit}>
              {isPending ? 'A iniciar…' : 'Iniciar período'}
            </Button>
          </>
        }
      >
        <FormSection title="Período aquisitivo" description="Os dias usados começam a zero">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="colaboradorId">Colaborador *</Label>
              <Controller
                control={control}
                name="colaboradorId"
                render={({ field }) => (
                  <ComboboxRemoto
                    id="colaboradorId"
                    opcoesIniciais={opcoesIniciais}
                    procurar={procurar}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Seleccione o colaborador"
                    searchPlaceholder="Pesquisar por código ou nome…"
                    emptyText="Nenhum colaborador encontrado."
                  />
                )}
              />
              {errors.colaboradorId && (
                <p className="text-sm text-destructive">{errors.colaboradorId.message}</p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="periodoAquisitivoInicio">Início *</Label>
                <Controller
                  control={control}
                  name="periodoAquisitivoInicio"
                  render={({ field }) => (
                    <CampoDia
                      id="periodoAquisitivoInicio"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  )}
                />
                {errors.periodoAquisitivoInicio && (
                  <p className="text-sm text-destructive">Indique a data de início</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="periodoAquisitivoFim">Fim *</Label>
                <Controller
                  control={control}
                  name="periodoAquisitivoFim"
                  render={({ field }) => (
                    <CampoDia
                      id="periodoAquisitivoFim"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  )}
                />
                {errors.periodoAquisitivoFim && (
                  <p className="text-sm text-destructive">
                    {errors.periodoAquisitivoFim.type === 'custom'
                      ? errors.periodoAquisitivoFim.message
                      : 'Indique a data de fim'}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="diasDisponiveis">Dias de férias *</Label>
                <Input
                  id="diasDisponiveis"
                  type="number"
                  min={1}
                  {...register('diasDisponiveis', { valueAsNumber: true })}
                />
                {errors.diasDisponiveis && (
                  <p className="text-sm text-destructive">Indique os dias de férias do período</p>
                )}
              </div>
            </div>
          </div>
        </FormSection>
      </FormPage>
    </>
  );
}
