'use client';

/**
 * Formulário de série de documento — nova / editar (#149, ticket 7).
 *
 * O MESMO schema do servidor: `CriarSerieDocumentoSchema` na criação,
 * `EditarSerieDocumentoSchema` na edição (tipo e ano não se alteram). O
 * formato é fixo (S4): a pré-visualização usa `previsualizarNumero`, a mesma
 * função que numera o documento. Os anos escolhíveis (S5) chegam do servidor —
 * dependem do relógio, e calculá-los aqui divergia na hidratação à meia-noite.
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
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { navegarDepoisDaAccao } from '@/lib/navegar-depois-da-accao';
import {
  CriarSerieDocumentoSchema,
  EditarSerieDocumentoSchema,
  TipoSerieDocumentoEnum,
} from '@/lib/validations/faturacao';
import { ROTULO_TIPO_SERIE, previsualizarNumero, type TipoSerieGerivel } from '@/lib/series-documento';
import { criarSerieDocumento, editarSerieDocumento } from '@/server/actions/faturacao.actions';

const ROTA_SERIES = '/faturacao/series';

interface Valores {
  id?: string;
  tipo: TipoSerieGerivel;
  ano: number;
  prefixo: string;
  numeroInicial: number;
}

export interface SerieEditavel {
  id: string;
  tipo: TipoSerieGerivel;
  ano: number;
  prefixo: string;
  numeroInicial: number;
}

type Props =
  | { modo: 'criar'; anos: number[]; serie?: undefined }
  | { modo: 'editar'; serie: SerieEditavel; anos?: undefined };

/** Erros de regra que pertencem a um campo aparecem nesse campo. */
const CAMPO_DO_ERRO: Partial<Record<string, keyof Valores>> = {
  SERIE_DUPLICADA: 'prefixo',
  SERIE_ANO_INVALIDO: 'ano',
};

export function SerieForm(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const editar = props.modo === 'editar';
  const schema = editar ? EditarSerieDocumentoSchema : CriarSerieDocumentoSchema;

  const form = useForm<Valores>({
    resolver: zodResolver(schema) as unknown as Resolver<Valores>,
    defaultValues: editar
      ? { ...props.serie }
      : { tipo: 'FATURA', ano: props.anos[0], prefixo: '', numeroInicial: 1 },
    mode: 'onBlur',
  });

  const onSubmit = form.handleSubmit((valores) => {
    startTransition(async () => {
      const res = editar
        ? await editarSerieDocumento({
            id: props.serie.id,
            prefixo: valores.prefixo,
            numeroInicial: valores.numeroInicial,
          })
        : await criarSerieDocumento({
            tipo: valores.tipo,
            ano: valores.ano,
            prefixo: valores.prefixo,
            numeroInicial: valores.numeroInicial,
          });
      if (!res.ok) {
        const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        const campo = CAMPO_DO_ERRO[res.error.code];
        if (details?.fieldErrors) {
          for (const [nome, msgs] of Object.entries(details.fieldErrors)) {
            form.setError(nome as keyof Valores, { type: 'server', message: msgs[0] });
          }
        } else if (campo) {
          form.setError(campo, { type: 'server', message: res.error.message }, { shouldFocus: true });
        } else {
          form.setError('root.servidor', { type: res.error.code, message: res.error.message });
          toast.error(res.error.message);
        }
        return;
      }
      toast.success(editar ? 'Série actualizada.' : 'Série criada.');
      // `valores` é a saída do schema: o de edição não traz o ano.
      const anoDaSerie = editar ? props.serie.ano : valores.ano;
      form.reset(form.getValues());
      await navegarDepoisDaAccao(router, `${ROTA_SERIES}?ano=${anoDaSerie}`);
    });
  });

  const [tipo, ano, prefixo, numeroInicial] = useWatch({
    control: form.control,
    name: ['tipo', 'ano', 'prefixo', 'numeroInicial'],
  });
  const prefixoVisto = (prefixo ?? '').trim().toUpperCase() || 'PREFIXO';
  const numeroVisto = Number.isInteger(numeroInicial) && numeroInicial >= 1 ? numeroInicial : 1;
  const erroServidor = form.formState.errors.root?.servidor?.message;

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !isPending} />
      <FormPage
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => router.push(ROTA_SERIES)}
            >
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
        {erroServidor && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            data-testid="serie-erro-servidor"
          >
            {erroServidor}
          </p>
        )}
        <FormSection
          title="Série"
          description="Uma série activa por tipo e ano. Enquanto não numerar nenhum documento, pode ser alterada ou eliminada."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de documento</FormLabel>
                  {editar ? (
                    <Input value={ROTULO_TIPO_SERIE[props.serie.tipo]} disabled readOnly />
                  ) : (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar tipo">{ROTULO_TIPO_SERIE[tipo]}</SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TipoSerieDocumentoEnum.options.map((t) => (
                          <SelectItem key={t} value={t}>
                            {ROTULO_TIPO_SERIE[t]}
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
              name="ano"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ano</FormLabel>
                  {editar ? (
                    <Input value={String(props.serie.ano)} disabled readOnly />
                  ) : (
                    <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar ano">{String(ano)}</SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {props.anos.map((a) => (
                          <SelectItem key={a} value={String(a)}>
                            {a}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormDescription>
                    {editar ? 'O tipo e o ano de uma série não se alteram.' : 'Só o ano corrente ou o seguinte.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="prefixo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prefixo</FormLabel>
                  <FormControl>
                    <Input className="font-mono uppercase" placeholder="ex.: FAT" maxLength={10} {...field} />
                  </FormControl>
                  <FormDescription>Até 10 caracteres: letras, algarismos e hífen.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="numeroInicial"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número inicial</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={999999}
                      step={1}
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={Number.isNaN(field.value) ? '' : String(field.value ?? '')}
                      onChange={(e) => field.onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>O primeiro documento da série recebe este número.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="mt-4 rounded-md border bg-muted/40 p-3 text-sm" aria-live="polite">
            <span className="text-muted-foreground">Primeiro número: </span>
            <span className="font-mono font-medium tabular-nums" data-testid="serie-previsualizacao">
              {previsualizarNumero(prefixoVisto, editar ? props.serie.ano : ano, numeroVisto)}
            </span>
          </div>
        </FormSection>
      </FormPage>
    </Form>
  );
}
