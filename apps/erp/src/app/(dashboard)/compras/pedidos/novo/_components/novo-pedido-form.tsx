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
import { criarPedidoCompraAction } from '@/server/actions/compras.actions';

const ItemFormSchema = z.object({
  descricao: z.string().min(1, 'Descrição obrigatória'),
  quantidade: z.coerce.number().positive('Quantidade positiva'),
  unidadeMedida: z.string().min(1, 'Unidade obrigatória'),
  precoUnitario: z.coerce.number().positive('Preço positivo'),
  desconto: z.coerce.number().nonnegative().default(0),
  taxaIva: z.coerce.number().default(0.16),
  observacoes: z.string().optional(),
});

const FormSchema = z.object({
  fornecedorId: z.string().min(1, 'Fornecedor obrigatório'),
  data: z.string().min(1, 'Data obrigatória'),
  condicoesPagamento: z.string().min(1, 'Condições de pagamento obrigatórias'),
  prazoEntregaDias: z.coerce.number().int().positive('Prazo positivo'),
  dataEntregaPrevista: z.string().min(1, 'Data prevista obrigatória'),
  enderecoEntrega: z.string().min(1, 'Endereço de entrega obrigatório'),
  centroCustoId: z.string().optional(),
  requisicaoCompraId: z.string().optional(),
  cotacaoId: z.string().optional(),
  observacoes: z.string().optional(),
  itens: z.array(ItemFormSchema).min(1, 'Mínimo 1 item'),
});

type FormValues = z.infer<typeof FormSchema>;

const today = new Date().toISOString().split('T')[0];

export function NovoPedidoForm() {
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
      fornecedorId: '',
      data: today,
      condicoesPagamento: '',
      prazoEntregaDias: 30,
      dataEntregaPrevista: '',
      enderecoEntrega: '',
      centroCustoId: '',
      requisicaoCompraId: '',
      cotacaoId: '',
      observacoes: '',
      itens: [{ descricao: '', quantidade: 1, unidadeMedida: 'un', precoUnitario: 0, desconto: 0, taxaIva: 0.16 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'itens' });
  const itens = useWatch({ control, name: 'itens' }) ?? [];

  const totais = itens.reduce(
    (acc, l) => {
      const q = Number(l.quantidade) || 0;
      const p = Number(l.precoUnitario) || 0;
      const d = Number(l.desconto) || 0;
      const taxa = Number(l.taxaIva) || 0;
      const base = q * p - d;
      const iva = base * taxa;
      return { subtotal: acc.subtotal + base, iva: acc.iva + iva, total: acc.total + base + iva };
    },
    { subtotal: 0, iva: 0, total: 0 }
  );

  const fmtMZN = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await criarPedidoCompraAction({
        fornecedorId: values.fornecedorId,
        data: values.data,
        condicoesPagamento: values.condicoesPagamento,
        prazoEntregaDias: Number(values.prazoEntregaDias),
        dataEntregaPrevista: values.dataEntregaPrevista,
        enderecoEntrega: values.enderecoEntrega,
        centroCustoId: values.centroCustoId || undefined,
        requisicaoCompraId: values.requisicaoCompraId || undefined,
        cotacaoId: values.cotacaoId || undefined,
        observacoes: values.observacoes || undefined,
        itens: values.itens.map((it) => ({
          descricao: it.descricao,
          quantidade: Number(it.quantidade),
          unidadeMedida: it.unidadeMedida,
          precoUnitario: Number(it.precoUnitario),
          desconto: Number(it.desconto) || 0,
          taxaIva: Number(it.taxaIva) || 0.16,
          observacoes: it.observacoes || undefined,
        })),
      } as any);

      if (result?.ok) {
        toast.success('Pedido de compra criado com sucesso.');
        router.push('/compras/pedidos');
      } else {
        toast.error((result as any)?.error?.message ?? 'Erro ao criar pedido de compra.');
      }
    });
  });

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="ghost" onClick={() => router.push('/compras/pedidos')}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button type="button" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-2" />
              {isPending ? 'A criar…' : 'Criar Pedido'}
            </Button>
          </>
        }
      >
        <FormSection title="Fornecedor e Condições" description="Dados do fornecedor e condições comerciais">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fornecedor-id">ID do Fornecedor *</Label>
              <Input id="fornecedor-id" {...register('fornecedorId')} placeholder="ID do fornecedor (CUID)" />
              <p className="text-xs text-muted-foreground">Pesquisa de fornecedores disponível após integração comercial.</p>
              {errors.fornecedorId && (
                <p className="text-sm text-destructive">{errors.fornecedorId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="data">Data do Pedido *</Label>
              <Input id="data" type="date" {...register('data')} />
              {errors.data && <p className="text-sm text-destructive">{errors.data.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="condicoes-pagamento">Condições de Pagamento *</Label>
              <Input
                id="condicoes-pagamento"
                {...register('condicoesPagamento')}
                placeholder="ex.: 30 dias após factura"
              />
              {errors.condicoesPagamento && (
                <p className="text-sm text-destructive">{errors.condicoesPagamento.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="prazo-entrega">Prazo de Entrega (dias) *</Label>
              <Input id="prazo-entrega" type="number" min="1" step="1" {...register('prazoEntregaDias')} />
              {errors.prazoEntregaDias && (
                <p className="text-sm text-destructive">{errors.prazoEntregaDias.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data-entrega-prevista">Data de Entrega Prevista *</Label>
              <Input id="data-entrega-prevista" type="date" {...register('dataEntregaPrevista')} />
              {errors.dataEntregaPrevista && (
                <p className="text-sm text-destructive">{errors.dataEntregaPrevista.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="centro-custo-id">ID do Centro de Custo</Label>
              <Input
                id="centro-custo-id"
                {...register('centroCustoId')}
                placeholder="ID do centro de custo (CUID) — opcional"
              />
              <p className="text-xs text-muted-foreground">Pesquisa disponível após integração comercial.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="endereco-entrega">Endereço de Entrega *</Label>
            <Textarea id="endereco-entrega" {...register('enderecoEntrega')} rows={2} placeholder="Morada de entrega da encomenda" />
            {errors.enderecoEntrega && (
              <p className="text-sm text-destructive">{errors.enderecoEntrega.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="requisicao-id">ID da Requisição de Compra</Label>
              <Input
                id="requisicao-id"
                {...register('requisicaoCompraId')}
                placeholder="ID da requisição (CUID) — opcional"
              />
              <p className="text-xs text-muted-foreground">Pesquisa disponível após integração comercial.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cotacao-id">ID da Cotação</Label>
              <Input
                id="cotacao-id"
                {...register('cotacaoId')}
                placeholder="ID da cotação (CUID) — opcional"
              />
              <p className="text-xs text-muted-foreground">Pesquisa disponível após integração comercial.</p>
            </div>
          </div>
        </FormSection>

        <FormSection title="Itens do Pedido" description="Produtos ou serviços a encomendar">
          <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
            <span className="col-span-3">Descrição</span>
            <span className="col-span-1">Qtd</span>
            <span className="col-span-2">Unidade</span>
            <span className="col-span-2">Preço Unit.</span>
            <span className="col-span-1">Desc.</span>
            <span className="col-span-1">IVA %</span>
            <span className="col-span-1 text-right">Total</span>
            <span className="col-span-1"></span>
          </div>

          {fields.map((field, i) => {
            const q = Number(itens[i]?.quantidade) || 0;
            const p = Number(itens[i]?.precoUnitario) || 0;
            const d = Number(itens[i]?.desconto) || 0;
            const taxa = Number(itens[i]?.taxaIva) || 0;
            const base = q * p - d;
            const total = base + base * taxa;

            return (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-12 md:col-span-3 space-y-1">
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
                <div className="col-span-4 md:col-span-1 space-y-1">
                  <Label className="md:hidden text-xs">Qtd</Label>
                  <Input type="number" min="0.01" step="0.01" {...register(`itens.${i}.quantidade`)} aria-label={`Quantidade item ${i + 1}`} />
                </div>
                <div className="col-span-4 md:col-span-2 space-y-1">
                  <Label className="md:hidden text-xs">Unidade</Label>
                  <Input {...register(`itens.${i}.unidadeMedida`)} placeholder="un" aria-label={`Unidade item ${i + 1}`} />
                  {errors.itens?.[i]?.unidadeMedida && (
                    <p className="text-xs text-destructive">{errors.itens[i]?.unidadeMedida?.message}</p>
                  )}
                </div>
                <div className="col-span-4 md:col-span-2 space-y-1">
                  <Label className="md:hidden text-xs">Preço</Label>
                  <Input type="number" min="0" step="0.01" {...register(`itens.${i}.precoUnitario`)} aria-label={`Preço unitário item ${i + 1}`} />
                  {errors.itens?.[i]?.precoUnitario && (
                    <p className="text-xs text-destructive">{errors.itens[i]?.precoUnitario?.message}</p>
                  )}
                </div>
                <div className="col-span-4 md:col-span-1 space-y-1">
                  <Label className="md:hidden text-xs">Desc.</Label>
                  <Input type="number" min="0" step="0.01" {...register(`itens.${i}.desconto`)} aria-label={`Desconto item ${i + 1}`} />
                </div>
                <div className="col-span-4 md:col-span-1 space-y-1">
                  <Label className="md:hidden text-xs">IVA %</Label>
                  <Select
                    defaultValue="0.16"
                    onValueChange={(v) => setValue(`itens.${i}.taxaIva`, parseFloat(v))}
                  >
                    <SelectTrigger className="h-9" aria-label={`Taxa IVA item ${i + 1}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.16">16%</SelectItem>
                      <SelectItem value="0">0%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3 md:col-span-1 flex items-center justify-end pt-1">
                  <span className="text-sm tabular-nums font-medium">{fmtMZN.format(total)}</span>
                </div>
                <div className="col-span-1 flex items-start pt-1">
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
            );
          })}

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
            onClick={() => append({ descricao: '', quantidade: 1, unidadeMedida: 'un', precoUnitario: 0, desconto: 0, taxaIva: 0.16 })}
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar item
          </Button>

          <div className="border-t pt-4 space-y-1 text-sm max-w-xs ml-auto">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">{fmtMZN.format(totais.subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>IVA</span>
              <span className="tabular-nums">{fmtMZN.format(totais.iva)}</span>
            </div>
            <div className="flex justify-between font-semibold text-base">
              <span>Total</span>
              <span className="tabular-nums">{fmtMZN.format(totais.total)}</span>
            </div>
          </div>
        </FormSection>

        <FormSection title="Observações" description="Notas adicionais para o fornecedor">
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
