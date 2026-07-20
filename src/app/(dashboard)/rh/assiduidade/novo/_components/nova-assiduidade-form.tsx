'use client';

import { useTransition } from 'react';
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
import { FormPage } from '@/components/patterns';
import { registarAssiduidadeAction } from '@/server/actions/rh.actions';

const Schema = z.object({
  colaboradorId: z.string().min(1, 'Seleccione um colaborador'),
  data: z.string().min(1, 'Data obrigatória'),
  entrada: z.string().min(1, 'Hora de entrada obrigatória'),
  saida: z.string().min(1, 'Hora de saída obrigatória'),
  saidaAlmoco: z.string().optional(),
  retornoAlmoco: z.string().optional(),
  tipo: z.enum(['NORMAL', 'FERIADO', 'FIM_SEMANA', 'FERIAS', 'AUSENCIA']),
  observacoes: z.string().max(500).optional(),
});

type FormData = z.infer<typeof Schema>;

interface Colaborador { id: string; nome: string; codigo: string }

interface Props {
  colaboradores: Colaborador[];
}

function buildDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

export default function NovaAssiduidadeForm({ colaboradores }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const today = new Date().toISOString().split('T')[0];

  const form = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: {
      data: today,
      entrada: '08:00',
      saida: '17:00',
      tipo: 'NORMAL',
    },
  });

  const { formState: { errors } } = form;

  function onSubmit(data: FormData) {
    startTransition(async () => {
      const result = await registarAssiduidadeAction({
        colaboradorId: data.colaboradorId,
        data: new Date(data.data),
        entrada: buildDateTime(data.data, data.entrada),
        saida: buildDateTime(data.data, data.saida),
        saidaAlmoco: data.saidaAlmoco ? buildDateTime(data.data, data.saidaAlmoco) : undefined,
        retornoAlmoco: data.retornoAlmoco ? buildDateTime(data.data, data.retornoAlmoco) : undefined,
        tipo: data.tipo,
        observacoes: data.observacoes || undefined,
      });

      if (!result.ok) {
        toast.error(result.error.message ?? 'Erro ao registar assiduidade.');
        return;
      }

      toast.success('Assiduidade registada com sucesso.');
      router.push('/rh/assiduidade');
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormPage
      actions={
        <>
          <Button type="button" variant="outline" onClick={() => router.push('/rh/assiduidade')} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'A registar…' : 'Registar'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Colaborador *</Label>
            <Select
              value={form.watch('colaboradorId') ?? ''}
              onValueChange={(v) => form.setValue('colaboradorId', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccione colaborador" />
              </SelectTrigger>
              <SelectContent>
                {colaboradores.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.codigo} — {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.colaboradorId && <p className="text-xs text-destructive">{errors.colaboradorId.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Tipo *</Label>
            <Select
              value={form.watch('tipo')}
              onValueChange={(v) => form.setValue('tipo', v as FormData['tipo'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NORMAL">Normal</SelectItem>
                <SelectItem value="FERIADO">Feriado</SelectItem>
                <SelectItem value="FIM_SEMANA">Fim de Semana</SelectItem>
                <SelectItem value="FERIAS">Férias</SelectItem>
                <SelectItem value="AUSENCIA">Ausência</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Data *</Label>
          <Input type="date" {...form.register('data')} />
          {errors.data && <p className="text-xs text-destructive">{errors.data.message}</p>}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Entrada *</Label>
            <Input type="time" {...form.register('entrada')} />
            {errors.entrada && <p className="text-xs text-destructive">{errors.entrada.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Saída Almoço</Label>
            <Input type="time" {...form.register('saidaAlmoco')} />
          </div>
          <div className="space-y-2">
            <Label>Retorno Almoço</Label>
            <Input type="time" {...form.register('retornoAlmoco')} />
          </div>
          <div className="space-y-2">
            <Label>Saída *</Label>
            <Input type="time" {...form.register('saida')} />
            {errors.saida && <p className="text-xs text-destructive">{errors.saida.message}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Observações</Label>
          <Textarea rows={2} placeholder="Notas adicionais…" {...form.register('observacoes')} />
        </div>
      </div>

    </FormPage>
    </form>
  );
}
