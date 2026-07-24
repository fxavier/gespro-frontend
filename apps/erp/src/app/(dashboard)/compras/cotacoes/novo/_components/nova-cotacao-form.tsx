'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Trash2, Save, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { criarCotacaoAction } from '@/server/actions/compras.actions';

const ItemFormSchema = z.object({
  descricao: z.string().min(1, 'Descrição obrigatória'),
  quantidade: z.coerce.number().positive('Quantidade positiva'),
  unidadeMedida: z.string().min(1, 'Unidade obrigatória'),
  especificacoes: z.string().optional(),
});

const FormSchema = z.object({
  dataValidade: z.string().min(1, 'Data de validade obrigatória'),
  requisicaoCompraId: z.string().optional(),
  fornecedoresIds: z.string().optional(),
  observacoes: z.string().optional(),
  itens: z.array(ItemFormSchema).min(1, 'Mínimo 1 item'),
});

type FormValues = z.infer<typeof FormSchema>;

export function NovaCotacaoForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      dataValidade: '',
      requisicaoCompraId: '',
      fornecedoresIds: '',
      observacoes: '',
      itens: [{ descricao: '', quantidade: 1, unidadeMedida: 'un', especificacoes: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'itens' });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const fornecedoresIds = (values.fornecedoresIds ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const result = await criarCotacaoAction({
        dataValidade: values.dataValidade,
        requisicaoCompraId: values.requisicaoCompraId || undefined,
        fornecedoresIds: fornecedoresIds.length > 0 ? fornecedoresIds : undefined,
        observacoes: values.observacoes || undefined,
        itens: values.itens.map((it) => ({
          descricao: it.descricao,
          quantidade: Number(it.quantidade),
          unidadeMedida: it.unidadeMedida,
          especificacoes: it.especificacoes || undefined,
        })),
      } as any);

      if (result?.ok) {
        toast.success('Cotação criada com sucesso.');
        router.push('/compras/cotacoes');
      } else {
        toast.error((result as any)?.error?.message ?? 'Erro ao criar cotação.');
      }
    });
  });

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="ghost" onClick={() => router.push('/compras/cotacoes')}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button type="button" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-2" />
              {isPending ? 'A criar…' : 'Criar Cotação'}
            </Button>
          </>
        }
      >
        <FormSection title="Dados da Cotação" description="Prazo de validade e origem do pedido de cotação">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data-validade">Data de Validade *</Label>
              <Input id="data-validade" type="date" {...register('dataValidade')} />
              {errors.dataValidade && (
                <p className="text-sm text-destructive">{errors.dataValidade.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="requisicao-id">ID da Requisição de Compra</Label>
              <Input
                id="requisicao-id"
                {...register('requisicaoCompraId')}
                placeholder="ID da requisição (CUID) — opcional"
              />
              <p className="text-xs text-muted-foreground">Pesquisa disponível após integração comercial.</p>
              {errors.requisicaoCompraId && (
                <p className="text-sm text-destructive">{errors.requisicaoCompraId.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fornecedores-ids">IDs de Fornecedores a Convidar</Label>
            <Input
              id="fornecedores-ids"
              {...register('fornecedoresIds')}
              placeholder="IDs separados por vírgula (CUID) — opcional"
            />
            <p className="text-xs text-muted-foreground">Pesquisa de fornecedores disponível após integração comercial.</p>
          </div>
        </FormSection>

        <FormSection title="Itens da Cotação" description="Produtos ou serviços a cotar">
          <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
            <span className="col-span-4">Descrição</span>
            <span className="col-span-2">Qtd</span>
            <span className="col-span-2">Unidade</span>
            <span className="col-span-3">Especificações</span>
            <span className="col-span-1"></span>
          </div>

          {fields.map((field, i) => (
            <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
              <div className="col-span-12 md:col-span-4 space-y-1">
                <Label className="md:hidden text-xs" htmlFor={`item-descricao-${i}`}>Descrição *</Label>
                <Input
                  id={`item-descricao-${i}`}
                  {...register(`itens.${i}.descricao`)}
                  placeholder="Descrição do produto/serviço"
                  aria-label={`Descrição do item ${i + 1}`}
                />
                {errors.itens?.[i]?.descricao && (
                  <p className="text-xs text-destructive">{errors.itens[i]?.descricao?.message}</p>
                )}
              </div>
              <div className="col-span-4 md:col-span-2 space-y-1">
                <Label className="md:hidden text-xs">Qtd</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  {...register(`itens.${i}.quantidade`)}
                  aria-label={`Quantidade item ${i + 1}`}
                />
              </div>
              <div className="col-span-4 md:col-span-2 space-y-1">
                <Label className="md:hidden text-xs">Unidade</Label>
                <Input
                  {...register(`itens.${i}.unidadeMedida`)}
                  placeholder="un"
                  aria-label={`Unidade item ${i + 1}`}
                />
                {errors.itens?.[i]?.unidadeMedida && (
                  <p className="text-xs text-destructive">{errors.itens[i]?.unidadeMedida?.message}</p>
                )}
              </div>
              <div className="col-span-8 md:col-span-3 space-y-1">
                <Label className="md:hidden text-xs">Especificações</Label>
                <Input
                  {...register(`itens.${i}.especificacoes`)}
                  placeholder="Especificações (opcional)"
                  aria-label={`Especificações item ${i + 1}`}
                />
              </div>
              <div className="col-span-4 md:col-span-1 flex items-start pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={fields.length === 1}
                  onClick={() => remove(i)}
                  aria-label="Remover item"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}

          {errors.itens?.root && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              {errors.itens.root.message}
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ descricao: '', quantidade: 1, unidadeMedida: 'un', especificacoes: '' })}
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar item
          </Button>
        </FormSection>

        <FormSection title="Observações" description="Notas adicionais para os fornecedores">
          <Textarea
            {...register('observacoes')}
            placeholder="Observações adicionais (opcional)…"
            rows={3}
          />
        </FormSection>
      </FormPage>
    </>
  );
}
