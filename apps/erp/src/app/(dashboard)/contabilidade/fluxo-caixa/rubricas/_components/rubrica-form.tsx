'use client';

/**
 * Formulário de rubrica (nova / editar). O MESMO schema do servidor
 * (`CriarRubricaSchema`, mais `ativo` na edição). Submissão por
 * `useTransition` + `router.push` (CLAUDE.md: formulário cuja action muda o
 * que a página mostra; `handleSubmit` fora de transição).
 *
 * Na edição: o código de uma rubrica SISTEMA e a actividade da rubrica de
 * caixa não se alteram (o serviço recusa); aqui ficam só de leitura.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { criarRubricaAction, editarRubricaAction } from '@/server/actions/fluxo-caixa.actions';
import { CriarRubricaSchema, type AtividadeFluxo, type SinalFluxo } from '@/lib/validations/fluxo-caixa';
import type { CodigoErroDFC } from '@/server/services/financas/dfc.interface';
import { ATIVIDADES_ESCOLHIVEIS, ROTA_RUBRICAS, ROTULO_ATIVIDADE, ROTULO_SINAL, SINAIS } from './rotulos';

const RubricaFormSchema = CriarRubricaSchema.extend({ ativo: z.boolean() });
type RubricaFormValores = z.input<typeof RubricaFormSchema>;

export interface RubricaEditavel {
  id: string;
  codigo: string;
  designacao: string;
  atividade: AtividadeFluxo;
  sinal: SinalFluxo;
  ordem: number;
  ativo: boolean;
  origem: 'SISTEMA' | 'TENANT';
}

export function RubricaForm({ rubrica, voltar }: { rubrica?: RubricaEditavel; voltar: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const destino = voltar ?? ROTA_RUBRICAS;
  const codigoFixo = rubrica?.origem === 'SISTEMA';
  const atividadeFixa = rubrica?.atividade === 'CAIXA';

  const form = useForm<RubricaFormValores>({
    resolver: zodResolver(RubricaFormSchema),
    defaultValues: {
      codigo: rubrica?.codigo ?? '',
      designacao: rubrica?.designacao ?? '',
      atividade: rubrica?.atividade ?? 'OPERACIONAL',
      sinal: rubrica?.sinal ?? 'VARIACAO',
      ordem: rubrica?.ordem ?? 0,
      ativo: rubrica?.ativo ?? true,
    },
    mode: 'onBlur',
  });

  const onSubmit = form.handleSubmit((valores) => {
    const dados = RubricaFormSchema.parse(valores);
    startTransition(async () => {
      const res = rubrica
        ? await editarRubricaAction({
            id: rubrica.id,
            ...(codigoFixo ? {} : { codigo: dados.codigo }),
            designacao: dados.designacao,
            ...(atividadeFixa ? {} : { atividade: dados.atividade }),
            sinal: dados.sinal,
            ordem: dados.ordem,
            ativo: dados.ativo,
          })
        : await criarRubricaAction({
            codigo: dados.codigo,
            designacao: dados.designacao,
            atividade: dados.atividade,
            sinal: dados.sinal,
            ordem: dados.ordem,
          });
      if (!res.ok) {
        const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        // Erros de regra que pertencem a um campo aparecem nesse campo, não num
        // toast que desaparece: o utilizador vê onde corrigir.
        const codigo = res.error.code as CodigoErroDFC | string;
        if (details?.fieldErrors) {
          for (const [campo, msgs] of Object.entries(details.fieldErrors)) {
            form.setError(campo as keyof RubricaFormValores, { type: 'server', message: msgs[0] });
          }
        } else if (codigo === 'RUBRICA_CODIGO_DUPLICADO') {
          form.setError('codigo', { type: 'server', message: res.error.message }, { shouldFocus: true });
        } else if (codigo === 'RUBRICA_COM_CONTAS') {
          form.setError('ativo', { type: 'server', message: res.error.message });
        } else {
          toast.error(res.error.message);
        }
        return;
      }
      toast.success(rubrica ? 'Rubrica actualizada.' : 'Rubrica criada.');
      form.reset(valores);
      router.push(destino);
      router.refresh();
    });
  });

  const atividadeEscolhida = useWatch({ control: form.control, name: 'atividade' }) as AtividadeFluxo;
  const sinalEscolhido = useWatch({ control: form.control, name: 'sinal' }) as SinalFluxo;

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !isPending} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => router.push(destino)}>
              <X className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {isPending ? 'A guardar…' : 'Guardar'}
            </Button>
          </>
        }
      >
        <FormSection
          title="Rubrica"
          description="Uma linha da DFC: a actividade decide a secção; o sinal, como a variação se lê."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="codigo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código</FormLabel>
                  <FormControl>
                    <Input className="font-mono uppercase" placeholder="ex.: OP-10" disabled={codigoFixo} {...field} />
                  </FormControl>
                  <FormDescription>
                    {codigoFixo ? 'O código de uma rubrica de sistema não se altera.' : 'Formato XX-00, em maiúsculas.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="designacao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Designação</FormLabel>
                  <FormControl>
                    <Input placeholder="ex.: Pagamentos ao pessoal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="atividade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Actividade</FormLabel>
                  {atividadeFixa ? (
                    <>
                      <Input value={ROTULO_ATIVIDADE.CAIXA} disabled readOnly />
                      <FormDescription>A rubrica de caixa é única e não muda de actividade.</FormDescription>
                    </>
                  ) : (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar actividade">
                            {ROTULO_ATIVIDADE[atividadeEscolhida]}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ATIVIDADES_ESCOLHIVEIS.map((a) => (
                          <SelectItem key={a} value={a}>
                            {ROTULO_ATIVIDADE[a]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sinal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sinal</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar sinal">{ROTULO_SINAL[sinalEscolhido]}</SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SINAIS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {ROTULO_SINAL[s]}
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
              name="ordem"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ordem</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={9999}
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={String(field.value ?? '')}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                  </FormControl>
                  <FormDescription>Posição da rubrica dentro da actividade.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {rubrica && (
              <FormField
                control={form.control}
                name="ativo"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Activa</FormLabel>
                      <FormDescription>
                        Uma rubrica com contas mapeadas não se desactiva: reatribua-as primeiro.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        </FormSection>
      </FormPage>
    </Form>
  );
}
