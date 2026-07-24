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
import { emitirNotaCredito } from '@/server/actions/faturacao.actions';

// Mesmo bloco de linhas da fatura (LinhaDocumentoSchema)
const LinhaFormSchema = z.object({
  descricao: z.string().min(1, 'Descrição obrigatória'),
  quantidade: z.coerce.number().positive('Quantidade positiva'),
  precoUnitario: z.coerce.number().nonnegative('Preço não negativo'),
  desconto: z.coerce.number().nonnegative().default(0),
  taxaIva: z.coerce.number().default(0.16),
});

const FormSchema = z.object({
  serieDocumentoId: z.string().min(1, 'Série obrigatória'),
  faturaOriginalId: z.string().min(1, 'Factura original obrigatória'),
  motivo: z.string().min(1, 'Motivo obrigatório'),
  dataEmissao: z.string().min(1, 'Data obrigatória'),
  observacoes: z.string().optional(),
  linhas: z.array(LinhaFormSchema).min(1, 'Mínimo 1 linha'),
});

type FormValues = z.infer<typeof FormSchema>;

interface Props {
  series: Array<{ id: string; codigo: string; nome: string }>;
}

const today = new Date().toISOString().split('T')[0];

export function NovaNotaCreditoForm({ series }: Props) {
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
      serieDocumentoId: series[0]?.id ?? '',
      faturaOriginalId: '',
      motivo: '',
      dataEmissao: today,
      observacoes: '',
      linhas: [{ descricao: '', quantidade: 1, precoUnitario: 0, desconto: 0, taxaIva: 0.16 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'linhas' });
  const linhas = useWatch({ control, name: 'linhas' }) ?? [];

  const totais = linhas.reduce(
    (acc, l) => {
      const q = Number(l.quantidade) || 0;
      const p = Number(l.precoUnitario) || 0;
      const d = Number(l.desconto) || 0;
      const taxa = Number(l.taxaIva) || 0.16;
      const base = q * p - d;
      const iva = base * taxa;
      return { subtotal: acc.subtotal + base, iva: acc.iva + iva, total: acc.total + base + iva };
    },
    { subtotal: 0, iva: 0, total: 0 }
  );

  const fmtMZN = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await emitirNotaCredito({
        serieDocumentoId: values.serieDocumentoId,
        faturaOriginalId: values.faturaOriginalId,
        motivo: values.motivo,
        moeda: 'MZN',
        dataEmissao: values.dataEmissao,
        observacoes: values.observacoes || undefined,
        linhas: values.linhas.map((l, i) => ({
          descricao: l.descricao,
          quantidade: Number(l.quantidade),
          precoUnitario: Number(l.precoUnitario),
          desconto: Number(l.desconto) || 0,
          taxaIva: Number(l.taxaIva) || 0.16,
          ordemLinha: i,
        })),
      } as any);

      if (result?.ok) {
        toast.success('Nota de crédito emitida com sucesso.');
        router.push('/faturacao/nota-credito');
      } else {
        toast.error((result as any)?.error?.message ?? 'Erro ao emitir nota de crédito.');
      }
    });
  });

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="ghost" onClick={() => router.push('/faturacao/nota-credito')}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button type="button" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-2" />
              {isPending ? 'A emitir…' : 'Emitir Nota de Crédito'}
            </Button>
          </>
        }
      >
        <FormSection title="Série e Factura Original" description="Identifique a série e a factura a creditar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="serie-nc">Série de Documento *</Label>
              <Select
                defaultValue={series[0]?.id ?? ''}
                onValueChange={(v) => setValue('serieDocumentoId', v)}
              >
                <SelectTrigger id="serie-nc" aria-label="Série de Documento">
                  <SelectValue placeholder="Seleccione a série" />
                </SelectTrigger>
                <SelectContent>
                  {series.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.codigo} — {s.nome}</SelectItem>
                  ))}
                  {series.length === 0 && (
                    <SelectItem value="" disabled>Sem séries configuradas</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {errors.serieDocumentoId && (
                <p className="text-sm text-destructive">{errors.serieDocumentoId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="fatura-original-id">ID da Factura a Creditar *</Label>
              <Input id="fatura-original-id" {...register('faturaOriginalId')} placeholder="ID da factura (CUID)" />
              <p className="text-xs text-muted-foreground">Pesquisa de facturas disponível após integração comercial.</p>
              {errors.faturaOriginalId && (
                <p className="text-sm text-destructive">{errors.faturaOriginalId.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data-emissao">Data de Emissão *</Label>
              <Input id="data-emissao" type="date" {...register('dataEmissao')} />
              {errors.dataEmissao && (
                <p className="text-sm text-destructive">{errors.dataEmissao.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="motivo">Motivo *</Label>
              <Input id="motivo" {...register('motivo')} placeholder="Motivo do crédito" />
              {errors.motivo && (
                <p className="text-sm text-destructive">{errors.motivo.message}</p>
              )}
            </div>
          </div>
        </FormSection>

        <FormSection title="Linhas da Nota de Crédito" description="Itens a creditar">
          <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
            <span className="col-span-4">Descrição</span>
            <span className="col-span-2">Qtd</span>
            <span className="col-span-2">Preço Unit.</span>
            <span className="col-span-1">Desc.</span>
            <span className="col-span-1">IVA %</span>
            <span className="col-span-1 text-right">Total</span>
            <span className="col-span-1"></span>
          </div>

          {fields.map((field, i) => {
            const q = Number(linhas[i]?.quantidade) || 0;
            const p = Number(linhas[i]?.precoUnitario) || 0;
            const d = Number(linhas[i]?.desconto) || 0;
            const taxa = Number(linhas[i]?.taxaIva) || 0.16;
            const base = q * p - d;
            const total = base + base * taxa;

            return (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-12 md:col-span-4 space-y-1">
                  <Label className="md:hidden text-xs" htmlFor={`linha-descricao-${i}`}>Descrição *</Label>
                  <Input id={`linha-descricao-${i}`} {...register(`linhas.${i}.descricao`)} placeholder="Descrição do item" aria-label={`Descrição da linha ${i + 1}`} />
                  {errors.linhas?.[i]?.descricao && (
                    <p className="text-xs text-destructive">{errors.linhas[i]?.descricao?.message}</p>
                  )}
                </div>
                <div className="col-span-4 md:col-span-2 space-y-1">
                  <Label className="md:hidden text-xs">Qtd</Label>
                  <Input type="number" min="0.01" step="0.01" {...register(`linhas.${i}.quantidade`)} aria-label={`Quantidade linha ${i + 1}`} />
                </div>
                <div className="col-span-4 md:col-span-2 space-y-1">
                  <Label className="md:hidden text-xs">Preço</Label>
                  <Input type="number" min="0" step="0.01" {...register(`linhas.${i}.precoUnitario`)} aria-label={`Preço unitário linha ${i + 1}`} />
                </div>
                <div className="col-span-4 md:col-span-1 space-y-1">
                  <Label className="md:hidden text-xs">Desc.</Label>
                  <Input type="number" min="0" step="0.01" {...register(`linhas.${i}.desconto`)} aria-label={`Desconto linha ${i + 1}`} />
                </div>
                <div className="col-span-4 md:col-span-1 space-y-1">
                  <Label className="md:hidden text-xs">IVA %</Label>
                  <Select
                    defaultValue="0.16"
                    onValueChange={(v) => setValue(`linhas.${i}.taxaIva`, parseFloat(v))}
                  >
                    <SelectTrigger className="h-9" aria-label={`Taxa IVA linha ${i + 1}`}>
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
                    aria-label="Remover linha"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}

          {errors.linhas?.root && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              {errors.linhas.root.message}
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ descricao: '', quantidade: 1, precoUnitario: 0, desconto: 0, taxaIva: 0.16 })}
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar linha
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

        <FormSection title="Observações" description="Notas adicionais">
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
