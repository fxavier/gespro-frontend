'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { criarContaPGC } from '@/server/actions/contabilidade.actions';
import { CriarContaPGCSchema, type CriarContaPGCInput } from '@/lib/validations/contabilidade';

export type ContaPaiOption = { id: string; label: string };

// Tipo inline — evita importar server-only num Client Component.
type FormState =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

const SEM_PAI = '__none__';

const CLASSE_LABEL: Record<CriarContaPGCInput['classe'], string> = {
  CLASSE_1: 'Classe 1 — Meios financeiros',
  CLASSE_2: 'Classe 2 — Contas a receber/pagar',
  CLASSE_3: 'Classe 3 — Existências',
  CLASSE_4: 'Classe 4 — Investimentos',
  CLASSE_5: 'Classe 5 — Capital próprio',
  CLASSE_6: 'Classe 6 — Gastos',
  CLASSE_7: 'Classe 7 — Rendimentos',
  CLASSE_8: 'Classe 8 — Resultados',
};

const TIPO_LABEL: Record<CriarContaPGCInput['tipo'], string> = {
  ATIVO: 'Ativo',
  PASSIVO: 'Passivo',
  CAPITAL_PROPRIO: 'Capital Próprio',
  RENDIMENTO: 'Rendimento',
  GASTO: 'Gasto',
  RESULTADO: 'Resultado',
};

const DEFAULT_VALUES: CriarContaPGCInput = {
  codigo: '',
  nome: '',
  classe: 'CLASSE_1',
  tipo: 'ATIVO',
  natureza: 'DEVEDORA',
  nivel: 1,
  contaPaiId: undefined,
  aceitaLancamento: false,
  descricao: '',
};

export function NovaContaForm({ contasPai }: { contasPai: ContaPaiOption[] }) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, CriarContaPGCInput>(
    (_prev, data) => criarContaPGC(data),
    null
  );

  const form = useForm<CriarContaPGCInput>({
    resolver: zodResolver(CriarContaPGCSchema),
    defaultValues: DEFAULT_VALUES,
    mode: 'onBlur',
  });

  useEffect(() => {
    if (!state) return;

    if (!state.ok) {
      const details = state.error.details as
        | { fieldErrors?: Record<string, string[]> }
        | undefined;

      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof CriarContaPGCInput, {
            type: 'server',
            message: messages[0],
          });
        });
      } else {
        toast.error(state.error.message ?? 'Ocorreu um erro ao criar a conta.');
      }
    } else {
      toast.success('Conta criada com sucesso!');
      form.reset(DEFAULT_VALUES);
      router.push('/contabilidade/plano-contas');
    }
  }, [state, form, router]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));
  const isDirty = form.formState.isDirty;

  const handleCancel = () => {
    if (isDirty && !window.confirm('Tem alterações não guardadas. Pretende sair?')) return;
    router.push('/contabilidade/plano-contas');
  };

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={isDirty} />

      <FormPage
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isPending}
            >
              <X className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A guardar...' : 'Guardar Conta'}
            </Button>
          </>
        }
      >
        <FormSection title="Identificação" description="Código e designação da conta">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="codigo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código</FormLabel>
                  <FormControl>
                    <Input placeholder="ex.: 1.1.1" maxLength={20} {...field} />
                  </FormControl>
                  <FormDescription>Formato PGC (ex.: 1.1.1)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nivel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nível</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={4}
                      className="tabular-nums"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 1)}
                    />
                  </FormControl>
                  <FormDescription>1 a 4</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="nome"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl>
                  <Input placeholder="ex.: Caixa" maxLength={200} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection title="Classificação" description="Classe PGC, tipo e natureza">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="classe"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Classe</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar classe" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(CLASSE_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(TIPO_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="natureza"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Natureza</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar natureza" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="DEVEDORA">Devedora</SelectItem>
                      <SelectItem value="CREDORA">Credora</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contaPaiId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conta Pai</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(v === SEM_PAI ? undefined : v)}
                    value={field.value ?? SEM_PAI}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Nenhuma (conta raiz)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={SEM_PAI}>Nenhuma (conta raiz)</SelectItem>
                      {contasPai.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Opcional — para contas de detalhe</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="aceitaLancamento"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Aceita Lançamentos</FormLabel>
                  <FormDescription>
                    Só contas de movimento (folhas) aceitam lançamentos directos.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="descricao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Notas adicionais (opcional)"
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

        {state && !state.ok && !state.error.details && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {state.error.message}
          </div>
        )}
      </FormPage>
    </Form>
  );
}