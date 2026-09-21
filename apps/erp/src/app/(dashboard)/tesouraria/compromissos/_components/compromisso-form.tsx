'use client';

/**
 * Formulário de Compromisso de Tesouraria — CLIENT COMPONENT partilhado
 * entre `/novo` e `/[id]/editar`.
 *
 * Padrão golden standard (`nova-requisicao-form`): react-hook-form +
 * zodResolver com o MESMO schema de `src/lib/validations/tesouraria`,
 * submissão via Server Action com `useActionState`, erros de servidor
 * mapeados por campo com `setError`, `UnsavedChangesGuard`, toasts só para
 * resultado global. As actions NÃO redireccionam — a navegação é feita cá
 * com `router.push` depois do `ok` (evita a armadilha do `redirect()` fora
 * de transição).
 *
 * Datas (task 7.4-bis): `new Date('aaaa-mm-dd')` lê como UTC e a leste de
 * Greenwich cai no dia anterior, mudando o bucket — o valor do
 * `<input type="date">` é partido e reconstruído com
 * `new Date(ano, mes-1, dia, 12)`. No sentido inverso, o dia apresentado é
 * o dia civil de Maputo do instante gravado.
 */

import { startTransition, useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
import {
  FormPage,
  FormSection,
  UnsavedChangesGuard,
} from '@/components/patterns';
import {
  criarCompromissoAction,
  atualizarCompromissoAction,
} from '@/server/actions/tesouraria.actions';
import {
  CriarCompromissoSchema,
  type CriarCompromissoInput,
} from '@/lib/validations/tesouraria';
import { RECORRENCIA_LABELS } from './compromissos-table';

// Tipos inline — evita importar server-only num Client Component.
type FormState =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

const TIPO_LABELS: Record<'ENTRADA' | 'SAIDA', string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
};

// ─── Fronteira do <input type="date"> ────────────────────────────────────────

const diaCivilMaputo = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Maputo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Date → 'aaaa-mm-dd' pelo dia civil de Maputo (a régua fiscal da casa). */
function paraInputDate(v: Date | string | null | undefined): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? '' : diaCivilMaputo.format(d);
}

/** 'aaaa-mm-dd' → Date ao meio-dia local — nunca `new Date('aaaa-mm-dd')`. */
function deInputDate(s: string): Date | undefined {
  if (!s) return undefined;
  const [ano, mes, dia] = s.split('-').map(Number);
  if (!ano || !mes || !dia) return undefined;
  return new Date(ano, mes - 1, dia, 12);
}

// ─── Componente ──────────────────────────────────────────────────────────────

export interface CompromissoFormDefaults {
  descricao: string;
  tipo: 'ENTRADA' | 'SAIDA';
  /** `Decimal` serializado (string) na fronteira SC→CC. */
  valor: string;
  dataPrevista: string; // ISO
  recorrencia: 'UNICA' | 'MENSAL' | 'TRIMESTRAL' | 'ANUAL';
  dataFimRecorrencia: string | null; // ISO
  observacoes: string | null;
  ativo: boolean;
}

interface CompromissoFormProps {
  modo: 'criar' | 'editar';
  id?: string;
  defaults?: CompromissoFormDefaults;
}

export function CompromissoForm({ modo, id, defaults }: CompromissoFormProps) {
  const router = useRouter();
  const [ativo, setAtivo] = useState(defaults?.ativo ?? true);

  const [state, dispatch, isPending] = useActionState<
    FormState,
    CriarCompromissoInput
  >((_prev, data) => {
    if (modo === 'editar' && id) {
      return atualizarCompromissoAction({
        id,
        ...data,
        ativo,
        // R3.3/5.1-bis: passar a UNICA limpa explicitamente o fim gravado —
        // `null` limpa, `undefined` seria «não mexer».
        dataFimRecorrencia:
          data.recorrencia === 'UNICA' ? null : data.dataFimRecorrencia,
      });
    }
    return criarCompromissoAction(data);
  }, null);

  const form = useForm<CriarCompromissoInput>({
    resolver: zodResolver(CriarCompromissoSchema),
    defaultValues: defaults
      ? {
          descricao: defaults.descricao,
          tipo: defaults.tipo,
          valor: parseFloat(defaults.valor),
          dataPrevista: new Date(defaults.dataPrevista),
          recorrencia: defaults.recorrencia,
          dataFimRecorrencia: defaults.dataFimRecorrencia
            ? new Date(defaults.dataFimRecorrencia)
            : undefined,
          observacoes: defaults.observacoes ?? '',
        }
      : {
          descricao: '',
          tipo: 'SAIDA',
          recorrencia: 'UNICA',
          observacoes: '',
        },
    mode: 'onBlur',
  });

  // Aplicar erros do servidor nos campos; navegar no sucesso.
  useEffect(() => {
    if (!state) return;

    if (!state.ok) {
      const details = state.error.details as
        | { fieldErrors?: Record<string, string[]> }
        | undefined;

      if (details?.fieldErrors && Object.keys(details.fieldErrors).length > 0) {
        Object.entries(details.fieldErrors).forEach(([campo, mensagens]) => {
          form.setError(campo as keyof CriarCompromissoInput, {
            type: 'server',
            message: mensagens[0],
          });
        });
      } else {
        toast.error(
          state.error.message ?? 'Ocorreu um erro ao guardar o compromisso.',
        );
      }
    } else {
      toast.success(
        modo === 'criar' ? 'Compromisso criado.' : 'Compromisso actualizado.',
      );
      router.push('/tesouraria/compromissos');
    }
  }, [state, form, router, modo]);

  // O handleSubmit corre FORA de transição — sem startTransition o React
  // avisa na consola e o isPending nunca actualiza (regra inviolável da casa).
  const onSubmit = form.handleSubmit((data) =>
    startTransition(() => dispatch(data)),
  );

  const recorrencia = form.watch('recorrencia');
  const isDirty =
    form.formState.isDirty || (modo === 'editar' && ativo !== defaults?.ativo);

  const handleCancel = () => {
    if (isDirty) {
      const confirmado = window.confirm(
        'Tem alterações não guardadas. Tem a certeza que pretende sair?',
      );
      if (!confirmado) return;
    }
    router.push('/tesouraria/compromissos');
  };

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={isDirty} />

      <form onSubmit={onSubmit} noValidate>
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
              <Button type="submit" size="sm" disabled={isPending}>
                <Save className="h-4 w-4 mr-1.5" />
                {isPending ? 'A guardar…' : 'Guardar'}
              </Button>
            </>
          }
        >
          <FormSection
            title="Compromisso"
            description="Obrigação ou direito datado que entra na projecção de tesouraria"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="descricao"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Descrição *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ex.: Renda do armazém"
                        maxLength={255}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccione o tipo">
                            {field.value ? TIPO_LABELS[field.value] : undefined}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ENTRADA">Entrada</SelectItem>
                        <SelectItem value="SAIDA">Saída</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="valor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor (MT) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        inputMode="decimal"
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const n = e.target.valueAsNumber;
                          field.onChange(Number.isNaN(n) ? undefined : n);
                        }}
                        onBlur={field.onBlur}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dataPrevista"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data prevista *</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        value={paraInputDate(field.value)}
                        onChange={(e) =>
                          field.onChange(deInputDate(e.target.value))
                        }
                        onBlur={field.onBlur}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="recorrencia"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recorrência</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        if (v === 'UNICA') {
                          // R3.3: compromisso único não admite fim de
                          // recorrência — limpar antes que o schema recuse.
                          form.setValue('dataFimRecorrencia', undefined, {
                            shouldDirty: true,
                          });
                        }
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccione a recorrência">
                            {field.value
                              ? RECORRENCIA_LABELS[field.value]
                              : undefined}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(
                          Object.entries(RECORRENCIA_LABELS) as [
                            CriarCompromissoInput['recorrencia'],
                            string,
                          ][]
                        ).map(([valor, label]) => (
                          <SelectItem key={valor} value={valor}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      As recorrências expandem-se dentro do horizonte da
                      projecção; nada é materializado.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {recorrencia !== 'UNICA' && (
                <FormField
                  control={form.control}
                  name="dataFimRecorrencia"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fim da recorrência</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          value={paraInputDate(field.value)}
                          onChange={(e) =>
                            field.onChange(deInputDate(e.target.value))
                          }
                          onBlur={field.onBlur}
                        />
                      </FormControl>
                      <FormDescription>
                        Opcional — sem fim, a recorrência expande até ao limite
                        do horizonte pedido.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="observacoes"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        maxLength={500}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {modo === 'editar' && (
                <div className="flex items-center gap-3 md:col-span-2">
                  <Switch
                    id="compromisso-ativo"
                    checked={ativo}
                    onCheckedChange={setAtivo}
                  />
                  <Label htmlFor="compromisso-ativo">
                    Activo — entra na projecção
                  </Label>
                </div>
              )}
            </div>
          </FormSection>
        </FormPage>
      </form>
    </Form>
  );
}
