'use client';

/**
 * Formulário de pagamento de uma factura (P2, fatura-pdf-pagamento).
 *
 * O MESMO schema da action (`RegistarPagamentoFaturaSchema`). As formas de pagamento
 * chegam já filtradas pelas permissões do utilizador; a conta bancária filtra-se por
 * `TIPOS_CONTA_POR_FORMA`, como na devolução da NC e no pagamento a fornecedor.
 *
 * Submissão por `useTransition` + `navegarDepoisDaAccao`: a action revalida e a página
 * pode passar a outro ramo (factura já PAGA ⇒ redirecciona).
 */

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { CampoDia, FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { diaIsoParaData } from '@/lib/format-date';
import { navegarDepoisDaAccao } from '@/lib/navegar-depois-da-accao';
import { FORMAS_PAGAMENTO, TIPOS_CONTA_POR_FORMA, type FormaPagamento } from '@/lib/meios-pagamento';
import { RegistarPagamentoFaturaSchema } from '@/lib/validations/faturacao';
import { registarPagamentoFatura } from '@/server/actions/faturacao.actions';

interface Valores {
  faturaId: string;
  valor: number;
  dataPagamento: Date;
  formaPagamento?: FormaPagamento;
  contaBancariaId?: string;
}

export interface ContaBancariaOpcao {
  id: string;
  label: string;
  tipoConta: string;
}

interface Props {
  faturaId: string;
  numero: string;
  /** Saldo em aberto, Decimal serializado. */
  pendente: string;
  /** Formas de pagamento que as permissões do utilizador cobrem. */
  formasPermitidas: FormaPagamento[];
  contasBancarias: ContaBancariaOpcao[];
  sessaoCaixa: { numero: string } | null;
  /** Dia de Maputo, `aaaa-mm-dd`, calculado no servidor. */
  hoje: string;
}

/** Erros de regra que pertencem a um campo aparecem nesse campo. */
const CAMPO_DO_ERRO: Partial<Record<string, keyof Valores>> = {
  PAGAMENTO_EXCEDE_SALDO: 'valor',
  PAGAMENTO_DATA_ANTERIOR_EMISSAO: 'dataPagamento',
  PERIODO_FECHADO: 'dataPagamento',
  MEIO_PAGAMENTO_SEM_PERMISSAO: 'formaPagamento',
  FORMA_PAGAMENTO_INVALIDA: 'formaPagamento',
  SESSAO_CAIXA_NECESSARIA: 'formaPagamento',
  CONTA_BANCARIA_OBRIGATORIA: 'contaBancariaId',
  CONTA_BANCARIA_INATIVA: 'contaBancariaId',
  CONTA_BANCARIA_INCOMPATIVEL: 'contaBancariaId',
  CONTA_CONTABIL_BANCARIA_EM_FALTA: 'contaBancariaId',
};

const rotuloForma = (f: FormaPagamento | undefined) => FORMAS_PAGAMENTO.find((x) => x.value === f)?.label;

export function RegistarPagamentoFaturaForm({
  faturaId,
  numero,
  pendente,
  formasPermitidas,
  contasBancarias,
  sessaoCaixa,
  hoje,
}: Props) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();
  const detalhe = `/faturacao/${faturaId}`;

  const form = useForm<Valores>({
    resolver: zodResolver(RegistarPagamentoFaturaSchema) as unknown as Resolver<Valores>,
    defaultValues: {
      faturaId,
      valor: Number(pendente),
      dataPagamento: diaIsoParaData(hoje),
      formaPagamento: formasPermitidas[0],
      contaBancariaId: undefined,
    },
    mode: 'onBlur',
  });

  const formaPagamento = useWatch({ control: form.control, name: 'formaPagamento' });
  const tiposAceites = formaPagamento ? TIPOS_CONTA_POR_FORMA[formaPagamento] : [];
  const contasFiltradas = contasBancarias.filter((c) => tiposAceites.includes(c.tipoConta));
  const precisaConta = !!formaPagamento && formaPagamento !== 'NUMERARIO';
  const numerarioSemSessao = formaPagamento === 'NUMERARIO' && !sessaoCaixa;

  const onSubmit = form.handleSubmit((v) => {
    iniciarTransicao(async () => {
      const res = await registarPagamentoFatura({
        faturaId: v.faturaId,
        valor: v.valor,
        dataPagamento: v.dataPagamento,
        formaPagamento: v.formaPagamento as FormaPagamento,
        contaBancariaId: v.formaPagamento === 'NUMERARIO' ? undefined : v.contaBancariaId,
      });
      if (!res.ok) {
        const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        const campo = CAMPO_DO_ERRO[res.error.code];
        if (details?.fieldErrors && Object.keys(details.fieldErrors).length > 0) {
          for (const [nome, msgs] of Object.entries(details.fieldErrors)) {
            form.setError(nome as keyof Valores, { type: 'server', message: msgs[0] });
          }
        } else if (campo) {
          form.setError(campo, { type: res.error.code, message: res.error.message }, { shouldFocus: true });
          toast.error(res.error.message);
        } else {
          form.setError('root.servidor', { type: res.error.code, message: res.error.message });
          toast.error(res.error.message ?? 'Não foi possível registar o pagamento.');
        }
        return;
      }
      toast.success(`Pagamento da factura ${numero} registado.`);
      form.reset(form.getValues());
      await navegarDepoisDaAccao(router, detalhe);
    });
  });

  if (formasPermitidas.length === 0) {
    return (
      <div
        className="rounded-lg border border-warning/40 bg-warning/10 p-6 text-sm"
        data-testid="fatura-pagamento-sem-forma"
      >
        <p>Não há forma de pagamento disponível para si.</p>
        <p className="mt-1 text-muted-foreground">
          Receber em numerário exige a permissão de operar o caixa; as restantes formas exigem a de
          movimentar contas bancárias.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-4">
          <Link href={detalhe}>Voltar ao documento</Link>
        </Button>
      </div>
    );
  }

  const erroServidor = form.formState.errors.root?.servidor?.message;

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !aCorrer} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" size="sm" disabled={aCorrer} onClick={() => router.push(detalhe)}>
              <X className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Voltar
            </Button>
            <Button type="submit" size="sm" disabled={aCorrer || numerarioSemSessao} onClick={onSubmit}>
              <CheckCircle className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {aCorrer ? 'A registar…' : 'Registar pagamento'}
            </Button>
          </>
        }
      >
        {erroServidor && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            data-testid="fatura-pagamento-erro-servidor"
          >
            {erroServidor}
          </p>
        )}

        <FormSection title="Pagamento" description="Gera o lançamento conta do meio (débito) → 411 Clientes (crédito).">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="valor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min={0.01}
                      max={Number(pendente)}
                      name={field.name}
                      ref={field.ref}
                      value={Number.isFinite(field.value) ? field.value : ''}
                      onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                      onBlur={field.onBlur}
                    />
                  </FormControl>
                  <FormDescription>Em aberto: {formatMZN(pendente)}.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dataPagamento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data do pagamento *</FormLabel>
                  <FormControl>
                    <CampoDia value={field.value} onChange={field.onChange} onBlur={field.onBlur} name={field.name} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="formaPagamento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Forma de pagamento *</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v as FormaPagamento);
                      form.setValue('contaBancariaId', undefined, { shouldDirty: true });
                      form.clearErrors('contaBancariaId');
                    }}
                  >
                    <FormControl>
                      <SelectTrigger aria-label="Forma de pagamento">
                        <SelectValue placeholder="Seleccione">{rotuloForma(field.value)}</SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {formasPermitidas.map((f) => (
                        <SelectItem key={f} value={f}>
                          {rotuloForma(f)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {field.value === 'NUMERARIO' &&
                    (sessaoCaixa ? (
                      <FormDescription>
                        Entra na sua sessão de caixa aberta{' '}
                        <span className="font-medium text-foreground">{sessaoCaixa.numero}</span>.
                      </FormDescription>
                    ) : (
                      <p className="text-sm text-destructive" data-testid="fatura-pagamento-sem-sessao-caixa">
                        Não tem sessão de caixa aberta. Para receber em numerário, abra o caixa em{' '}
                        <Link href="/caixa/abertura" className="underline underline-offset-4">
                          Caixa › Abertura
                        </Link>
                        .
                      </p>
                    ))}
                  <FormMessage />
                </FormItem>
              )}
            />

            {precisaConta && (
              <FormField
                control={form.control}
                name="contaBancariaId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conta bancária</FormLabel>
                    <Select value={field.value ?? ''} onValueChange={(v) => field.onChange(v || undefined)}>
                      <FormControl>
                        <SelectTrigger aria-label="Conta bancária">
                          <SelectValue placeholder="Seleccione a conta">
                            {contasFiltradas.find((c) => c.id === field.value)?.label}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {contasFiltradas.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            Sem contas bancárias activas compatíveis com esta forma
                          </div>
                        ) : (
                          contasFiltradas.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.label}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
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
