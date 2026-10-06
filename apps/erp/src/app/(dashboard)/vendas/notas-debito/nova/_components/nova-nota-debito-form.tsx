'use client';

/**
 * Formulário de emissão de nota de débito — CLIENT COMPONENT.
 * RHF + zodResolver + useTransition + useFieldArray; zero Dialog.
 * A natureza escolhe a conta a crédito (ADR-0039 §1, #85).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
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
import {
  FormPage,
  FormSection,
  UnsavedChangesGuard,
  Combobox,
  ComboboxRemoto,
  CampoDia,
  type ComboboxOption,
} from '@/components/patterns';
import { diaIsoParaData } from '@/lib/format-date';
import {
  emitirNotaDebito,
  procurarContasCreditoNotaDebito,
  procurarFaturasParaNotaDebito,
} from '@/server/actions/faturacao.actions';
import { EmitirNotaDebitoSchema, type EmitirNotaDebitoInput } from '@/lib/validations/faturacao';
import { NATUREZAS_NOTA_DEBITO, ROTULO_NATUREZA_ND, rotuloContaPGC } from '@/lib/nota-debito';

type Natureza = (typeof NATUREZAS_NOTA_DEBITO)[number];

interface ClienteOption { id: string; nome: string }

/** Por natureza: a conta por omissão do tenant (ou nenhuma) e a primeira página da classe admitida. */
export interface ContasNatureza {
  natureza: Natureza;
  omissaoId: string | null;
  opcoes: ComboboxOption[];
}

interface NovaNotaDebitoFormProps {
  clientes: ClienteOption[];
  contasPorNatureza: ContasNatureza[];
  /** Dia civil de Maputo (`aaaa-mm-dd`), calculado no servidor (#242). */
  hoje: string;
}

const SEM_FATURA = 'sem-fatura';
const OPCAO_SEM_FATURA: ComboboxOption = { value: SEM_FATURA, label: 'Sem factura de referência' };

const MOTIVOS = [
  'Serviços adicionais não faturados',
  'Actualização contratual',
  'Correcção de preço',
  'Custos logísticos adicionais',
  'Outro',
];

export function NovaNotaDebitoForm({ clientes, contasPorNatureza, hoje }: NovaNotaDebitoFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const contasDe = (n: Natureza) => contasPorNatureza.find((c) => c.natureza === n);

  const form = useForm<EmitirNotaDebitoInput>({
    resolver: zodResolver(EmitirNotaDebitoSchema),
    defaultValues: {
      moeda: 'MZN',
      natureza: 'ACERTO_PRECO',
      contaCreditoId: contasDe('ACERTO_PRECO')?.omissaoId ?? undefined,
      // O dia que o campo mostra está no estado desde o início (#242).
      dataEmissao: diaIsoParaData(hoje),
      linhas: [{ descricao: '', quantidade: 1, precoUnitario: 0, desconto: 0, taxaIva: 0.16, ordemLinha: 0, subtotal: 0, ivaItem: 0, total: 0 }],
    },
    mode: 'onBlur',
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'linhas' });

  const natureza = useWatch({ control: form.control, name: 'natureza' });
  const clienteId = useWatch({ control: form.control, name: 'clienteId' });
  const contasNatureza = contasDe(natureza);
  const contaObrigatoria = !contasNatureza?.omissaoId;

  // Primeira página das facturas do cliente escolhido, carregada ao escolhê-lo
  // (a combobox nunca pesquisa com termo vazio). Só vale para o cliente a que pertence.
  const [faturasIniciais, setFaturasIniciais] = useState<{ clienteId: string; opcoes: ComboboxOption[] } | null>(null);
  const opcoesFaturas = faturasIniciais && faturasIniciais.clienteId === clienteId ? faturasIniciais.opcoes : null;

  const procurarContas = async (q: string): Promise<ComboboxOption[] | null> => {
    const r = await procurarContasCreditoNotaDebito({ natureza, q });
    return r.ok ? r.data.map((c) => ({ value: c.id, label: rotuloContaPGC(c) })) : null;
  };

  const procurarFaturas = async (q: string): Promise<ComboboxOption[] | null> => {
    if (!clienteId) return null;
    const r = await procurarFaturasParaNotaDebito({ clienteId, q });
    return r.ok ? [OPCAO_SEM_FATURA, ...r.data.map((f) => ({ value: f.id, label: f.rotulo }))] : null;
  };

  const mudarCliente = (novo: string, onChange: (v: string) => void) => {
    onChange(novo);
    // A factura de referência é do cliente: muda o cliente, apaga-se.
    form.setValue('faturaReferenciaId', undefined);
    void procurarFaturasParaNotaDebito({ clienteId: novo }).then((r) => {
      if (r.ok) {
        setFaturasIniciais({
          clienteId: novo,
          opcoes: [OPCAO_SEM_FATURA, ...r.data.map((f) => ({ value: f.id, label: f.rotulo }))],
        });
      }
    });
  };

  const mudarNatureza = (nova: Natureza, onChange: (v: Natureza) => void) => {
    onChange(nova);
    // A conta é da natureza: repõe a omissão da nova (ou nenhuma).
    form.setValue('contaCreditoId', contasDe(nova)?.omissaoId ?? undefined, { shouldValidate: false });
    form.clearErrors('contaCreditoId');
  };

  const onSubmit = form.handleSubmit((data) => {
    if (contaObrigatoria && !data.contaCreditoId) {
      form.setError('contaCreditoId', {
        type: 'manual',
        message: 'Esta natureza não tem conta por omissão: escolha a conta a crédito.',
      });
      return;
    }
    // Dentro de uma transição (regra da casa): a navegação no fim aplica-se.
    startTransition(async () => {
      const res = await emitirNotaDebito(data);
      if (!res.ok) {
        const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        if (details?.fieldErrors) {
          Object.entries(details.fieldErrors).forEach(([field, messages]) => {
            form.setError(field as keyof EmitirNotaDebitoInput, { type: 'server', message: messages[0] });
          });
        } else if (res.error.code === 'CONTA_CREDITO_OBRIGATORIA' || res.error.code === 'CONTA_NATUREZA_INVALIDA') {
          form.setError('contaCreditoId', { type: 'server', message: res.error.message });
        } else {
          toast.error(res.error.message ?? 'Ocorreu um erro ao emitir a nota de débito.');
        }
        return;
      }
      toast.success('Nota de débito emitida com sucesso!');
      router.push('/vendas/notas-debito');
    });
  });
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
              name="clienteId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente *</FormLabel>
                  <FormControl>
                    <Combobox
                      value={field.value}
                      onChange={(v) => mudarCliente(v, field.onChange)}
                      placeholder="Seleccionar cliente…"
                      options={clientes.map((c) => ({ value: c.id, label: c.nome }))}
                    />
                  </FormControl>
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
                    <CampoDia value={field.value} onChange={field.onChange} onBlur={field.onBlur} name={field.name} />
                  </FormControl>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground">
                    Numerada na série activa de nota de débito do ano da data de emissão.
                  </p>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="natureza"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Natureza *</FormLabel>
                  <Select onValueChange={(v) => mudarNatureza(v as Natureza, field.onChange)} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar natureza…">{ROTULO_NATUREZA_ND[field.value]}</SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {NATUREZAS_NOTA_DEBITO.map((n) => (
                        <SelectItem key={n} value={n}>{ROTULO_NATUREZA_ND[n]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contaCreditoId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{contaObrigatoria ? 'Conta a crédito *' : 'Conta a crédito'}</FormLabel>
                  <FormControl>
                    <ComboboxRemoto
                      // As opções iniciais são da natureza: outra natureza, outra combobox.
                      key={natureza}
                      opcoesIniciais={contasNatureza?.opcoes ?? []}
                      procurar={procurarContas}
                      value={field.value ?? ''}
                      onChange={(v) => field.onChange(v || undefined)}
                      placeholder="Seleccionar conta…"
                      searchPlaceholder="Pesquisar por código ou nome…"
                      emptyText="Nenhuma conta encontrada"
                    />
                  </FormControl>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground">
                    {natureza === 'DESPESAS_REPERCUTIDAS'
                      ? 'Conta de gasto (classe 6) que a despesa repercutida recupera.'
                      : 'Conta de rendimento (classe 7) creditada pelo valor sem IVA.'}
                  </p>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="faturaReferenciaId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Factura de referência</FormLabel>
                  <FormControl>
                    <ComboboxRemoto
                      // As opções iniciais são do cliente: outro cliente, outra combobox.
                      key={`${clienteId ?? ''}:${opcoesFaturas ? 'carregadas' : 'vazias'}`}
                      opcoesIniciais={opcoesFaturas ?? [OPCAO_SEM_FATURA]}
                      procurar={procurarFaturas}
                      value={field.value ?? SEM_FATURA}
                      onChange={(v) => field.onChange(v === SEM_FATURA || !v ? undefined : v)}
                      placeholder={clienteId ? OPCAO_SEM_FATURA.label : 'Escolha primeiro o cliente'}
                      searchPlaceholder="Pesquisar pelo número…"
                      emptyText="Nenhuma factura deste cliente"
                      disabled={!clienteId}
                    />
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
