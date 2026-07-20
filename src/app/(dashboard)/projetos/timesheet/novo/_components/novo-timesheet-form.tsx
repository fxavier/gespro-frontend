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
import { Checkbox } from '@/components/ui/checkbox';
import { FormPage } from '@/components/patterns';
import { registarTimesheetAction } from '@/server/actions/projetos.actions';

const Schema = z.object({
  projetoId: z.string().min(1, 'Seleccione um projecto'),
  colaboradorId: z.string().min(1, 'Seleccione o colaborador'),
  data: z.string().min(1, 'Data obrigatória'),
  horaInicio: z.string().min(1, 'Hora início obrigatória'),
  horaFim: z.string().min(1, 'Hora fim obrigatória'),
  tipo: z.enum(['DESENVOLVIMENTO', 'REUNIAO', 'DOCUMENTACAO', 'TESTE', 'SUPORTE', 'OUTRO']),
  faturavel: z.boolean().default(false),
  descricao: z.string().max(1000).optional(),
});

type FormData = z.infer<typeof Schema>;

interface Projeto { id: string; nome: string; codigo: string }
interface Colaborador { id: string; nome: string; codigo: string }

interface Props {
  projetos: Projeto[];
  colaboradores: Colaborador[];
}

const TIPOS = [
  { value: 'DESENVOLVIMENTO', label: 'Desenvolvimento' },
  { value: 'REUNIAO', label: 'Reunião' },
  { value: 'DOCUMENTACAO', label: 'Documentação' },
  { value: 'TESTE', label: 'Teste' },
  { value: 'SUPORTE', label: 'Suporte' },
  { value: 'OUTRO', label: 'Outro' },
];

export default function NovoTimesheetForm({ projetos, colaboradores }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: {
      data: new Date().toISOString().split('T')[0],
      tipo: 'DESENVOLVIMENTO',
      faturavel: false,
    },
  });

  function onSubmit(data: FormData) {
    startTransition(async () => {
      const [hI, mI] = data.horaInicio.split(':').map(Number);
      const [hF, mF] = data.horaFim.split(':').map(Number);
      const duracaoMin = (hF * 60 + mF) - (hI * 60 + mI);
      if (duracaoMin <= 0) {
        form.setError('horaFim', { message: 'Hora de fim deve ser após hora de início' });
        return;
      }

      const dataBase = new Date(data.data);
      const horaInicio = new Date(dataBase);
      horaInicio.setHours(hI, mI, 0, 0);
      const horaFim = new Date(dataBase);
      horaFim.setHours(hF, mF, 0, 0);

      const result = await registarTimesheetAction({
        projetoId: data.projetoId,
        colaboradorId: data.colaboradorId,
        data: dataBase,
        horaInicio,
        horaFim,
        tipo: data.tipo,
        faturavel: data.faturavel,
        descricao: data.descricao,
      });

      if (!result.ok) {
        toast.error(result.error.message ?? 'Erro ao registar tempo.');
        return;
      }

      toast.success('Registo de tempo guardado.');
      router.push('/projetos/timesheet');
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormPage
      actions={
        <>
          <Button type="button" variant="outline" onClick={() => router.push('/projetos/timesheet')} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'A guardar…' : 'Guardar Registo'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>Projecto *</Label>
          <Select onValueChange={(v) => form.setValue('projetoId', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccione projecto" />
            </SelectTrigger>
            <SelectContent>
              {projetos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.codigo} — {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.projetoId && (
            <p className="text-xs text-destructive">{form.formState.errors.projetoId.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Colaborador *</Label>
          <Select onValueChange={(v) => form.setValue('colaboradorId', v)}>
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
          {form.formState.errors.colaboradorId && (
            <p className="text-xs text-destructive">{form.formState.errors.colaboradorId.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Tipo *</Label>
          <Select
            value={form.watch('tipo')}
            onValueChange={(v) => form.setValue('tipo', v as FormData['tipo'])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Data *</Label>
          <Input type="date" {...form.register('data')} />
          {form.formState.errors.data && (
            <p className="text-xs text-destructive">{form.formState.errors.data.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Hora Início *</Label>
            <Input type="time" {...form.register('horaInicio')} />
          </div>
          <div className="space-y-2">
            <Label>Hora Fim *</Label>
            <Input type="time" {...form.register('horaFim')} />
            {form.formState.errors.horaFim && (
              <p className="text-xs text-destructive">{form.formState.errors.horaFim.message}</p>
            )}
          </div>
        </div>

        <div className="md:col-span-2 space-y-2">
          <Label>Descrição</Label>
          <Textarea rows={3} placeholder="Descreva o trabalho efectuado…" {...form.register('descricao')} />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="faturavel"
            checked={form.watch('faturavel')}
            onCheckedChange={(v) => form.setValue('faturavel', Boolean(v))}
          />
          <Label htmlFor="faturavel" className="cursor-pointer">Horas facturáveis</Label>
        </div>
      </div>
    </FormPage>
    </form>
  );
}
