'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { EntrevistaSchema } from '@/lib/validations/recrutamento';
import type { EntrevistaInput } from '@/lib/validations/recrutamento';
import { registarEntrevistaAction } from '@/server/actions/recrutamento.actions';
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

interface EntrevistaFormInlineProps {
  candidaturaId: string;
}

export function EntrevistaFormInline({ candidaturaId }: EntrevistaFormInlineProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<EntrevistaInput>({
    resolver: zodResolver(EntrevistaSchema),
    defaultValues: {
      candidaturaId,
      entrevistadores: [],
    },
  });

  const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = form;

  function onSubmit(data: EntrevistaInput) {
    startTransition(async () => {
      const result = await registarEntrevistaAction(data);
      if (result.ok) {
        toast.success('Entrevista registada com sucesso');
        reset({ candidaturaId, entrevistadores: [] });
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao registar entrevista');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
      <input type="hidden" {...register('candidaturaId')} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="tipo">Tipo <span className="text-destructive">*</span></Label>
          <Select
            value={watch('tipo')}
            onValueChange={(v) => setValue('tipo', v as EntrevistaInput['tipo'])}
          >
            <SelectTrigger id="tipo">
              <SelectValue placeholder="Selecionar tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TELEFONICA">Telefónica</SelectItem>
              <SelectItem value="PRESENCIAL">Presencial</SelectItem>
              <SelectItem value="VIDEO">Vídeo</SelectItem>
              <SelectItem value="TECNICA">Técnica</SelectItem>
              <SelectItem value="PAINEL">Painel</SelectItem>
            </SelectContent>
          </Select>
          {errors.tipo && <p className="text-sm text-destructive">{errors.tipo.message}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="dataHora">Data e Hora <span className="text-destructive">*</span></Label>
          <Input id="dataHora" type="datetime-local" {...register('dataHora')} />
          {errors.dataHora && <p className="text-sm text-destructive">{errors.dataHora.message}</p>}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="entrevistadores0">
          Entrevistadores <span className="text-destructive">*</span>
          <span className="text-xs text-muted-foreground ml-2">(um por linha ou separados por vírgula)</span>
        </Label>
        <Textarea
          id="entrevistadores0"
          rows={2}
          placeholder="Nome do entrevistador, Outro entrevistador…"
          onChange={(e) => {
            const valores = e.target.value
              .split(/[,\n]/)
              .map((v) => v.trim())
              .filter(Boolean);
            setValue('entrevistadores', valores);
          }}
        />
        {errors.entrevistadores && (
          <p className="text-sm text-destructive">{errors.entrevistadores.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="avaliacao">Avaliação (0-10)</Label>
          <Input id="avaliacao" type="number" min={0} max={10} step={0.5} {...register('avaliacao')} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="recomendaAvancar">Recomendação</Label>
          <Select
            onValueChange={(v) => setValue('recomendaAvancar', v === 'true')}
          >
            <SelectTrigger id="recomendaAvancar">
              <SelectValue placeholder="Sem recomendação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Recomenda avançar</SelectItem>
              <SelectItem value="false">Não recomenda</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="parecer">Parecer / Notas</Label>
        <Textarea id="parecer" rows={3} {...register('parecer')} />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="submit" disabled={isPending} size="sm">
          {isPending ? 'A registar…' : 'Registar Entrevista'}
        </Button>
      </div>
    </form>
  );
}
