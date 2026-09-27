'use client';

/**
 * Formulário de regra de sugestão — nova / editar (issue #140).
 *
 * O MESMO schema do servidor (`RegraSugestaoSchema`). A contrapartida escolhe-se
 * por `ComboboxRemoto`: o plano tem mais de 400 contas folha, e um filtro local
 * sobre a primeira página calaria as outras. A conta bancária é um `Combobox`
 * local com «Todas as contas» (= `null`).
 *
 * Submissão por `useTransition` + `navegarDepoisDaAccao` (CLAUDE.md:
 * `handleSubmit` corre fora de uma transição).
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  Combobox,
  ComboboxRemoto,
  FormPage,
  FormSection,
  UnsavedChangesGuard,
  type ComboboxOption,
} from '@/components/patterns';
import { navegarDepoisDaAccao } from '@/lib/navegar-depois-da-accao';
import {
  NaturezaRegraSugestaoEnum,
  RegraSugestaoSchema,
  type NaturezaRegraSugestao,
} from '@/lib/validations/reconciliacao';
import {
  criarRegraSugestaoAction,
  editarRegraSugestaoAction,
  procurarContrapartidaRegraAction,
} from '@/server/actions/reconciliacao.actions';
import { ROTA_REGRAS, ROTULO_NATUREZA_REGRA, TODAS_AS_CONTAS } from './rotulos';

export interface ValoresRegra {
  contaBancariaId: string | null;
  padrao: string;
  natureza: NaturezaRegraSugestao;
  contaContrapartidaId: string;
  descricao: string;
  prioridade: number;
}

interface Props {
  /** Presente em modo edição. */
  regraId?: string;
  valoresIniciais?: ValoresRegra;
  /** Primeira página das contas PGC folha activas (inclui a contrapartida actual). */
  contrapartidasIniciais: ComboboxOption[];
  contasBancarias: ComboboxOption[];
}

/** Erros de regra que pertencem a um campo aparecem nesse campo. */
const CAMPO_DO_ERRO: Partial<Record<string, keyof ValoresRegra>> = {
  CONTRAPARTIDA_INVALIDA: 'contaContrapartidaId',
  CONTRAPARTIDA_E_CONTA_BANCO: 'contaContrapartidaId',
};

const OMISSOES: ValoresRegra = {
  contaBancariaId: null,
  padrao: '',
  natureza: 'CREDITO',
  contaContrapartidaId: '',
  descricao: '',
  prioridade: 100,
};

export function RegraForm({ regraId, valoresIniciais, contrapartidasIniciais, contasBancarias }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<ValoresRegra>({
    resolver: zodResolver(RegraSugestaoSchema) as unknown as Resolver<ValoresRegra>,
    defaultValues: valoresIniciais ?? OMISSOES,
    mode: 'onBlur',
  });

  const onSubmit = form.handleSubmit((valores) => {
    startTransition(async () => {
      const dados = { ...valores, descricao: valores.descricao?.trim() || undefined };
      const res = regraId
        ? await editarRegraSugestaoAction({ id: regraId, ...dados })
        : await criarRegraSugestaoAction(dados);
      if (!res.ok) {
        const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        const campo = CAMPO_DO_ERRO[res.error.code];
        if (details?.fieldErrors) {
          for (const [nome, msgs] of Object.entries(details.fieldErrors)) {
            form.setError(nome as keyof ValoresRegra, { type: 'server', message: msgs[0] });
          }
        } else if (campo) {
          form.setError(campo, { type: 'server', message: res.error.message });
          toast.error(res.error.message);
        } else {
          toast.error(res.error.message);
        }
        return;
      }
      toast.success(regraId ? 'Regra actualizada.' : 'Regra criada.');
      form.reset(form.getValues());
      await navegarDepoisDaAccao(router, ROTA_REGRAS);
    });
  });

  const procurar = async (q: string): Promise<ComboboxOption[] | null> => {
    const r = await procurarContrapartidaRegraAction({ q });
    return r.ok ? r.data.map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nome}` })) : null;
  };

  const natureza = useWatch({ control: form.control, name: 'natureza' });
  const opcoesContaBancaria: ComboboxOption[] = [
    { value: TODAS_AS_CONTAS, label: 'Todas as contas' },
    ...contasBancarias,
  ];

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !isPending} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => router.push(ROTA_REGRAS)}>
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
          title="Quando"
          description="A regra aplica-se aos movimentos do extracto sem correspondência cuja descrição contenha uma das palavras."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="padrao"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Padrão</FormLabel>
                  <FormControl>
                    <Input className="font-mono" placeholder="ex.: COMISSAO|ENCARGO|TAXA" {...field} />
                  </FormControl>
                  <FormDescription>
                    Palavras separadas por «|». Basta uma aparecer; a comparação ignora acentos e maiúsculas.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="natureza"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Movimento</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar movimento">
                          {natureza ? ROTULO_NATUREZA_REGRA[natureza] : undefined}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {NaturezaRegraSugestaoEnum.options.map((n) => (
                        <SelectItem key={n} value={n}>
                          {ROTULO_NATUREZA_REGRA[n]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Saída = dinheiro que sai da conta (comissões, encargos).</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contaBancariaId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conta bancária</FormLabel>
                  <FormControl>
                    <Combobox
                      value={field.value ?? TODAS_AS_CONTAS}
                      onChange={(v) => field.onChange(v === TODAS_AS_CONTAS ? null : v)}
                      options={opcoesContaBancaria}
                      placeholder="Seleccionar conta"
                      searchPlaceholder="Pesquisar conta…"
                      emptyText="Nenhuma conta encontrada"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection title="Sugerir" description="A conta que a reconciliação propõe como contrapartida do banco.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="contaContrapartidaId"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Conta de contrapartida</FormLabel>
                  <FormControl>
                    <ComboboxRemoto
                      opcoesIniciais={contrapartidasIniciais}
                      procurar={procurar}
                      value={field.value || undefined}
                      onChange={field.onChange}
                      placeholder="Seleccionar conta PGC"
                      searchPlaceholder="Pesquisar por código ou nome…"
                      emptyText="Nenhuma conta encontrada"
                    />
                  </FormControl>
                  <FormDescription>Conta PGC activa que aceite lançamentos, diferente das contas dos bancos.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="prioridade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prioridade</FormLabel>
                  <FormControl>
                    <Input type="number" inputMode="numeric" min={1} max={999} step={1} className="font-mono" {...field} />
                  </FormControl>
                  <FormDescription>1 a 999. Quando várias regras se aplicam, ganha a de menor número.</FormDescription>
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
                    <Input placeholder="ex.: Comissões bancárias" maxLength={200} {...field} />
                  </FormControl>
                  <FormDescription>Opcional. Aparece na lista e na sugestão.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>
      </FormPage>
    </Form>
  );
}
