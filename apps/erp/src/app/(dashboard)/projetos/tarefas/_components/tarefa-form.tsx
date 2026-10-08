'use client';

/**
 * Formulário de tarefa (#167) — criar (`/projetos/tarefas/novo`) e editar
 * (`/projetos/tarefas/<id>/editar`). Schemas de `@/lib/validations/projetos`; submit dentro de
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CampoDia, FormPage, FormSection, UnsavedChangesGuard, type ComboboxOption } from '@/components/patterns';
import { CreateTarefaSchema, UpdateTarefaSchema } from '@/lib/validations/projetos';
import { actualizarTarefaAction, criarTarefaAction } from '@/server/actions/projetos.actions';
import { CampoProjeto } from '../../_components/campo-projeto';

const PRIORIDADES = [
  { value: 'BAIXA', label: 'Baixa' },
  { value: 'MEDIA', label: 'Média' },
  { value: 'ALTA', label: 'Alta' },
  { value: 'CRITICA', label: 'Crítica' },
] as const;

type Prioridade = (typeof PRIORIDADES)[number]['value'];

const EdicaoSchema = UpdateTarefaSchema.pick({ titulo: true, descricao: true, prioridade: true }).extend({
  titulo: z.string().trim().min(1, 'Título obrigatório').max(200),
  dataFimPrevista: z.date({ message: 'Indique o prazo' }),
});

const CriacaoSchema = CreateTarefaSchema.pick({ descricao: true, prioridade: true }).extend({
  projetoId: z.string().min(1, 'Seleccione o projecto'),
  codigo: z.string().trim().min(1, 'Código obrigatório').max(20),
  titulo: z.string().trim().min(1, 'Título obrigatório').max(200),
  dataFimPrevista: z.date({ message: 'Indique o prazo' }),
});

type Valores = {
  projetoId: string;
  codigo: string;
  titulo: string;
  descricao?: string;
  prioridade?: Prioridade;
  dataFimPrevista: Date;
};

interface Props {
  /** Ausente ⇒ criar. */
  tarefa?: {
    id: string;
    codigo: string;
    titulo: string;
    descricao: string | null;
    prioridade: Prioridade;
    dataFimPrevista: Date;
    projetoLabel: string;
  };
  opcoesProjeto?: ComboboxOption[];
}

export function TarefaForm({ tarefa, opcoesProjeto = [] }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const edicao = Boolean(tarefa);
  const voltar = tarefa ? `/projetos/tarefas/${tarefa.id}` : '/projetos/tarefas';

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<Valores>({
    resolver: zodResolver(edicao ? EdicaoSchema : CriacaoSchema) as unknown as Resolver<Valores>,
    defaultValues: {
      projetoId: '',
      codigo: tarefa?.codigo ?? '',
      titulo: tarefa?.titulo ?? '',
      descricao: tarefa?.descricao ?? '',
      prioridade: tarefa?.prioridade ?? 'MEDIA',
      dataFimPrevista: tarefa?.dataFimPrevista,
    },
  });

  const onSubmit = handleSubmit((v) => {
    startTransition(async () => {
      const comum = {
        titulo: v.titulo,
        descricao: v.descricao?.trim() || undefined,
        prioridade: v.prioridade,
        dataFimPrevista: v.dataFimPrevista,
      };
      if (tarefa) {
        const r = await actualizarTarefaAction({ id: tarefa.id, data: comum });
        if (!r.ok) {
          toast.error(r.error.message);
          return;
        }
        toast.success('Tarefa actualizada.');
        router.push(`/projetos/tarefas/${tarefa.id}`);
        return;
      }
      const r = await criarTarefaAction({ ...comum, projetoId: v.projetoId, codigo: v.codigo });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success('Tarefa criada.');
      router.push(`/projetos/tarefas/${r.data.id}`);
    });
  });

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty && !isPending} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="ghost" onClick={() => router.push(voltar)}>
              Cancelar
            </Button>
            <Button type="button" disabled={isPending} onClick={onSubmit}>
              {edicao ? (isPending ? 'A guardar…' : 'Guardar') : isPending ? 'A criar…' : 'Criar tarefa'}
            </Button>
          </>
        }
      >
        <FormSection title="Tarefa">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="projetoId">Projecto *</Label>
              {tarefa ? (
                <p id="projetoId" className="text-sm py-2">{tarefa.projetoLabel}</p>
              ) : (
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
              )}
              {errors.projetoId && <p className="text-sm text-destructive">{errors.projetoId.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="codigo">Código *</Label>
              <Input id="codigo" disabled={edicao} aria-invalid={!!errors.codigo} {...register('codigo')} />
              {errors.codigo && <p className="text-sm text-destructive">{errors.codigo.message}</p>}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="titulo">Título *</Label>
              <Input id="titulo" aria-invalid={!!errors.titulo} {...register('titulo')} />
              {errors.titulo && <p className="text-sm text-destructive">{errors.titulo.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dataFimPrevista">Prazo *</Label>
              <Controller
                control={control}
                name="dataFimPrevista"
                render={({ field }) => (
                  <CampoDia
                    id="dataFimPrevista"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    aria-invalid={!!errors.dataFimPrevista}
                  />
                )}
              />
              {errors.dataFimPrevista && <p className="text-sm text-destructive">Indique o prazo</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="prioridade">Prioridade</Label>
              <Controller
                control={control}
                name="prioridade"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="prioridade">
                      <SelectValue placeholder="Seleccione">
                        {PRIORIDADES.find((p) => p.value === field.value)?.label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORIDADES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea id="descricao" rows={4} {...register('descricao')} />
            </div>
          </div>
        </FormSection>
      </FormPage>
    </>
  );
}
