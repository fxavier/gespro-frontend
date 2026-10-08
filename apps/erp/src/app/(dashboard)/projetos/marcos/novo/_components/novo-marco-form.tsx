'use client';

/**
 * Formulário de novo marco (#167). Schema de `CreateMarcoSchema`; submit dentro de
 * `startTransition` (o `handleSubmit` chama fora de uma transição).
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CampoDia, FormPage, FormSection, UnsavedChangesGuard, type ComboboxOption } from '@/components/patterns';
import { CreateMarcoSchema } from '@/lib/validations/projetos';
import { criarMarcoAction } from '@/server/actions/projetos.actions';
import { CampoProjeto } from '../../../_components/campo-projeto';

const FormSchema = CreateMarcoSchema.pick({ descricao: true }).extend({
  projetoId: z.string().min(1, 'Seleccione o projecto'),
  nome: z.string().trim().min(1, 'Nome obrigatório').max(200),
  dataPrevista: z.date({ message: 'Indique a data prevista' }),
});

type Valores = { projetoId: string; nome: string; descricao?: string; dataPrevista: Date };

export function NovoMarcoForm({ opcoesProjeto }: { opcoesProjeto: ComboboxOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<Valores>({
    resolver: zodResolver(FormSchema) as unknown as Resolver<Valores>,
    defaultValues: { projetoId: '', nome: '', descricao: '' },
  });

  const onSubmit = handleSubmit((v) => {
    startTransition(async () => {
      const r = await criarMarcoAction({
        projetoId: v.projetoId,
        nome: v.nome,
        descricao: v.descricao?.trim() || undefined,
        dataPrevista: v.dataPrevista,
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success('Marco criado.');
      router.push('/projetos/marcos');
    });
  });

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty && !isPending} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="ghost" onClick={() => router.push('/projetos/marcos')}>
              Cancelar
            </Button>
            <Button type="button" disabled={isPending} onClick={onSubmit}>
              {isPending ? 'A criar…' : 'Criar marco'}
            </Button>
          </>
        }
      >
        <FormSection title="Marco">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="projetoId">Projecto *</Label>
              <Controller
                control={control}
                name="projetoId"
                render={({ field }) => (
                  <CampoProjeto
                    id="projetoId"
                    opcoesIniciais={opcoesProjeto}
                    value={field.value}
                    onChange={field.onChange}
                    invalido={!!errors.projetoId}
                  />
                )}
              />
              {errors.projetoId && <p className="text-sm text-destructive">{errors.projetoId.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dataPrevista">Data prevista *</Label>
              <Controller
                control={control}
                name="dataPrevista"
                render={({ field }) => (
                  <CampoDia
                    id="dataPrevista"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    aria-invalid={!!errors.dataPrevista}
                  />
                )}
              />
              {errors.dataPrevista && <p className="text-sm text-destructive">Indique a data prevista</p>}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" aria-invalid={!!errors.nome} {...register('nome')} />
              {errors.nome && <p className="text-sm text-destructive">{errors.nome.message}</p>}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea id="descricao" rows={3} {...register('descricao')} />
            </div>
          </div>
        </FormSection>
      </FormPage>
    </>
  );
}
