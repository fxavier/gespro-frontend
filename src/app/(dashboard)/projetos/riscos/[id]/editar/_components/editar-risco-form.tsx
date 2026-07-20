'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
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
import { actualizarRiscoAction } from '@/server/actions/projetos.actions';

const Schema = z.object({
  titulo: z.string().min(1, 'Título obrigatório').max(200),
  descricao: z.string().max(2000).optional(),
  probabilidade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'MUITO_ALTA']),
  impacto: z.enum(['BAIXO', 'MEDIO', 'ALTO', 'MUITO_ALTO']),
  estrategiaResposta: z.enum(['EVITAR', 'MITIGAR', 'TRANSFERIR', 'ACEITAR']),
  planoMitigacao: z.string().max(5000).optional(),
});
type FormValues = z.infer<typeof Schema>;
type ActionState =
  | { ok: true; data: void }
  | { ok: false; error: { code: string; message: string } }
  | null;

interface EditarRiscoFormProps {
  id: string;
  risco: {
    projetoId: string;
    titulo: string;
    descricao?: string;
    probabilidade: string;
    impacto: string;
    estrategiaResposta: string;
    planoMitigacao?: string;
  };
  projetos: Array<{ id: string; label: string }>;
}

export function EditarRiscoForm({ id, risco }: EditarRiscoFormProps) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<ActionState, FormValues>(
    async (_prev, data) => {
      return actualizarRiscoAction({
        id,
        data: {
          titulo: data.titulo,
          descricao: data.descricao || undefined,
          probabilidade: data.probabilidade,
          impacto: data.impacto,
          estrategiaResposta: data.estrategiaResposta,
          planoMitigacao: data.planoMitigacao || undefined,
        },
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
      titulo: risco.titulo,
      descricao: risco.descricao ?? '',
      probabilidade: risco.probabilidade as FormValues['probabilidade'],
      impacto: risco.impacto as FormValues['impacto'],
      estrategiaResposta: risco.estrategiaResposta as FormValues['estrategiaResposta'],
      planoMitigacao: risco.planoMitigacao ?? '',
    },
  });

  useEffect(() => {
    if (state?.ok) {
      toast.success('Risco actualizado com sucesso');
      router.push(`/projetos/riscos/${id}`);
    } else if (state?.ok === false) {
      toast.error(state.error.message);
    }
  }, [state, router, id]);

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" form="editar-risco-form" disabled={isPending}>
              {isPending ? 'A guardar…' : 'Guardar'}
            </Button>
          </>
        }
      >
        <form id="editar-risco-form" onSubmit={handleSubmit((data) => dispatch(data))} className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título *</Label>
            <Input id="titulo" {...register('titulo')} aria-invalid={!!errors.titulo} />
            {errors.titulo && <p className="text-xs text-destructive">{errors.titulo.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea id="descricao" {...register('descricao')} rows={3} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="probabilidade">Probabilidade *</Label>
              <Select
                value={watch('probabilidade')}
                onValueChange={(v) => setValue('probabilidade', v as FormValues['probabilidade'], { shouldDirty: true })}
              >
                <SelectTrigger id="probabilidade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BAIXA">Baixa</SelectItem>
                  <SelectItem value="MEDIA">Média</SelectItem>
                  <SelectItem value="ALTA">Alta</SelectItem>
                  <SelectItem value="MUITO_ALTA">Muito Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="impacto">Impacto *</Label>
              <Select
                value={watch('impacto')}
                onValueChange={(v) => setValue('impacto', v as FormValues['impacto'], { shouldDirty: true })}
              >
                <SelectTrigger id="impacto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BAIXO">Baixo</SelectItem>
                  <SelectItem value="MEDIO">Médio</SelectItem>
                  <SelectItem value="ALTO">Alto</SelectItem>
                  <SelectItem value="MUITO_ALTO">Muito Alto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="estrategiaResposta">Estratégia de Resposta *</Label>
            <Select
              value={watch('estrategiaResposta')}
              onValueChange={(v) => setValue('estrategiaResposta', v as FormValues['estrategiaResposta'], { shouldDirty: true })}
            >
              <SelectTrigger id="estrategiaResposta">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EVITAR">Evitar</SelectItem>
                <SelectItem value="MITIGAR">Mitigar</SelectItem>
                <SelectItem value="TRANSFERIR">Transferir</SelectItem>
                <SelectItem value="ACEITAR">Aceitar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="planoMitigacao">Plano de Mitigação</Label>
            <Textarea id="planoMitigacao" {...register('planoMitigacao')} rows={4} />
          </div>
        </form>
      </FormPage>
    </>
  );
}
