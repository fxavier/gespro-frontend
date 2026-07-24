'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { criarRegraComissao } from '@/server/actions/comissoes.actions';

const TIPOS = [
  { value: 'FIXA', label: 'Fixa' },
  { value: 'ESCALONADA', label: 'Escalonada' },
  { value: 'POR_CATEGORIA', label: 'Por Categoria' },
  { value: 'POR_META', label: 'Por Meta' },
  { value: 'POR_PERIODO', label: 'Por Período' },
] as const;

const FormSchema = z
  .object({
    nome: z.string().min(2, 'Nome obrigatório').max(100),
    tipo: z.enum(['FIXA', 'ESCALONADA', 'POR_CATEGORIA', 'POR_META', 'POR_PERIODO']),
    percentualBase: z.coerce.number().min(0, 'Percentual não pode ser negativo').max(100, 'Percentual não pode exceder 100'),
    descricao: z.string().min(1, 'Descrição obrigatória').max(500),
    prioridade: z.coerce.number().int().min(1).max(99).default(1),
    ativa: z.boolean().default(true),
    vendedorId: z.string().optional(),
    percentualBonus: z.union([z.coerce.number().min(0).max(100), z.literal('')]).optional(),
    dataInicio: z.string().optional(),
    dataFim: z.string().optional(),
  })
  .refine(
    (d) => {
      if (d.dataInicio && d.dataFim) return d.dataInicio <= d.dataFim;
      return true;
    },
    { message: 'Data de início deve ser anterior à data de fim', path: ['dataFim'] },
  );
type FormValues = z.infer<typeof FormSchema>;

export function NovaRegraComissaoForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      nome: '',
      tipo: 'FIXA',
      percentualBase: 0,
      descricao: '',
      prioridade: 1,
      ativa: true,
      vendedorId: '',
      percentualBonus: '',
      dataInicio: '',
      dataFim: '',
    },
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await criarRegraComissao({
        nome: values.nome,
        tipo: values.tipo,
        percentualBase: Number(values.percentualBase),
        descricao: values.descricao,
        prioridade: Number(values.prioridade),
        ativa: values.ativa,
        vendedorId: values.vendedorId || undefined,
        percentualBonus:
          values.percentualBonus === '' || values.percentualBonus === undefined
            ? undefined
            : Number(values.percentualBonus),
        dataInicio: values.dataInicio || undefined,
        dataFim: values.dataFim || undefined,
      } as never);
      if (result?.ok) {
        toast.success('Regra de comissão criada com sucesso.');
        router.push('/vendas/comissoes');
      } else {
        toast.error(result?.error?.message ?? 'Erro ao criar regra de comissão.');
      }
    });
  });

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="ghost" onClick={() => router.push('/vendas/comissoes')}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button type="button" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-2" />
              {isPending ? 'A criar…' : 'Criar Regra'}
            </Button>
          </>
        }
      >
        <FormSection title="Regra" description="Identificação e tipo da regra de comissão">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" {...register('nome')} placeholder="Ex.: Comissão padrão" />
              {errors.nome && <p className="text-sm text-destructive">{errors.nome.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo *</Label>
              <Select value={watch('tipo')} onValueChange={(v) => setValue('tipo', v as FormValues['tipo'])}>
                <SelectTrigger id="tipo" aria-label="Tipo de regra">
                  <SelectValue placeholder="Seleccione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.tipo && <p className="text-sm text-destructive">{errors.tipo.message}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição *</Label>
            <Textarea id="descricao" {...register('descricao')} placeholder="Descrição da regra" rows={3} />
            {errors.descricao && <p className="text-sm text-destructive">{errors.descricao.message}</p>}
          </div>
        </FormSection>

        <FormSection title="Cálculo" description="Percentuais, prioridade e aplicação">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="percentualBase">Percentual Base (%) *</Label>
              <Input
                id="percentualBase"
                type="number"
                min="0"
                max="100"
                step="0.01"
                {...register('percentualBase')}
                placeholder="Ex.: 5"
              />
              {errors.percentualBase && (
                <p className="text-sm text-destructive">{errors.percentualBase.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="percentualBonus">Percentual Bónus (%)</Label>
              <Input
                id="percentualBonus"
                type="number"
                min="0"
                max="100"
                step="0.01"
                {...register('percentualBonus')}
                placeholder="Opcional"
              />
              {errors.percentualBonus && (
                <p className="text-sm text-destructive">{errors.percentualBonus.message as string}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prioridade">Prioridade</Label>
              <Input id="prioridade" type="number" min="1" max="99" {...register('prioridade')} placeholder="1" />
              {errors.prioridade && <p className="text-sm text-destructive">{errors.prioridade.message}</p>}
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch id="ativa" checked={watch('ativa')} onCheckedChange={(v) => setValue('ativa', v)} />
              <Label htmlFor="ativa">Ativa</Label>
            </div>
          </div>
        </FormSection>

        <FormSection title="Aplicação (opcional)" description="Restringir a um vendedor ou período">
          <div className="space-y-2">
            <Label htmlFor="vendedorId">ID do Vendedor</Label>
            <Input id="vendedorId" {...register('vendedorId')} placeholder="ID do vendedor (CUID) — opcional" />
            {errors.vendedorId && <p className="text-sm text-destructive">{errors.vendedorId.message}</p>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dataInicio">Data de Início</Label>
              <Input id="dataInicio" type="date" {...register('dataInicio')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataFim">Data de Fim</Label>
              <Input id="dataFim" type="date" {...register('dataFim')} />
              {errors.dataFim && <p className="text-sm text-destructive">{errors.dataFim.message}</p>}
            </div>
          </div>
        </FormSection>
      </FormPage>
    </>
  );
}
