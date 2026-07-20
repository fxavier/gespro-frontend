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
import { solicitarFeriasAction } from '@/server/actions/rh.actions';

const Schema = z
  .object({
    feriasId: z.string().min(1, 'Seleccione um período aquisitivo'),
    dataInicio: z.string().min(1, 'Data de início obrigatória'),
    dataFim: z.string().min(1, 'Data de fim obrigatória'),
    diasSolicitados: z.coerce.number().int().positive('Indique os dias a gozar'),
    tipo: z.enum(['INTEGRAL', 'FRACIONADA', 'ABONO_PECUNIARIO']),
    observacoes: z.string().max(500).optional(),
  })
  .refine((d) => new Date(d.dataFim) >= new Date(d.dataInicio), {
    message: 'Data de fim não pode ser anterior à data de início',
    path: ['dataFim'],
  });

type FormData = z.infer<typeof Schema>;

interface PeriodoOpcao {
  id: string;
  colaboradorNome: string;
  colaboradorCodigo: string;
  inicio: string;
  fim: string;
  saldo: number;
}

interface Props {
  periodos: PeriodoOpcao[];
}

export default function NovaSolicitacaoFeriasForm({ periodos }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: { tipo: 'INTEGRAL' },
  });

  const {
    formState: { errors },
  } = form;

  const feriasId = form.watch('feriasId');
  const periodoSel = periodos.find((p) => p.id === feriasId);

  function onSubmit(data: FormData) {
    startTransition(async () => {
      const result = await solicitarFeriasAction({
        feriasId: data.feriasId,
        dataInicio: new Date(data.dataInicio),
        dataFim: new Date(data.dataFim),
        diasSolicitados: data.diasSolicitados,
        tipo: data.tipo,
        observacoes: data.observacoes || undefined,
      });

      if (!result.ok) {
        toast.error(result.error.message ?? 'Erro ao submeter solicitação.');
        return;
      }

      toast.success('Solicitação de férias submetida com sucesso.');
      router.push('/rh/ferias');
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => router.push('/rh/ferias')} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'A submeter…' : 'Submeter'}
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <Label>Período aquisitivo *</Label>
            <Select value={feriasId ?? ''} onValueChange={(v) => form.setValue('feriasId', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccione o período" />
              </SelectTrigger>
              <SelectContent>
                {periodos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.colaboradorCodigo} — {p.colaboradorNome} ({p.inicio} a {p.fim}) · saldo {p.saldo}d
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.feriasId && <p className="text-xs text-destructive">{errors.feriasId.message}</p>}
            {periodoSel && (
              <p className="text-xs text-muted-foreground">
                Saldo disponível: <span className="tabular-nums font-medium">{periodoSel.saldo}</span> dias
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Início *</Label>
              <Input type="date" {...form.register('dataInicio')} />
              {errors.dataInicio && <p className="text-xs text-destructive">{errors.dataInicio.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Fim *</Label>
              <Input type="date" {...form.register('dataFim')} />
              {errors.dataFim && <p className="text-xs text-destructive">{errors.dataFim.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Dias a gozar *</Label>
              <Input type="number" min={1} {...form.register('diasSolicitados')} />
              {errors.diasSolicitados && (
                <p className="text-xs text-destructive">{errors.diasSolicitados.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tipo *</Label>
            <Select value={form.watch('tipo')} onValueChange={(v) => form.setValue('tipo', v as FormData['tipo'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INTEGRAL">Integral</SelectItem>
                <SelectItem value="FRACIONADA">Fracionada</SelectItem>
                <SelectItem value="ABONO_PECUNIARIO">Abono Pecuniário</SelectItem>
              </SelectContent>
            </Select>
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
