'use client';

/**
 * Formulário de emissão de nota de débito — CLIENT COMPONENT.
 * RHF + zodResolver + useActionState + useFieldArray; zero Dialog.
 */

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, Trash2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { emitirNotaDebito } from '@/server/actions/faturacao.actions';
import { EmitirNotaDebitoSchema, type EmitirNotaDebitoInput } from '@/lib/validations/faturacao';

type FormState = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string; details?: unknown } } | null;

interface SerieOption { id: string; label: string }
interface ClienteOption { id: string; nome: string }

interface NovaNotaDebitoFormProps {
  series: SerieOption[];
  clientes: ClienteOption[];
}

const hoje = new Date().toISOString().split('T')[0]!;

const MOTIVOS = [
  'Serviços adicionais não faturados',
  'Actualização contratual',
  'Correcção de preço',
  'Custos logísticos adicionais',
  'Outro',
];

export function NovaNotaDebitoForm({ series, clientes }: NovaNotaDebitoFormProps) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, EmitirNotaDebitoInput>(
    (_prev, data) => emitirNotaDebito(data),
    null
  );

  const form = useForm<EmitirNotaDebitoInput>({
    resolver: zodResolver(EmitirNotaDebitoSchema),
    defaultValues: {
      moeda: 'MZN',
      linhas: [{ descricao: '', quantidade: 1, precoUnitario: 0, desconto: 0, taxaIva: 0.16, ordemLinha: 0, subtotal: 0, ivaItem: 0, total: 0 }],
    },
    mode: 'onBlur',
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'linhas' });

  useEffect(() => {
    if (!state) return;
    if (!state.ok) {
      const details = state.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof EmitirNotaDebitoInput, { type: 'server', message: messages[0] });
        });
      } else {
        toast.error(state.error.message ?? 'Ocorreu um erro ao emitir a nota de débito.');
      }
    } else {
      toast.success('Nota de débito emitida com sucesso!');
      router.push('/vendas/notas-debito');
    }
  }, [state, form, router]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));
  const isDirty = form.formState.isDirty;

  const handleCancel = () => {
    if (isDirty && !window.confirm('Tem alterações não guardadas. Pretende mesmo sair?')) return;
    router.push('/vendas/notas-debito');
  };

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={isDirty} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={isPending}>
              <X className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A emitir...' : 'Emitir Nota de Débito'}
            </Button>
          </>
        }
      >
        <FormSection title="Dados da Nota de Débito" description="Identifique o cliente e o motivo da cobrança adicional">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="serieDocumentoId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Série de documento *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Seleccionar série…" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {series.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="clienteId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Seleccionar cliente…" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clientes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dataEmissao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de emissão *</FormLabel>
                  <FormControl>
                    <Input type="date" defaultValue={hoje}
                      onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="motivo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Seleccionar motivo…" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MOTIVOS.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Observações adicionais…" rows={3} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection
          title="Ajustes / Serviços"
          description="Itens a debitar ao cliente"
        >
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">{fields.length} {fields.length === 1 ? 'linha' : 'linhas'}</span>
            <Button
              type="button" size="sm" variant="outline"
              onClick={() => append({ descricao: '', quantidade: 1, precoUnitario: 0, desconto: 0, taxaIva: 0.16, ordemLinha: fields.length, subtotal: 0, ivaItem: 0, total: 0 })}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Adicionar linha
            </Button>
          </div>
          <div className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Linha {index + 1}</span>
                  {fields.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
                <FormField
                  control={form.control}
                  name={`linhas.${index}.descricao`}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Descrição *</FormLabel>
                      <FormControl><Input placeholder="Descrição do ajuste/serviço" {...f} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <FormField
                    control={form.control}
                    name={`linhas.${index}.quantidade`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Quantidade</FormLabel>
                        <FormControl>
                          <Input type="number" min="0.001" step="0.001" {...f}
                            onChange={(e) => f.onChange(parseFloat(e.target.value) || 0)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`linhas.${index}.precoUnitario`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Preço (MT)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="0.01" {...f}
                            onChange={(e) => f.onChange(parseFloat(e.target.value) || 0)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`linhas.${index}.desconto`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Desconto (MT)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="0.01" {...f}
                            onChange={(e) => f.onChange(parseFloat(e.target.value) || 0)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`linhas.${index}.taxaIva`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel className="text-xs">IVA</FormLabel>
                        <Select onValueChange={(v) => f.onChange(parseFloat(v))} defaultValue="0.16">
                          <FormControl>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="0.16">16%</SelectItem>
                            <SelectItem value="0">0% (isento)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            ))}
          </div>
        </FormSection>
      </FormPage>
    </Form>
  );
}
