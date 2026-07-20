'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import { criarRegistoQualidadeAction } from '@/server/actions/projetos.actions';

const Schema = z.object({
  projetoId: z.string().min(1, 'Projecto obrigatório'),
  tipo: z.enum(['NAO_CONFORMIDADE', 'INSPECAO', 'AUDITORIA', 'REVISAO'], { required_error: 'Tipo obrigatório' }),
  descricao: z.string().min(1, 'Descrição obrigatória').max(5000),
  acaoCorretiva: z.string().max(5000).optional(),
});
type FormValues = z.infer<typeof Schema>;
type ActionState =
  | { ok: true; data: { id: string } }
  | { ok: false; error: { code: string; message: string } }
  | null;

interface NovoQualidadeFormProps {
  projetos: Array<{ id: string; label: string }>;
}

export function NovoQualidadeForm({ projetos }: NovoQualidadeFormProps) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<ActionState, FormValues>(
    async (_prev, data) => {
      return criarRegistoQualidadeAction({
        projetoId: data.projetoId,
        tipo: data.tipo,
        descricao: data.descricao,
        acaoCorretiva: data.acaoCorretiva || undefined,
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
    defaultValues: { tipo: 'NAO_CONFORMIDADE' },
  });

  useEffect(() => {
    if (state?.ok) {
      toast.success('Registo de qualidade criado com sucesso');
      router.push(`/projetos/qualidade/${state.data.id}`);
    } else if (state?.ok === false) {
      toast.error(state.error.message);
    }
  }, [state, router]);

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" form="qualidade-form" disabled={isPending}>
              {isPending ? 'A guardar…' : 'Guardar'}
            </Button>
          </>
        }
      >
        <form id="qualidade-form" onSubmit={handleSubmit((d) => dispatch(d))} className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="projetoId">Projecto *</Label>
            <Select
              value={watch('projetoId')}
              onValueChange={(v) => setValue('projetoId', v, { shouldDirty: true })}
            >
              <SelectTrigger id="projetoId" aria-invalid={!!errors.projetoId}>
                <SelectValue placeholder="Seleccione um projecto" />
              </SelectTrigger>
              <SelectContent>
                {projetos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.projetoId && <p className="text-xs text-destructive">{errors.projetoId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tipo">Tipo *</Label>
            <Select
              value={watch('tipo')}
              onValueChange={(v) => setValue('tipo', v as FormValues['tipo'], { shouldDirty: true })}
            >
              <SelectTrigger id="tipo" aria-invalid={!!errors.tipo}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NAO_CONFORMIDADE">Não Conformidade</SelectItem>
                <SelectItem value="INSPECAO">Inspeção</SelectItem>
                <SelectItem value="AUDITORIA">Auditoria</SelectItem>
                <SelectItem value="REVISAO">Revisão</SelectItem>
              </SelectContent>
            </Select>
            {errors.tipo && <p className="text-xs text-destructive">{errors.tipo.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição *</Label>
            <Textarea
              id="descricao"
              {...register('descricao')}
              rows={4}
              placeholder="Descreva o problema ou o que foi inspeccionado…"
              aria-invalid={!!errors.descricao}
            />
            {errors.descricao && <p className="text-xs text-destructive">{errors.descricao.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="acaoCorretiva">Acção Correctiva</Label>
            <Textarea
              id="acaoCorretiva"
              {...register('acaoCorretiva')}
              rows={3}
              placeholder="Descreva as acções tomadas ou planeadas para correcção…"
            />
          </div>
        </form>
      </FormPage>
    </>
  );
}
