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
import { criarRiscoAction } from '@/server/actions/projetos.actions';

const Schema = z.object({
  projetoId: z.string().min(1, 'Projecto obrigatório'),
  titulo: z.string().min(1, 'Título obrigatório').max(200),
  descricao: z.string().max(2000).optional(),
  probabilidade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'MUITO_ALTA'], { required_error: 'Probabilidade obrigatória' }),
  impacto: z.enum(['BAIXO', 'MEDIO', 'ALTO', 'MUITO_ALTO'], { required_error: 'Impacto obrigatório' }),
  estrategiaResposta: z.enum(['EVITAR', 'MITIGAR', 'TRANSFERIR', 'ACEITAR'], { required_error: 'Estratégia obrigatória' }),
  planoMitigacao: z.string().max(5000).optional(),
});

type FormValues = z.infer<typeof Schema>;
type ActionState =
  | { ok: true; data: { id: string } }
  | { ok: false; error: { code: string; message: string } }
  | null;

interface Projeto {
  id: string;
  label: string;
}

interface NovoRiscoFormProps {
  projetos: Projeto[];
}

export function NovoRiscoForm({ projetos }: NovoRiscoFormProps) {
  const router = useRouter();

  const [state, dispatch, isPending] = useActionState<ActionState, FormValues>(
    async (_prev, data) => {
      return criarRiscoAction({
        projetoId: data.projetoId,
        titulo: data.titulo,
        descricao: data.descricao || undefined,
        probabilidade: data.probabilidade,
        impacto: data.impacto,
        estrategiaResposta: data.estrategiaResposta,
        planoMitigacao: data.planoMitigacao || undefined,
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
      probabilidade: 'MEDIA',
      impacto: 'MEDIO',
      estrategiaResposta: 'MITIGAR',
    },
  });

  useEffect(() => {
    if (state?.ok) {
      toast.success('Risco criado com sucesso');
      router.push(`/projetos/riscos/${state.data.id}`);
    } else if (state?.ok === false) {
      toast.error(state.error.message);
    }
  }, [state, router]);

  const projetoId = watch('projetoId');

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'A guardar…' : 'Guardar'}
            </Button>
          </>
        }
      >
        <form id="risco-form" onSubmit={handleSubmit((data) => dispatch(data))} className="space-y-6">
          {/* Projecto */}
          <div className="space-y-1.5">
            <Label htmlFor="projetoId">Projecto *</Label>
            <Select
              value={projetoId}
              onValueChange={(v) => setValue('projetoId', v, { shouldDirty: true })}
            >
              <SelectTrigger id="projetoId" aria-invalid={!!errors.projetoId}>
                <SelectValue placeholder="Seleccione um projecto" />
              </SelectTrigger>
              <SelectContent>
                {projetos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.projetoId && (
              <p className="text-xs text-destructive">{errors.projetoId.message}</p>
            )}
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título *</Label>
            <Input
              id="titulo"
              {...register('titulo')}
              placeholder="Ex: Atraso na entrega de componentes críticos"
              aria-invalid={!!errors.titulo}
            />
            {errors.titulo && (
              <p className="text-xs text-destructive">{errors.titulo.message}</p>
            )}
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              {...register('descricao')}
              placeholder="Descreva o risco em detalhe…"
              rows={3}
            />
          </div>

          {/* Probabilidade / Impacto */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="probabilidade">Probabilidade *</Label>
              <Select
                value={watch('probabilidade')}
                onValueChange={(v) => setValue('probabilidade', v as FormValues['probabilidade'], { shouldDirty: true })}
              >
                <SelectTrigger id="probabilidade" aria-invalid={!!errors.probabilidade}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BAIXA">Baixa</SelectItem>
                  <SelectItem value="MEDIA">Média</SelectItem>
                  <SelectItem value="ALTA">Alta</SelectItem>
                  <SelectItem value="MUITO_ALTA">Muito Alta</SelectItem>
                </SelectContent>
              </Select>
              {errors.probabilidade && (
                <p className="text-xs text-destructive">{errors.probabilidade.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="impacto">Impacto *</Label>
              <Select
                value={watch('impacto')}
                onValueChange={(v) => setValue('impacto', v as FormValues['impacto'], { shouldDirty: true })}
              >
                <SelectTrigger id="impacto" aria-invalid={!!errors.impacto}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BAIXO">Baixo</SelectItem>
                  <SelectItem value="MEDIO">Médio</SelectItem>
                  <SelectItem value="ALTO">Alto</SelectItem>
                  <SelectItem value="MUITO_ALTO">Muito Alto</SelectItem>
                </SelectContent>
              </Select>
              {errors.impacto && (
                <p className="text-xs text-destructive">{errors.impacto.message}</p>
              )}
            </div>
          </div>

          {/* Estratégia de Resposta */}
          <div className="space-y-1.5">
            <Label htmlFor="estrategiaResposta">Estratégia de Resposta *</Label>
            <Select
              value={watch('estrategiaResposta')}
              onValueChange={(v) => setValue('estrategiaResposta', v as FormValues['estrategiaResposta'], { shouldDirty: true })}
            >
              <SelectTrigger id="estrategiaResposta" aria-invalid={!!errors.estrategiaResposta}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EVITAR">Evitar — eliminar a ameaça</SelectItem>
                <SelectItem value="MITIGAR">Mitigar — reduzir probabilidade/impacto</SelectItem>
                <SelectItem value="TRANSFERIR">Transferir — seguros/subcontratação</SelectItem>
                <SelectItem value="ACEITAR">Aceitar — monitorizar sem acção</SelectItem>
              </SelectContent>
            </Select>
            {errors.estrategiaResposta && (
              <p className="text-xs text-destructive">{errors.estrategiaResposta.message}</p>
            )}
          </div>

          {/* Plano de Mitigação */}
          <div className="space-y-1.5">
            <Label htmlFor="planoMitigacao">Plano de Mitigação</Label>
            <Textarea
              id="planoMitigacao"
              {...register('planoMitigacao')}
              placeholder="Descreva as acções para mitigar este risco…"
              rows={4}
            />
          </div>
        </form>
      </FormPage>
    </>
  );
}
