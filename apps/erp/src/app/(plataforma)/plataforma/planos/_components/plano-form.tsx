'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch, type Path, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { actualizarPlano, criarPlano } from '@/server/actions/plataforma-planos.actions';
import {
  MAX_FUNCIONALIDADES,
  PlanoActualizarSchema,
  PlanoCriarSchema,
  type PlanoCriarInput,
} from '@/lib/validations/planos';
import type { PlanoSerializado } from './plano-serializado';
import { campoDoErroPlano } from './plano-erros';

/** Os valores do formulário: os de criar (o `id` só existe na edição). */
type Valores = PlanoCriarInput & { id?: string };

const VAZIO: Valores = {
  codigo: '',
  nome: '',
  descricao: '',
  precoMensalUsd: '',
  precoAnualUsd: '',
  stripePriceIdMensal: '',
  stripePriceIdAnual: '',
  limiteUtilizadores: 1,
  limiteArmazens: 1,
  suporte: '',
  funcionalidades: [],
  ordem: 0,
  destaque: false,
};

function valoresDe(p: PlanoSerializado): Valores {
  return {
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    descricao: p.descricao,
    precoMensalUsd: p.precoMensalUsd,
    precoAnualUsd: p.precoAnualUsd,
    stripePriceIdMensal: p.stripePriceIdMensal ?? '',
    stripePriceIdAnual: p.stripePriceIdAnual ?? '',
    limiteUtilizadores: p.limiteUtilizadores,
    limiteArmazens: p.limiteArmazens,
    suporte: p.suporte,
    funcionalidades: [...p.funcionalidades],
    ordem: p.ordem,
    destaque: p.destaque,
  };
}

interface PlanoFormProps {
  /** Ausente = criar; presente = editar (o código fica só de leitura). */
  plano?: PlanoSerializado;
}

/**
 * Formulário do plano (ADR-0049, #526): o MESMO schema de `lib/validations/planos` no
 * `zodResolver` e na action. Submete dentro de `startTransition` e navega com `router.push`.
 */
export function PlanoForm({ plano }: PlanoFormProps) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const edicao = !!plano;

  const form = useForm<Valores>({
    resolver: zodResolver(edicao ? PlanoActualizarSchema : PlanoCriarSchema) as unknown as Resolver<Valores>,
    defaultValues: plano ? valoresDe(plano) : VAZIO,
    mode: 'onBlur',
  });

  const funcionalidades = useWatch({ control: form.control, name: 'funcionalidades' }) ?? [];

  const mudarFuncionalidades = (lista: string[]) =>
    form.setValue('funcionalidades', lista, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });

  const mover = (i: number, d: -1 | 1) => {
    const lista = [...funcionalidades];
    const j = i + d;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    mudarFuncionalidades(lista);
  };

  const voltar = plano ? `/plataforma/planos/${plano.id}` : '/plataforma/planos';

  const onSubmit = form.handleSubmit((dados) => {
    startTransition(async () => {
      const r = edicao
        ? await actualizarPlano({ ...dados, id: plano.id, codigo: plano.codigo })
        : await criarPlano(dados);
      if (r.ok) {
        toast.success(edicao ? 'Plano guardado.' : 'Plano criado.');
        form.reset(form.getValues());
        router.push(`/plataforma/planos/${r.data.id}`);
        return;
      }
      const detalhes = r.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
      if (detalhes?.fieldErrors && Object.keys(detalhes.fieldErrors).length > 0) {
        for (const [campo, msgs] of Object.entries(detalhes.fieldErrors)) {
          form.setError(campo as Path<Valores>, { type: 'server', message: msgs[0] });
        }
      }
      const campo = campoDoErroPlano(r.error);
      if (campo) form.setError(campo, { type: 'server', message: r.error.message });
      toast.error(r.error.message ?? 'Não foi possível guardar o plano.');
    });
  });

  // Erro da LISTA (ex.: mais de 30), não de uma linha — as das linhas aparecem junto de cada uma.
  const errosFunc = form.formState.errors.funcionalidades as
    | { message?: string; root?: { message?: string } }
    | undefined;
  const erroDaLista = errosFunc?.root?.message ?? errosFunc?.message;

  const numero = (onChange: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange(e.target.value === '' ? Number.NaN : e.target.valueAsNumber);

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !pendente} />
      <form onSubmit={onSubmit} noValidate>
        <FormPage
          actions={
            <>
              <Button type="button" variant="outline" size="sm" disabled={pendente} onClick={() => router.push(voltar)}>
                <X className="h-4 w-4" aria-hidden />
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={pendente}>
                <Save className="h-4 w-4" aria-hidden />
                {pendente ? 'A guardar…' : edicao ? 'Guardar alterações' : 'Criar plano'}
              </Button>
            </>
          }
        >
          {plano && (
            <p className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              {plano.assinaturas === 0
                ? 'Nenhuma assinatura neste plano.'
                : plano.assinaturas === 1
                  ? '1 assinatura neste plano: os limites alterados valem já para ela; o preço só para subscrições novas.'
                  : `${plano.assinaturas} assinaturas neste plano: os limites alterados valem já para elas; o preço só para subscrições novas.`}
            </p>
          )}

          <FormSection title="Identificação">
            {plano ? (
              <div className="space-y-1">
                <p className="text-sm font-medium">Código do plano</p>
                <p className="font-mono text-sm">{plano.codigo}</p>
                <p className="text-sm text-muted-foreground">O código não pode ser alterado depois de criado.</p>
              </div>
            ) : (
              <FormField
                control={form.control}
                name="codigo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="off" className="font-mono" placeholder="PROFISSIONAL" />
                    </FormControl>
                    <FormDescription>
                      Maiúsculas, algarismos e _, começando por letra (2 a 31 caracteres). Não se altera depois.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
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
                    <Textarea {...field} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <FormSection
            title="Preços"
            description="Preços de exibição em USD. A cobrança usa o Price do Stripe de cada ciclo; sem Price, usa-se o da configuração do servidor."
          >
            <p className="text-sm text-muted-foreground">
              Alterar o preço ou o Price ID só afecta subscrições novas; quem já tem o plano continua no preço com que
              subscreveu.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="precoMensalUsd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preço mensal (USD)</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="decimal" placeholder="29.00" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="precoAnualUsd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preço anual (USD)</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="decimal" placeholder="290.00" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stripePriceIdMensal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price ID mensal</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} autoComplete="off" className="font-mono" placeholder="price_…" />
                    </FormControl>
                    <FormDescription>Opcional. Cada Price pertence a um só plano e ciclo.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stripePriceIdAnual"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price ID anual</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} autoComplete="off" className="font-mono" placeholder="price_…" />
                    </FormControl>
                    <FormDescription>Opcional.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </FormSection>

          <FormSection
            title="Limites e suporte"
            description="Os limites valem já para todas as assinaturas do plano, incluindo as existentes."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="limiteUtilizadores"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Limite de utilizadores</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step={1}
                        min={-1}
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={Number.isNaN(field.value) ? '' : field.value}
                        onChange={numero(field.onChange)}
                      />
                    </FormControl>
                    <FormDescription>Use -1 para ilimitado.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="limiteArmazens"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Limite de armazéns</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step={1}
                        min={-1}
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={Number.isNaN(field.value) ? '' : field.value}
                        onChange={numero(field.onChange)}
                      />
                    </FormControl>
                    <FormDescription>Use -1 para ilimitado.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="suporte"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Suporte</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Email (48h)" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <FormSection
            title="Funcionalidades"
            description={`Aparecem no site pela ordem desta lista (no máximo ${MAX_FUNCIONALIDADES}).`}
          >
            <p className="text-sm text-muted-foreground">
              Texto mostrado ao cliente no site e na facturação; não liga nem desliga módulos.
            </p>
            {funcionalidades.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem funcionalidades.</p>
            )}
            <ol className="space-y-2">
              {funcionalidades.map((_, i) => (
                <li key={i}>
                  <FormField
                    control={form.control}
                    name={`funcionalidades.${i}`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="sr-only">{`Funcionalidade ${i + 1}`}</FormLabel>
                        <div className="flex items-center gap-2">
                          <span className="w-6 text-right text-sm tabular-nums text-muted-foreground" aria-hidden>
                            {i + 1}.
                          </span>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Subir funcionalidade ${i + 1}`}
                            disabled={i === 0}
                            onClick={() => mover(i, -1)}
                          >
                            <ArrowUp className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Descer funcionalidade ${i + 1}`}
                            disabled={i === funcionalidades.length - 1}
                            onClick={() => mover(i, 1)}
                          >
                            <ArrowDown className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remover funcionalidade ${i + 1}`}
                            onClick={() => mudarFuncionalidades(funcionalidades.filter((__, j) => j !== i))}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </li>
              ))}
            </ol>
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={funcionalidades.length >= MAX_FUNCIONALIDADES}
                onClick={() => mudarFuncionalidades([...funcionalidades, ''])}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Acrescentar funcionalidade
              </Button>
              {erroDaLista && <p className="text-sm text-destructive">{erroDaLista}</p>}
            </div>
          </FormSection>

          <FormSection title="Apresentação">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="ordem"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ordem</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step={1}
                        min={0}
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={Number.isNaN(field.value) ? '' : field.value}
                        onChange={numero(field.onChange)}
                      />
                    </FormControl>
                    <FormDescription>Os planos aparecem da ordem menor para a maior.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="destaque"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-4 rounded-md border border-border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Destaque</FormLabel>
                      <FormDescription>Assinalado como recomendado no site.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </FormSection>
        </FormPage>
      </form>
    </Form>
  );
}
