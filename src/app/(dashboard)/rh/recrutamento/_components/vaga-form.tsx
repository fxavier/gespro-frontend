'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { VagaSchema } from '@/lib/validations/recrutamento';
import type { VagaInput } from '@/lib/validations/recrutamento';
import { criarVagaAction } from '@/server/actions/recrutamento.actions';
import { FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function VagaForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<VagaInput>({
    resolver: zodResolver(VagaSchema),
    defaultValues: {
      numeroPosicoes: 1,
      regimeTrabalho: 'TEMPO_INTEGRAL',
      tipoContrato: 'EFECTIVO',
      requisitos: [],
    },
  });

  const { register, handleSubmit, formState: { errors, isDirty }, setValue, watch } = form;

  function onSubmit(data: VagaInput) {
    startTransition(async () => {
      const result = await criarVagaAction(data);
      if (result.ok) {
        toast.success('Vaga criada com sucesso');
        router.push(`/rh/recrutamento/vagas/${result.data.id}`);
      } else {
        toast.error(result.error.message ?? 'Erro ao criar vaga');
      }
    });
  }

  return (
    <div className="space-y-8">
      <UnsavedChangesGuard isDirty={isDirty} />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <FormSection title="Informações Básicas" description="Título, descrição e localização da vaga">
          <div className="grid gap-4">
            <div className="space-y-1">
              <Label htmlFor="titulo">Título <span className="text-destructive">*</span></Label>
              <Input
                id="titulo"
                placeholder="ex: Programador Sénior Full-Stack"
                {...register('titulo')}
              />
              {errors.titulo && <p className="text-sm text-destructive">{errors.titulo.message}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="descricao">Descrição <span className="text-destructive">*</span></Label>
              <Textarea
                id="descricao"
                placeholder="Descreva as responsabilidades, requisitos e benefícios da vaga…"
                rows={6}
                {...register('descricao')}
              />
              {errors.descricao && <p className="text-sm text-destructive">{errors.descricao.message}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="localizacao">Localização</Label>
              <Input
                id="localizacao"
                placeholder="ex: Maputo, Nampula, Remoto…"
                {...register('localizacao')}
              />
            </div>
          </div>
        </FormSection>

        <FormSection title="Condições de Trabalho" description="Regime, contrato e número de posições">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="regimeTrabalho">Regime <span className="text-destructive">*</span></Label>
              <Select
                value={watch('regimeTrabalho')}
                onValueChange={(v) => setValue('regimeTrabalho', v as VagaInput['regimeTrabalho'])}
              >
                <SelectTrigger id="regimeTrabalho">
                  <SelectValue placeholder="Selecionar regime" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEMPO_INTEGRAL">Tempo Integral</SelectItem>
                  <SelectItem value="TEMPO_PARCIAL">Tempo Parcial</SelectItem>
                </SelectContent>
              </Select>
              {errors.regimeTrabalho && <p className="text-sm text-destructive">{errors.regimeTrabalho.message}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="tipoContrato">Tipo de Contrato <span className="text-destructive">*</span></Label>
              <Select
                value={watch('tipoContrato')}
                onValueChange={(v) => setValue('tipoContrato', v as VagaInput['tipoContrato'])}
              >
                <SelectTrigger id="tipoContrato">
                  <SelectValue placeholder="Selecionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EFECTIVO">Efectivo</SelectItem>
                  <SelectItem value="TERMO_CERTO">Termo Certo</SelectItem>
                  <SelectItem value="ESTAGIO">Estágio</SelectItem>
                  <SelectItem value="TEMPORARIO">Temporário</SelectItem>
                  <SelectItem value="PRESTACAO_SERVICOS">Prestação de Serviços</SelectItem>
                </SelectContent>
              </Select>
              {errors.tipoContrato && <p className="text-sm text-destructive">{errors.tipoContrato.message}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="numeroPosicoes">Número de Posições <span className="text-destructive">*</span></Label>
              <Input
                id="numeroPosicoes"
                type="number"
                min={1}
                {...register('numeroPosicoes')}
              />
              {errors.numeroPosicoes && <p className="text-sm text-destructive">{errors.numeroPosicoes.message}</p>}
            </div>
          </div>
        </FormSection>

        <FormSection title="Faixa Salarial" description="Salário mínimo e máximo (opcional)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="salarioMin">Salário Mínimo (MZN)</Label>
              <Input
                id="salarioMin"
                type="number"
                min={0}
                placeholder="ex: 25000"
                {...register('salarioMin')}
              />
              {errors.salarioMin && <p className="text-sm text-destructive">{errors.salarioMin.message}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="salarioMax">Salário Máximo (MZN)</Label>
              <Input
                id="salarioMax"
                type="number"
                min={0}
                placeholder="ex: 50000"
                {...register('salarioMax')}
              />
              {errors.salarioMax && <p className="text-sm text-destructive">{errors.salarioMax.message}</p>}
            </div>
          </div>
        </FormSection>

        <div className="flex items-center justify-end gap-3 pt-4 border-t sticky bottom-0 bg-background py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/rh/recrutamento')}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'A criar…' : 'Criar Vaga'}
          </Button>
        </div>
      </form>
    </div>
  );
}
