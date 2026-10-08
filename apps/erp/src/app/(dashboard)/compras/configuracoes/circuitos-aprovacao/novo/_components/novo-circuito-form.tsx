'use client';

/**
 * Formulário de um circuito de aprovação novo (#108).
 *
 * react-hook-form + zodResolver com o MESMO schema da action
 * (`CreateConfiguracaoWorkflowSchema`). Aprovadores escolhem-se por `ComboboxRemoto`
 * (pesquisa no servidor): a primeira página vem do Server Component.
 */

import { useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFieldArray, useForm, useFormState, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { ComboboxRemoto, FormPage, FormSection, UnsavedChangesGuard, type ComboboxOption } from '@/components/patterns';
import { CreateConfiguracaoWorkflowSchema } from '@/lib/validations/compras';
import { ROTULO_TIPO_APROVACAO, ROTULO_TIPO_CIRCUITO } from '@/lib/compras-aprovacao';
import { criarConfiguracaoWorkflowAction, procurarAprovadoresAction } from '@/server/actions/compras.actions';

type Entrada = z.input<typeof CreateConfiguracaoWorkflowSchema>;
type Utilizador = { id: string; nome: string; email: string };

const LISTA = '/compras/configuracoes/circuitos-aprovacao';
const TIPOS = Object.keys(ROTULO_TIPO_CIRCUITO) as Array<keyof typeof ROTULO_TIPO_CIRCUITO>;
const QUORUNS = Object.keys(ROTULO_TIPO_APROVACAO) as Array<keyof typeof ROTULO_TIPO_APROVACAO>;

const opcao = (u: Utilizador): ComboboxOption => ({ value: u.id, label: `${u.nome} — ${u.email}` });

const nivelVazio = (nivel: number): Entrada['niveis'][number] => ({
  nivel,
  nome: '',
  valorMinimo: 0,
  valorMaximo: 1_000_000,
  tipoAprovacao: 'QUALQUER_UM',
  aprovadores: [],
});

export function NovoCircuitoForm({ utilizadoresIniciais }: { utilizadoresIniciais: Utilizador[] }) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();

  // id → email de todos os utilizadores já vistos (página inicial + pesquisas).
  const conhecidos = useRef(new Map(utilizadoresIniciais.map((u) => [u.id, u])));
  const opcoesIniciais = utilizadoresIniciais.map(opcao);

  const procurar = async (q: string): Promise<ComboboxOption[] | null> => {
    const r = await procurarAprovadoresAction({ q });
    if (!r.ok) return null;
    for (const u of r.data) conhecidos.current.set(u.id, u);
    return r.data.map(opcao);
  };

  const form = useForm<Entrada>({
    resolver: zodResolver(CreateConfiguracaoWorkflowSchema),
    defaultValues: { nome: '', tipo: 'REQUISICAO_COMPRA', ativo: true, niveis: [nivelVazio(1)] },
  });
  const niveis = useFieldArray({ control: form.control, name: 'niveis' });

  const onSubmit = form.handleSubmit((valores) => {
    iniciar(async () => {
      const r = await criarConfiguracaoWorkflowAction(valores);
      if (!r.ok) {
        const details = r.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        const erroNome = details?.fieldErrors?.nome?.[0];
        if (erroNome) form.setError('nome', { type: 'server', message: erroNome });
        else toast.error(r.error.message ?? 'Não foi possível criar o circuito.');
        return;
      }
      toast.success(`Circuito «${r.data.nome}» criado.`);
      form.reset(valores);
      router.push(LISTA);
    });
  });

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !aCorrer} />
      <form onSubmit={onSubmit} noValidate>
        <FormPage
          actions={
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => router.push(LISTA)} disabled={aCorrer}>
                <X className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={aCorrer}>
                <Save className="h-4 w-4 mr-1.5" aria-hidden="true" />
                {aCorrer ? 'A guardar…' : 'Criar circuito'}
              </Button>
            </>
          }
        >
          <FormSection title="Circuito" description="Um circuito aplica-se a um tipo de documento.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ex.: Requisições — circuito geral" maxLength={100} />
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
                    <FormLabel>Tipo de documento</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha o tipo">{ROTULO_TIPO_CIRCUITO[field.value]}</SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIPOS.map((t) => (
                          <SelectItem key={t} value={t}>{ROTULO_TIPO_CIRCUITO[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ativo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Activo</FormLabel>
                    <FormControl>
                      <Switch checked={field.value ?? true} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormDescription>Só pode haver um circuito activo por tipo.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </FormSection>

          {niveis.fields.map((campo, i) => (
            <FormSection
              key={campo.id}
              title={`Nível ${i + 1}`}
              description="Fecha quando o quórum aprova; o nível seguinte só abre depois."
            >
              <NivelCampos
                control={form.control}
                indice={i}
                opcoesIniciais={opcoesIniciais}
                procurar={procurar}
                emailDe={(id) => conhecidos.current.get(id)?.email}
              />
              {niveis.fields.length > 1 && i === niveis.fields.length - 1 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => niveis.remove(i)}>
                  <Trash2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  Remover nível
                </Button>
              )}
            </FormSection>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => niveis.append(nivelVazio(niveis.fields.length + 1))}
          >
            <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Adicionar nível
          </Button>
          {form.formState.errors.niveis?.root?.message && (
            <p className="text-sm text-destructive">{form.formState.errors.niveis.root.message}</p>
          )}
        </FormPage>
      </form>
    </Form>
  );
}

function NivelCampos({
  control,
  indice,
  opcoesIniciais,
  procurar,
  emailDe,
}: {
  control: Control<Entrada>;
  indice: number;
  opcoesIniciais: ComboboxOption[];
  procurar: (q: string) => Promise<ComboboxOption[] | null>;
  emailDe: (id: string) => string | undefined;
}) {
  const aprovadores = useFieldArray({ control, name: `niveis.${indice}.aprovadores` });
  // O erro do array («Pelo menos um aprovador») pode cair na raiz do field array, onde o
  // FormMessage não o lê — mostra-se à mão para o formulário nunca recusar em silêncio.
  const { errors } = useFormState({ control, name: `niveis.${indice}.aprovadores` });
  const erroAprovadores = errors.niveis?.[indice]?.aprovadores;
  const mensagemAprovadores = erroAprovadores?.message ?? erroAprovadores?.root?.message;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <FormField
          control={control}
          name={`niveis.${indice}.nome`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome do nível</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Ex.: Chefia" maxLength={100} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={`niveis.${indice}.valorMinimo`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Valor mínimo (MT)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={field.value as number}
                  onChange={(e) => field.onChange(e.target.valueAsNumber)}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={`niveis.${indice}.valorMaximo`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Valor máximo (MT)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={field.value as number}
                  onChange={(e) => field.onChange(e.target.valueAsNumber)}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={`niveis.${indice}.tipoAprovacao`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Quórum</FormLabel>
              <Select value={field.value ?? 'QUALQUER_UM'} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o quórum">
                      {ROTULO_TIPO_APROVACAO[field.value ?? 'QUALQUER_UM']}
                    </SelectValue>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {QUORUNS.map((q) => (
                    <SelectItem key={q} value={q}>{ROTULO_TIPO_APROVACAO[q]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name={`niveis.${indice}.aprovadores`}
        render={() => (
          <FormItem>
            <FormLabel>Aprovadores</FormLabel>
            {aprovadores.fields.length > 0 && (
              <ul className="space-y-1">
                {aprovadores.fields.map((a, j) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
                    <span>{a.email}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={`Remover ${a.email}`}
                      onClick={() => aprovadores.remove(j)}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <ComboboxRemoto
              aria-label={`Adicionar aprovador ao nível ${indice + 1}`}
              opcoesIniciais={opcoesIniciais}
              procurar={procurar}
              value=""
              onChange={(id) => {
                const email = emailDe(id);
                if (!email || aprovadores.fields.some((a) => a.usuarioId === id)) return;
                aprovadores.append({ usuarioId: id, email });
              }}
              placeholder="Adicionar aprovador…"
              searchPlaceholder="Pesquisar por nome ou email…"
              emptyText="Nenhum utilizador encontrado"
            />
            {mensagemAprovadores && <p className="text-sm font-medium text-destructive">{mensagemAprovadores}</p>}
          </FormItem>
        )}
      />
    </div>
  );
}
