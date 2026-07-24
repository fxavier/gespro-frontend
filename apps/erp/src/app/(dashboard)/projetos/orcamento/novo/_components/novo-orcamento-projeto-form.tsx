'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Trash2, Save, X, AlertCircle } from 'lucide-react';
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
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { criarOrcamentoProjetoAction } from '@/server/actions/projetos.actions';

const TIPOS = [
  { value: 'MAO_OBRA', label: 'Mão de Obra' },
  { value: 'MATERIAL', label: 'Material' },
  { value: 'EQUIPAMENTO', label: 'Equipamento' },
  { value: 'SERVICO', label: 'Serviço' },
  { value: 'OUTRO', label: 'Outro' },
] as const;

const CategoriaFormSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').max(100),
  tipo: z.enum(['MAO_OBRA', 'MATERIAL', 'EQUIPAMENTO', 'SERVICO', 'OUTRO']),
  valorPlanejado: z.coerce.number().nonnegative('Valor não pode ser negativo'),
});

const FormSchema = z.object({
  projetoId: z.string().min(1, 'Projecto obrigatório'),
  categorias: z.array(CategoriaFormSchema).min(1, 'Mínimo 1 categoria'),
  observacoes: z.string().max(1000).optional(),
});
type FormValues = z.infer<typeof FormSchema>;

const fmtMZN = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });

export function NovoOrcamentoProjetoForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      projetoId: '',
      categorias: [{ nome: '', tipo: 'MAO_OBRA', valorPlanejado: 0 }],
      observacoes: '',
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'categorias' });
  const categorias = useWatch({ control, name: 'categorias' }) ?? [];

  const totalPlaneado = categorias.reduce((acc, c) => acc + (Number(c?.valorPlanejado) || 0), 0);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await criarOrcamentoProjetoAction({
        projetoId: values.projetoId,
        categorias: values.categorias.map((c) => ({
          nome: c.nome,
          tipo: c.tipo,
          valorPlanejado: Number(c.valorPlanejado),
          itens: [],
        })),
        observacoes: values.observacoes || undefined,
      } as never);
      if (result?.ok) {
        toast.success('Orçamento criado com sucesso.');
        router.push('/projetos/orcamento');
      } else {
        toast.error(result?.error?.message ?? 'Erro ao criar orçamento.');
      }
    });
  });

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="ghost" onClick={() => router.push('/projetos/orcamento')}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button type="button" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-2" />
              {isPending ? 'A criar…' : 'Criar Orçamento'}
            </Button>
          </>
        }
      >
        <FormSection title="Projecto" description="Projecto a orçamentar">
          <div className="space-y-2">
            <Label htmlFor="projetoId">ID do Projecto *</Label>
            <Input id="projetoId" {...register('projetoId')} placeholder="ID do projecto (CUID)" />
            {errors.projetoId && <p className="text-sm text-destructive">{errors.projetoId.message}</p>}
          </div>
        </FormSection>

        <FormSection title="Categorias" description="Rubricas de custo e valores planeados">
          <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
            <span className="col-span-5">Nome</span>
            <span className="col-span-3">Tipo</span>
            <span className="col-span-3">Valor Planeado</span>
            <span className="col-span-1"></span>
          </div>

          {fields.map((field, i) => (
            <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
              <div className="col-span-12 md:col-span-5 space-y-1">
                <Label className="md:hidden text-xs" htmlFor={`categoria-nome-${i}`}>Nome *</Label>
                <Input
                  id={`categoria-nome-${i}`}
                  {...register(`categorias.${i}.nome`)}
                  placeholder="Ex.: Equipa de instalação"
                  aria-label={`Nome da categoria ${i + 1}`}
                />
                {errors.categorias?.[i]?.nome && (
                  <p className="text-xs text-destructive">{errors.categorias[i]?.nome?.message}</p>
                )}
              </div>
              <div className="col-span-7 md:col-span-3 space-y-1">
                <Label className="md:hidden text-xs">Tipo</Label>
                <Select
                  defaultValue="MAO_OBRA"
                  onValueChange={(v) => setValue(`categorias.${i}.tipo`, v as FormValues['categorias'][number]['tipo'])}
                >
                  <SelectTrigger className="h-9" aria-label={`Tipo da categoria ${i + 1}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-4 md:col-span-3 space-y-1">
                <Label className="md:hidden text-xs">Valor</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  {...register(`categorias.${i}.valorPlanejado`)}
                  aria-label={`Valor planeado da categoria ${i + 1}`}
                />
                {errors.categorias?.[i]?.valorPlanejado && (
                  <p className="text-xs text-destructive">{errors.categorias[i]?.valorPlanejado?.message}</p>
                )}
              </div>
              <div className="col-span-1 flex items-start pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={fields.length === 1}
                  onClick={() => remove(i)}
                  aria-label="Remover categoria"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}

          {errors.categorias?.root && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              {errors.categorias.root.message}
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ nome: '', tipo: 'MAO_OBRA', valorPlanejado: 0 })}
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar categoria
          </Button>

          <div className="border-t pt-4 flex justify-between font-semibold text-base max-w-xs ml-auto">
            <span>Total Planeado</span>
            <span className="tabular-nums">{fmtMZN.format(totalPlaneado)}</span>
          </div>
        </FormSection>

        <FormSection title="Observações" description="Notas adicionais (opcional)">
          <Textarea {...register('observacoes')} placeholder="Observações adicionais…" rows={3} />
          {errors.observacoes && <p className="text-sm text-destructive">{errors.observacoes.message}</p>}
        </FormSection>
      </FormPage>
    </>
  );
}
