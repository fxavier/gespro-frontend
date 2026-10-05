'use client';

/**
 * Formulário da aplicação do resultado (ADR-0035 §5, #364): data da deliberação e referência da
 * acta. O valor a transferir vem do servidor (saldo de 88 no exercício seguinte) e só se mostra.
 * A data vai como texto `aaaa-mm-dd`; o servidor converte-a para o meio-dia de Maputo.
 * `useTransition` + `router.push` (a página muda de ramo com a revalidação).
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowRightLeft, Info, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { AplicarResultadoSchema, type AplicarResultadoInput } from '@/lib/validations/contabilidade';
import { aplicarResultado } from '@/server/actions/contabilidade.actions';

/** Erros que pertencem a um campo; os restantes vão para o toast com a mensagem do servidor. */
const CAMPO_DO_ERRO: Record<string, keyof AplicarResultadoInput> = {
  DATA_FORA_DO_EXERCICIO_SEGUINTE: 'dataDeliberacao',
  PERIODO_FECHADO: 'dataDeliberacao',
};

/** Textos legíveis por código (a mensagem do servidor é o recurso). */
const TEXTO_ERRO: Record<string, string> = {
  EXERCICIO_NAO_ENCERRADO: 'O exercício já não está encerrado — o resultado só se aplica a um exercício encerrado.',
  ABERTURA_EM_FALTA:
    'O exercício seguinte não tem o lançamento de abertura. Encerre de novo este exercício para o gerar.',
  RESULTADO_JA_APLICADO: 'O resultado deste exercício já foi aplicado. Anule a aplicação antes de a registar de novo.',
  SEM_RESULTADO_A_APLICAR: 'A conta 88 não tem saldo no exercício seguinte: não há resultado a aplicar.',
};

interface AplicarResultadoFormProps {
  exercicioId: string;
  codigo: string;
  codigoSeguinte: string;
  /** Valor a transferir, já formatado. */
  valor: string;
  lucro: boolean;
  dataMinima: string;
  dataMaxima: string;
  dataInicial: string;
}

export function AplicarResultadoForm({
  exercicioId,
  codigo,
  codigoSeguinte,
  valor,
  lucro,
  dataMinima,
  dataMaxima,
  dataInicial,
}: AplicarResultadoFormProps) {
  const [aCorrer, iniciarTransicao] = useTransition();
  const router = useRouter();
  const destino = '/contabilidade/exercicios';

  const form = useForm<AplicarResultadoInput>({
    resolver: zodResolver(AplicarResultadoSchema),
    defaultValues: { exercicioId, dataDeliberacao: dataInicial, referenciaActa: '' },
    mode: 'onBlur',
  });

  function onSubmit(valores: AplicarResultadoInput) {
    iniciarTransicao(async () => {
      const res = await aplicarResultado(valores);
      if (!res.ok) {
        const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        for (const campo of ['dataDeliberacao', 'referenciaActa'] as const) {
          const erro = details?.fieldErrors?.[campo]?.[0];
          if (erro) {
            form.setError(campo, { type: 'server', message: erro });
            return;
          }
        }
        const campo = CAMPO_DO_ERRO[res.error.code];
        if (campo) {
          form.setError(campo, { type: 'server', message: res.error.message });
          return;
        }
        toast.error(TEXTO_ERRO[res.error.code] ?? res.error.message ?? 'Não foi possível aplicar o resultado.');
        if (res.error.code in TEXTO_ERRO || res.error.code === 'NAO_ENCONTRADO') router.refresh();
        return;
      }
      toast.success(`Resultado do exercício ${codigo} aplicado em ${codigoSeguinte}.`);
      router.push(destino);
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !form.formState.isSubmitSuccessful} />

      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormPage
          actions={
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => router.push(destino)} disabled={aCorrer}>
                <X className="h-4 w-4 mr-1.5" />
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={aCorrer}>
                {aCorrer ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <ArrowRightLeft className="h-4 w-4 mr-1.5" />
                )}
                Aplicar resultado
              </Button>
            </>
          }
        >
          <FormSection
            title="Deliberação"
            description="A deliberação dos sócios que aprova as contas e decide a aplicação do resultado"
          >
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-info/40 bg-info/10 p-3 text-sm">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
              <div className="text-muted-foreground space-y-1">
                <p>
                  <span className="font-medium text-foreground">Valor a transferir: {valor}</span> (
                  {lucro ? 'lucro' : 'prejuízo'} do exercício {codigo}, saldo actual da conta 88 em {codigoSeguinte}).
                </p>
                <p>
                  {lucro
                    ? 'Lança-se a débito de 88 e a crédito de 59 — Resultados transitados'
                    : 'Lança-se a crédito de 88 e a débito de 59 — Resultados transitados'}
                  , no diário de operações, com a data da deliberação. A distribuição (reservas, dividendos)
                  faz-se depois, por lançamentos a partir de 59.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="dataDeliberacao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data da deliberação</FormLabel>
                    <FormControl>
                      <Input type="date" min={dataMinima} max={dataMaxima} {...field} />
                    </FormControl>
                    <FormDescription>Tem de pertencer ao exercício {codigoSeguinte}, num mês aberto.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="referenciaActa"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Referência da acta</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: Acta n.º 3/2027" {...field} />
                    </FormControl>
                    <FormDescription>Fica no histórico do lançamento e no trilho de auditoria.</FormDescription>
                    <FormMessage />
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
