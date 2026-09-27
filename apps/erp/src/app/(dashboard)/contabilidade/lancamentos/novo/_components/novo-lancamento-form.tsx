'use client';

/**
 * Formulário de lançamento contabilístico com editor de partidas inline — cria
 * um lançamento novo ou, com `edicao`, edita um RASCUNHO (#137).
 *
 * REGRAS:
 * - Débito = Crédito validado ao vivo ANTES de submeter (bloqueia submit se desequilibrado)
 * - Mínimo 2 partidas (1 débito + 1 crédito)
 * - react-hook-form + zodResolver com o schema da action (criar ou editar)
 * - submissão por `useTransition` + action + navegação (padrão da casa)
 * - Em edição: diário só de leitura (o número pertence-lhe) e data limitada ao
 *   mês do período do lançamento
 * - UnsavedChangesGuard activo
 */

import { useState, useTransition } from 'react';
import { diaIsoParaData, dataParaDiaIso } from '@/lib/format-date';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, Trash2, Save, X, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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
  FormDescription,
} from '@/components/ui/form';
import { FormPage, FormSection, UnsavedChangesGuard, Combobox } from '@/components/patterns';
import { criarLancamento, editarLancamento } from '@/server/actions/contabilidade.actions';
import {
  CriarLancamentoSchema,
  EditarLancamentoSchema,
  type CriarLancamentoInput,
  type EditarLancamentoInput,
  type PartidaInput,
} from '@/lib/validations/contabilidade';
import { navegarDepoisDaAccao } from '@/lib/navegar-depois-da-accao';
import { cn } from '@/lib/utils';

// Tipo inline para evitar importar server-only de services
type ErroServidor = { code: string; message: string; details?: unknown } | null;

/** Os valores do formulário: os do criar, mais o `id` quando se edita. */
type FormValues = CriarLancamentoInput & { id?: string };

interface ContaOpcao {
  id: string;
  codigo: string;
  nome: string;
}

interface DiarioOpcao {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
}

/** Modo edição de um rascunho (#137): o que não se pode mudar vem daqui. */
export interface EdicaoLancamento {
  id: string;
  /** Rótulo do diário, mostrado só para leitura. */
  diario: string;
  /** Limites `aaaa-mm-dd` da data: o mês do período do lançamento. */
  dataMin?: string;
  dataMax?: string;
}

interface NovoLancamentoFormProps {
  contas: ContaOpcao[];
  diarios: DiarioOpcao[];
  /** Pré-preenchimento vindo de outro ecrã (ex.: sugestão da reconciliação bancária). */
  valoresIniciais?: {
    data?: string;
    historico?: string;
    observacoes?: string;
    partidas?: PartidaInput[];
  };
  /** Presente ⇒ edita o rascunho em vez de criar um lançamento novo. */
  edicao?: EdicaoLancamento;
}

const DEFAULT_PARTIDA: PartidaInput = {
  contaId: '',
  tipo: 'DEBITO',
  valor: 0,
  historico: '',
};

const DEFAULT_VALUES: CriarLancamentoInput = {
  data: new Date(),
  diarioId: '',
  origem: 'MANUAL',
  historico: '',
  partidas: [
    { ...DEFAULT_PARTIDA, tipo: 'DEBITO' },
    { ...DEFAULT_PARTIDA, tipo: 'CREDITO' },
  ],
  observacoes: '',
};

const formatMZN = (v: number) =>
  `MT ${v.toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function NovoLancamentoForm({ contas, diarios, valoresIniciais, edicao }: NovoLancamentoFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [erroServidor, setErroServidor] = useState<ErroServidor>(null);
  const destinoCancelar = edicao ? `/contabilidade/lancamentos/${edicao.id}` : '/contabilidade/lancamentos';

  // O mesmo schema que a action valida: criar, ou editar (sem diário nem origem, com id).
  const resolver = (
    edicao ? zodResolver(EditarLancamentoSchema) : zodResolver(CriarLancamentoSchema)
  ) as unknown as Resolver<FormValues>;

  const form = useForm<FormValues>({
    resolver,
    defaultValues: {
      ...DEFAULT_VALUES,
      ...(edicao && { id: edicao.id }),
      ...(valoresIniciais?.data && { data: diaIsoParaData(valoresIniciais.data) }),
      ...(valoresIniciais?.historico && { historico: valoresIniciais.historico }),
      ...(valoresIniciais?.observacoes && { observacoes: valoresIniciais.observacoes }),
      ...(valoresIniciais?.partidas && { partidas: valoresIniciais.partidas }),
    },
    mode: 'onChange',
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'partidas',
  });

  // Watch partidas para calcular totais ao vivo
  const partidas = useWatch({ control: form.control, name: 'partidas' }) ?? [];

  const totalDebito = partidas
    .filter((p) => p.tipo === 'DEBITO')
    .reduce((acc, p) => acc + (Number(p.valor) || 0), 0);

  const totalCredito = partidas
    .filter((p) => p.tipo === 'CREDITO')
    .reduce((acc, p) => acc + (Number(p.valor) || 0), 0);

  const diferenca = Math.abs(totalDebito - totalCredito);
  const equilibrado = diferenca < 0.005;

  const onSubmit = form.handleSubmit((data) => {
    startTransition(async () => {
      setErroServidor(null);
      // Com `edicao`, o resolver já devolveu a forma do EditarLancamentoSchema.
      const res = edicao
        ? await editarLancamento(data as unknown as EditarLancamentoInput)
        : await criarLancamento(data);

      if (!res.ok) {
        const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        if (!details?.fieldErrors) setErroServidor(res.error);
        if (details?.fieldErrors) {
          Object.entries(details.fieldErrors).forEach(([field, messages]) => {
            form.setError(field as keyof FormValues, {
              type: 'server',
              message: messages[0],
            });
          });
        } else {
          toast.error(
            res.error.message ?? (edicao ? 'Erro ao guardar o lançamento.' : 'Erro ao criar lançamento.'),
          );
        }
        return;
      }

      toast.success(edicao ? 'Lançamento actualizado.' : 'Lançamento criado com sucesso!');
      await navegarDepoisDaAccao(router, destinoCancelar);
    });
  });

  const isDirty = form.formState.isDirty;

  const handleCancel = () => {
    if (isDirty && !window.confirm('Tem alterações não guardadas. Pretende sair?')) return;
    router.push(destinoCancelar);
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
            <Button type="submit" size="sm" disabled={isPending || !equilibrado} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A guardar…' : edicao ? 'Guardar alterações' : 'Guardar Lançamento'}
            </Button>
          </>
        }
      >
        {/* ─── Informações Gerais ─────────────────────────────────── */}
        <FormSection title="Informações Gerais" description="Dados principais do lançamento">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Data */}
            <FormField
              control={form.control}
              name="data"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data do Lançamento *</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      min={edicao?.dataMin}
                      max={edicao?.dataMax}
                      value={dataParaDiaIso(field.value)}
                      onChange={(e) => field.onChange(e.target.value ? diaIsoParaData(e.target.value) : undefined)}
                    />
                  </FormControl>
                  {edicao && (
                    <FormDescription>
                      Só dentro do mês do lançamento — o período não muda ao editar.
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Diário — em edição só se lê: o número pertence ao diário */}
            {edicao ? (
              <div className="space-y-2">
                <Label htmlFor="diario-leitura">Diário</Label>
                <Input id="diario-leitura" value={edicao.diario} readOnly disabled />
                <p className="text-sm text-muted-foreground">
                  O diário não muda: o número do lançamento pertence-lhe.
                </p>
              </div>
            ) : (
              <FormField
                control={form.control}
                name="diarioId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Diário *</FormLabel>
                    <FormControl>
                      <Combobox
                        defaultValue={field.value}
                        onChange={field.onChange}
                        placeholder="Seleccionar diário"
                        options={diarios.map((d) => ({ value: d.id, label: `${d.codigo} — ${d.nome}` }))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>

          {/* Histórico */}
          <FormField
            control={form.control}
            name="historico"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Histórico *</FormLabel>
                <FormControl>
                  <Input placeholder="Descrição do lançamento" {...field} />
                </FormControl>
                <FormDescription>Descrição que identifica o lançamento no razão</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Observações */}
          <FormField
            control={form.control}
            name="observacoes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Observações</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Observações adicionais (opcional)…"
                    className="resize-none min-h-[80px]"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        {/* ─── Editor de Partidas ─────────────────────────────────── */}
        <FormSection
          title="Partidas (Débito = Crédito)"
          description="Registar as partidas da escrita dobrada — a soma dos débitos deve ser igual à soma dos créditos"
        >
          {/* Tabela de partidas */}
          <div className="space-y-2">
            {/* Cabeçalho */}
            <div className="hidden sm:grid sm:grid-cols-[1fr_auto_120px_1fr_auto] gap-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <span>Conta</span>
              <span className="w-28">Tipo</span>
              <span className="text-right">Valor (MZN)</span>
              <span>Histórico da partida</span>
              <span className="w-8" />
            </div>

            {fields.map((fieldItem, index) => (
              <div
                key={fieldItem.id}
                className="grid grid-cols-1 sm:grid-cols-[1fr_auto_120px_1fr_auto] gap-2 items-start border rounded-lg p-3"
              >
                {/* Conta */}
                <FormField
                  control={form.control}
                  name={`partidas.${index}.contaId`}
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs sm:sr-only">Conta</FormLabel>
                      <FormControl>
                        <Combobox
                          className="h-8 text-sm"
                          defaultValue={field.value}
                          onChange={field.onChange}
                          placeholder="Seleccionar conta…"
                          options={contas.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` }))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Tipo */}
                <FormField
                  control={form.control}
                  name={`partidas.${index}.tipo`}
                  render={({ field }) => (
                    <FormItem className="space-y-1 w-28">
                      <FormLabel className="text-xs sm:sr-only">Tipo</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-8 text-sm">
                            {/* Rótulo explícito: o Radix só o resolve depois de a lista abrir. */}
                            <SelectValue>
                              {field.value === 'CREDITO' ? (
                                <span className="text-success font-medium">C — Crédito</span>
                              ) : (
                                <span className="text-info font-medium">D — Débito</span>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="DEBITO">
                            <span className="text-info font-medium">D — Débito</span>
                          </SelectItem>
                          <SelectItem value="CREDITO">
                            <span className="text-success font-medium">C — Crédito</span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Valor */}
                <FormField
                  control={form.control}
                  name={`partidas.${index}.valor`}
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs sm:sr-only">Valor</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          className="h-8 tabular-nums text-right"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Histórico da partida */}
                <FormField
                  control={form.control}
                  name={`partidas.${index}.historico`}
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs sm:sr-only">Histórico</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Histórico da partida (opcional)…"
                          className="h-8 text-sm"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Remover */}
                <div className="flex items-center justify-end w-8">
                  {fields.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => remove(index)}
                      aria-label={`Remover partida ${index + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Botão adicionar partida */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => append({ ...DEFAULT_PARTIDA })}
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Partida
          </Button>

          {/* Totais ao vivo */}
          <Separator />
          <div className="bg-muted/30 rounded-lg p-4 space-y-2">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-info font-medium">Total Débitos:</span>
                <span className="tabular-nums font-bold text-info">{formatMZN(totalDebito)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-success font-medium">Total Créditos:</span>
                <span className="tabular-nums font-bold text-success">{formatMZN(totalCredito)}</span>
              </div>
            </div>

            <Separator />

            <div className={cn(
              'flex items-center justify-between rounded-lg px-3 py-2',
              equilibrado ? 'bg-success/10 border border-success/30' : 'bg-destructive/10 border border-destructive/30'
            )}>
              {equilibrado ? (
                <>
                  <span className="text-success text-sm font-medium flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Lançamento equilibrado
                  </span>
                  <span className="tabular-nums text-success font-bold text-sm">
                    {formatMZN(0)}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-destructive text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Diferença (bloqueia submissão)
                  </span>
                  <span className="tabular-nums text-destructive font-bold text-sm">
                    {formatMZN(diferenca)}
                  </span>
                </>
              )}
            </div>

            {!equilibrado && fields.length >= 2 && (
              <p className="text-xs text-destructive">
                A soma dos débitos deve ser igual à soma dos créditos. Diferença actual: {formatMZN(diferenca)}.
              </p>
            )}
          </div>

          {/* Erro global do servidor */}
          {erroServidor && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {erroServidor.message}
            </div>
          )}
        </FormSection>
      </FormPage>
    </Form>
  );
}
