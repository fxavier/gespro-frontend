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
import { registarComunicacaoAction } from '@/server/actions/projetos.actions';

const Schema = z.object({
  projetoId: z.string().min(1, 'Projecto obrigatório'),
  tipo: z.enum(['REUNIAO', 'ATA', 'DECISAO', 'ANUNCIO', 'RELATORIO'], { required_error: 'Tipo obrigatório' }),
  data: z.string().min(1, 'Data obrigatória'),
  participantes: z.string().min(1, 'Indique pelo menos um participante'),
  resumo: z.string().min(1, 'Resumo obrigatório').max(10000),
});
type FormValues = z.infer<typeof Schema>;
type ActionState =
  | { ok: true; data: { id: string } }
  | { ok: false; error: { code: string; message: string } }
  | null;

interface NovaComunicacaoFormProps {
  projetos: Array<{ id: string; label: string }>;
}

const today = new Date().toISOString().slice(0, 10);

export function NovaComunicacaoForm({ projetos }: NovaComunicacaoFormProps) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<ActionState, FormValues>(
    async (_prev, data) => {
      const participantes = data.participantes.split('\n').map((s) => s.trim()).filter(Boolean);
      return registarComunicacaoAction({
        projetoId: data.projetoId,
        tipo: data.tipo,
        data: new Date(data.data),
        participantes,
        resumo: data.resumo,
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
    defaultValues: { tipo: 'REUNIAO', data: today },
  });

  useEffect(() => {
    if (state?.ok) {
      toast.success('Comunicação registada com sucesso');
      router.push(`/projetos/comunicacoes/${state.data.id}`);
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
            <Button type="submit" form="comunicacao-form" disabled={isPending}>
              {isPending ? 'A guardar…' : 'Guardar'}
            </Button>
          </>
        }
      >
        <form id="comunicacao-form" onSubmit={handleSubmit((d) => dispatch(d))} className="space-y-6">
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

          <div className="grid sm:grid-cols-2 gap-4">
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
                  <SelectItem value="REUNIAO">Reunião</SelectItem>
                  <SelectItem value="ATA">Ata</SelectItem>
                  <SelectItem value="DECISAO">Decisão</SelectItem>
                  <SelectItem value="ANUNCIO">Anúncio</SelectItem>
                  <SelectItem value="RELATORIO">Relatório</SelectItem>
                </SelectContent>
              </Select>
              {errors.tipo && <p className="text-xs text-destructive">{errors.tipo.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="data">Data *</Label>
              <Input
                id="data"
                type="date"
                {...register('data')}
                aria-invalid={!!errors.data}
              />
              {errors.data && <p className="text-xs text-destructive">{errors.data.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="participantes">
              Participantes * <span className="text-xs text-muted-foreground">(um por linha)</span>
            </Label>
            <Textarea
              id="participantes"
              {...register('participantes')}
              rows={4}
              placeholder="João Silva&#10;Maria Santos&#10;Pedro Costa"
              aria-invalid={!!errors.participantes}
            />
            {errors.participantes && <p className="text-xs text-destructive">{errors.participantes.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="resumo">Resumo / Ata *</Label>
            <Textarea
              id="resumo"
              {...register('resumo')}
              rows={6}
              placeholder="Descreva os tópicos discutidos, decisões tomadas e próximas acções…"
              aria-invalid={!!errors.resumo}
            />
            {errors.resumo && <p className="text-xs text-destructive">{errors.resumo.message}</p>}
          </div>
        </form>
      </FormPage>
    </>
  );
}
