'use client';

/**
 * Formulário de liquidação da nota de crédito (#148).
 *
 * O MESMO schema da action (`LiquidarNotaCreditoSchema`, discriminado por
 * `forma`). O que se pode escolher chega decidido do servidor: a compensação só
 * existe com saldo suficiente, a devolução só com permissão de caixa ou banca,
 * e dentro dela só as formas de pagamento que essa permissão cobre. A conta
 * bancária filtra-se por `TIPOS_CONTA_POR_FORMA`, como no pagamento a
 * fornecedor.
 *
 * Submissão por `useTransition` + `navegarDepoisDaAccao`: a action revalida e a
 * página passa a outro ramo (NC já LIQUIDADA).
 */

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { CampoDia, FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { diaIsoParaData } from '@/lib/format-date';
import { navegarDepoisDaAccao } from '@/lib/navegar-depois-da-accao';
import { FORMAS_PAGAMENTO, TIPOS_CONTA_POR_FORMA, type FormaPagamento } from '@/lib/meios-pagamento';
import { LiquidarNotaCreditoSchema } from '@/lib/validations/faturacao';
import { liquidarNotaCredito } from '@/server/actions/faturacao.actions';

type Forma = 'COMPENSACAO' | 'DEVOLUCAO';

interface Valores {
  id: string;
  forma: Forma;
  data: Date;
  formaPagamento?: FormaPagamento;
  contaBancariaId?: string;
}

export interface ContaBancariaOpcao {
  id: string;
  label: string;
  tipoConta: string;
}

interface Props {
  ncId: string;
  numero: string;
  totalNC: string;
  faturaNumero: string;
  compensacao: { possivel: true; saldo: string } | { possivel: false; motivo: string };
  /** Formas de pagamento que as permissões do utilizador cobrem; vazio ⇒ sem devolução. */
  formasPermitidas: FormaPagamento[];
  contasBancarias: ContaBancariaOpcao[];
  sessaoCaixa: { numero: string } | null;
  /** Dia de Maputo, `aaaa-mm-dd`, calculado no servidor. */
  hoje: string;
}

/** Erros de regra que pertencem a um campo aparecem nesse campo. */
const CAMPO_DO_ERRO: Partial<Record<string, keyof Valores>> = {
  NC_COMPENSACAO_EXCEDE_SALDO: 'forma',
  FATURA_NAO_COMPENSAVEL: 'forma',
  MEIO_PAGAMENTO_SEM_PERMISSAO: 'formaPagamento',
  FORMA_PAGAMENTO_INVALIDA: 'formaPagamento',
  SESSAO_CAIXA_NECESSARIA: 'formaPagamento',
  CONTA_BANCARIA_OBRIGATORIA: 'contaBancariaId',
  CONTA_BANCARIA_INATIVA: 'contaBancariaId',
  CONTA_BANCARIA_INCOMPATIVEL: 'contaBancariaId',
  CONTA_CONTABIL_BANCARIA_EM_FALTA: 'contaBancariaId',
  PERIODO_FECHADO: 'data',
};

const rotuloForma = (f: FormaPagamento | undefined) => FORMAS_PAGAMENTO.find((x) => x.value === f)?.label;

export function LiquidarNotaCreditoForm({
  ncId,
  numero,
  totalNC,
  faturaNumero,
  compensacao,
  formasPermitidas,
  contasBancarias,
  sessaoCaixa,
  hoje,
}: Props) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();
  const detalhe = `/faturacao/nota-credito/${ncId}`;
  const podeDevolver = formasPermitidas.length > 0;

  const form = useForm<Valores>({
    resolver: zodResolver(LiquidarNotaCreditoSchema) as unknown as Resolver<Valores>,
    defaultValues: {
      id: ncId,
      forma: compensacao.possivel ? 'COMPENSACAO' : 'DEVOLUCAO',
      data: diaIsoParaData(hoje),
      formaPagamento: formasPermitidas[0],
      contaBancariaId: undefined,
    },
    mode: 'onBlur',
  });

  const [forma, formaPagamento] = useWatch({ control: form.control, name: ['forma', 'formaPagamento'] });
  const tiposAceites = formaPagamento ? TIPOS_CONTA_POR_FORMA[formaPagamento] : [];
  const contasFiltradas = contasBancarias.filter((c) => tiposAceites.includes(c.tipoConta));
  const precisaConta = forma === 'DEVOLUCAO' && formaPagamento !== 'NUMERARIO';
  const numerarioSemSessao = forma === 'DEVOLUCAO' && formaPagamento === 'NUMERARIO' && !sessaoCaixa;

  const onSubmit = form.handleSubmit((v) => {
    iniciarTransicao(async () => {
      const res = await liquidarNotaCredito(
        v.forma === 'COMPENSACAO'
          ? { id: v.id, forma: 'COMPENSACAO', data: v.data }
          : {
              id: v.id,
              forma: 'DEVOLUCAO',
              data: v.data,
              formaPagamento: v.formaPagamento as FormaPagamento,
              contaBancariaId: v.formaPagamento === 'NUMERARIO' ? undefined : v.contaBancariaId,
            },
      );
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
          toast.error(res.error.message ?? 'Não foi possível liquidar a nota de crédito.');
        }
        return;
      }
      toast.success(`${numero} liquidada.`);
      form.reset(form.getValues());
      await navegarDepoisDaAccao(router, detalhe);
    });
  });

  if (!compensacao.possivel && !podeDevolver) {
    return (
      <div
        className="rounded-lg border border-warning/40 bg-warning/10 p-6 text-sm"
        data-testid="nc-liquidar-sem-forma"
      >
        <p>Não há forma de liquidação disponível para esta nota de crédito.</p>
        <p className="mt-1 text-muted-foreground">
          Compensação: {compensacao.motivo} Devolução: exige a permissão de operar o caixa (numerário) ou
          de movimentar contas bancárias (restantes formas).
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
              {aCorrer ? 'A liquidar…' : `Liquidar ${formatMZN(totalNC)}`}
            </Button>
          </>
        }
      >
        {erroServidor && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            data-testid="nc-liquidar-erro-servidor"
          >
            {erroServidor}
          </p>
        )}

        <FormSection
          title="Forma de liquidação"
          description="A liquidação é sempre pelo total da nota de crédito."
        >
          <FormField
            control={form.control}
            name="forma"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Forma</FormLabel>
                <FormControl>
                  <RadioGroup
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v as Forma);
                      form.clearErrors();
                    }}
                    className="gap-3"
                  >
                    {compensacao.possivel && (
                      <div className="flex items-start gap-3 rounded-md border p-3">
                        <RadioGroupItem value="COMPENSACAO" id="forma-compensacao" className="mt-0.5" />
                        <Label htmlFor="forma-compensacao" className="grid gap-1 font-normal cursor-pointer">
                          <span className="font-medium">Compensação na factura {faturaNumero}</span>
                          <span className="text-muted-foreground">
                            Abate {formatMZN(totalNC)} ao saldo em aberto da factura (
                            <span className="tabular-nums">{formatMZN(compensacao.saldo)}</span>). Sem
                            lançamento novo: a conta de clientes já foi creditada na emissão.
                          </span>
                        </Label>
                      </div>
                    )}
                    {podeDevolver && (
                      <div className="flex items-start gap-3 rounded-md border p-3">
                        <RadioGroupItem value="DEVOLUCAO" id="forma-devolucao" className="mt-0.5" />
                        <Label htmlFor="forma-devolucao" className="grid gap-1 font-normal cursor-pointer">
                          <span className="font-medium">Devolução ao cliente</span>
                          <span className="text-muted-foreground">
                            Devolve {formatMZN(totalNC)} ao cliente pelo meio escolhido. Gera o lançamento
                            411 Clientes (débito) → conta do meio (crédito).
                          </span>
                        </Label>
                      </div>
                    )}
                  </RadioGroup>
                </FormControl>
                {!compensacao.possivel && (
                  <FormDescription data-testid="nc-sem-compensacao">
                    Compensação indisponível. {compensacao.motivo}
                  </FormDescription>
                )}
                {!podeDevolver && (
                  <FormDescription data-testid="nc-sem-devolucao">
                    Devolução indisponível: exige a permissão de operar o caixa ou de movimentar contas
                    bancárias.
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection title="Liquidação">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="data"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data da liquidação</FormLabel>
                  <FormControl>
                    <CampoDia value={field.value} onChange={field.onChange} onBlur={field.onBlur} name={field.name} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {forma === 'DEVOLUCAO' && (
              <FormField
                control={form.control}
                name="formaPagamento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Forma de pagamento</FormLabel>
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
                          Sai da sua sessão de caixa aberta{' '}
                          <span className="font-medium text-foreground">{sessaoCaixa.numero}</span>.
                        </FormDescription>
                      ) : (
                        <p className="text-sm text-destructive" data-testid="nc-sem-sessao-caixa">
                          Não tem sessão de caixa aberta. Para devolver em numerário, abra o caixa em{' '}
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
            )}

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
