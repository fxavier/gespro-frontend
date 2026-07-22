'use client';

/**
 * Formulário de novo lançamento contabilístico com editor de partidas inline.
 *
 * REGRAS:
 * - Débito = Crédito validado ao vivo ANTES de submeter (bloqueia submit se desequilibrado)
 * - Mínimo 2 partidas (1 débito + 1 crédito)
 * - react-hook-form + zodResolver + useActionState
 * - UnsavedChangesGuard activo
 */

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, Trash2, Save, X, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { criarLancamento } from '@/server/actions/contabilidade.actions';
import {
  CriarLancamentoSchema,
  type CriarLancamentoInput,
  type PartidaInput,
} from '@/lib/validations/contabilidade';
import { cn } from '@/lib/utils';

// Tipo inline para evitar importar server-only de services
type FormState =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

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

interface NovoLancamentoFormProps {
  contas: ContaOpcao[];
  diarios: DiarioOpcao[];
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

export function NovoLancamentoForm({ contas, diarios }: NovoLancamentoFormProps) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, CriarLancamentoInput>(
    (_prev, data) => criarLancamento(data),
    null
  );

  const form = useForm<CriarLancamentoInput>({
    resolver: zodResolver(CriarLancamentoSchema),
    defaultValues: DEFAULT_VALUES,
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

  // Aplicar erros do servidor
  useEffect(() => {
    if (!state) return;
    if (!state.ok) {
      const details = state.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof CriarLancamentoInput, {
            type: 'server',
            message: messages[0],
          });
        });
      } else {
        toast.error(state.error.message ?? 'Erro ao criar lançamento.');
      }
    } else {
      toast.success('Lançamento criado com sucesso!');
      router.push('/contabilidade/lancamentos');
      router.refresh();
    }
  }, [state, form, router]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));

  const isDirty = form.formState.isDirty;

  const handleCancel = () => {
    if (isDirty && !window.confirm('Tem alterações não guardadas. Pretende sair?')) return;
    router.push('/contabilidade/lancamentos');
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
              {isPending ? 'A guardar…' : 'Guardar Lançamento'}
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
                      value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                      onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Diário */}
            <FormField
              control={form.control}
              name="diarioId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Diário *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar diário" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {diarios.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.codigo} — {d.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Seleccionar conta…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-60">
                          {contas.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              <span className="font-mono text-xs text-muted-foreground mr-2">{c.codigo}</span>
                              {c.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                            <SelectValue />
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
          {state && !state.ok && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {state.error.message}
            </div>
          )}
        </FormSection>
      </FormPage>
    </Form>
  );
}
