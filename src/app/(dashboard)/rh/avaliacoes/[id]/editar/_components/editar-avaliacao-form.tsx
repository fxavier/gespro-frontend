'use client';

/**
 * Formulário de edição de Avaliação — CLIENT COMPONENT.
 * Actualiza critérios, pontos e plano de acção via Server Action.
 * Padrão: useActionState + FormPage(actions=…) + UnsavedChangesGuard standalone.
 */

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Trash2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormPage, UnsavedChangesGuard } from '@/components/patterns';
import { actualizarAvaliacaoAction } from '@/server/actions/rh.actions';

const CriterioSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').max(100),
  descricao: z.string().max(500).default(''),
  peso: z.coerce.number().min(0).max(100),
  nota: z.coerce.number().min(0).max(10),
  comentario: z.string().max(1000).optional(),
});

const Schema = z.object({
  criterios: z.array(CriterioSchema).min(1, 'Adicione pelo menos um critério'),
  pontosFortes: z.string().max(2000).optional(),
  pontosDesenvolvimento: z.string().max(2000).optional(),
  planoAcao: z.string().max(2000).optional(),
  comentarios: z.string().max(2000).optional(),
});

type FormValues = z.infer<typeof Schema>;

// ActionResult inline (evita importar server-only num CC)
type ActionState = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string; details?: unknown } } | null;

interface CriterioInit {
  nome: string;
  descricao: string;
  peso: string | number;
  nota: string | number;
  comentario?: string | null;
}

interface Props {
  id: string;
  defaultValues: {
    criterios: CriterioInit[];
    pontosFortes: string[];
    pontosDesenvolvimento: string[];
    planoAcao: string[];
    comentarios?: string | null;
  };
}

export function EditarAvaliacaoForm({ id, defaultValues }: Props) {
  const router = useRouter();

  const [state, dispatch, isPending] = useActionState<ActionState, FormValues>(
    async (_prev, data) => {
      return actualizarAvaliacaoAction({
        id,
        data: {
          criterios: data.criterios.map((c) => ({
            nome: c.nome,
            descricao: c.descricao ?? '',
            peso: c.peso,
            nota: c.nota,
            comentario: c.comentario || undefined,
          })),
          pontosFortes: (data.pontosFortes ?? '')
            .split('\n').map((s) => s.trim()).filter(Boolean),
          pontosDesenvolvimento: (data.pontosDesenvolvimento ?? '')
            .split('\n').map((s) => s.trim()).filter(Boolean),
          planoAcao: (data.planoAcao ?? '')
            .split('\n').map((s) => s.trim()).filter(Boolean),
          comentarios: data.comentarios || undefined,
        },
      });
    },
    null
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      criterios: defaultValues.criterios.map((c) => ({
        nome: c.nome,
        descricao: c.descricao ?? '',
        peso: Number(c.peso),
        nota: Number(c.nota),
        comentario: c.comentario ?? '',
      })),
      pontosFortes: defaultValues.pontosFortes.join('\n'),
      pontosDesenvolvimento: defaultValues.pontosDesenvolvimento.join('\n'),
      planoAcao: defaultValues.planoAcao.join('\n'),
      comentarios: defaultValues.comentarios ?? '',
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'criterios' });
  const isDirty = form.formState.isDirty;

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
      toast.success('Avaliação actualizada com sucesso.');
      router.push(`/rh/avaliacoes/${id}`);
      router.refresh();
    }
  }, [state, form, router, id]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));

  const handleCancel = () => {
    if (isDirty) {
      if (!window.confirm('Tem alterações não guardadas. Tem a certeza que pretende sair?')) return;
    }
    router.push(`/rh/avaliacoes/${id}`);
  };

  const errors = form.formState.errors;

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
        <div className="space-y-6 px-6">
          {/* Critérios */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Critérios de Avaliação</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ nome: '', descricao: '', peso: 10, nota: 5 })}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adicionar
              </Button>
            </div>
            {errors.criterios && (
              <p className="text-xs text-destructive">{errors.criterios.message}</p>
            )}
            {fields.map((field, idx) => (
              <div key={field.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Critério {idx + 1}</p>
                  {fields.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => remove(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome <span className="text-destructive">*</span></Label>
                    <Input {...form.register(`criterios.${idx}.nome`)} placeholder="Ex.: Qualidade do trabalho" />
                    {errors.criterios?.[idx]?.nome && (
                      <p className="text-xs text-destructive">{errors.criterios[idx]?.nome?.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Descrição</Label>
                    <Input {...form.register(`criterios.${idx}.descricao`)} placeholder="Descrição breve" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nota (0–10) <span className="text-destructive">*</span></Label>
                    <Input type="number" min="0" max="10" step="0.1" {...form.register(`criterios.${idx}.nota`)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Peso (%) <span className="text-destructive">*</span></Label>
                    <Input type="number" min="0" max="100" {...form.register(`criterios.${idx}.peso`)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Comentário</Label>
                  <Textarea rows={2} {...form.register(`criterios.${idx}.comentario`)} placeholder="Observações sobre este critério" />
                </div>
              </div>
            ))}
          </div>

          {/* Pontos fortes */}
          <div className="space-y-1.5">
            <Label>Pontos Fortes <span className="text-xs text-muted-foreground">(um por linha)</span></Label>
            <Textarea rows={3} {...form.register('pontosFortes')} placeholder="Liste os pontos fortes (um por linha)" />
          </div>

          {/* Pontos a desenvolver */}
          <div className="space-y-1.5">
            <Label>Pontos a Desenvolver <span className="text-xs text-muted-foreground">(um por linha)</span></Label>
            <Textarea rows={3} {...form.register('pontosDesenvolvimento')} placeholder="Liste os pontos a melhorar (um por linha)" />
          </div>

          {/* Plano de acção */}
          <div className="space-y-1.5">
            <Label>Plano de Acção <span className="text-xs text-muted-foreground">(um por linha)</span></Label>
            <Textarea rows={3} {...form.register('planoAcao')} placeholder="Acções concretas a tomar (uma por linha)" />
          </div>

          {/* Comentários gerais */}
          <div className="space-y-1.5">
            <Label>Comentários Gerais</Label>
            <Textarea rows={4} {...form.register('comentarios')} placeholder="Observações adicionais" />
          </div>
        </div>
      </FormPage>
    </>
  );
}
