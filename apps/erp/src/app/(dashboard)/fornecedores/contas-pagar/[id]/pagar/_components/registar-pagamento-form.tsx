'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import Link from 'next/link';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { registarPagamentoAction } from '@/server/actions/fornecedores.actions';
import { CreatePagamentoSchema, type CreatePagamentoInput } from '@/lib/validations/compras';
import { FORMAS_PAGAMENTO, TIPOS_CONTA_POR_FORMA, type FormaPagamento } from '@/lib/meios-pagamento';

export interface ContaBancariaOpt {
  id: string;
  label: string;
  tipoConta: string;
}

export interface SessaoCaixaInfo {
  id: string;
  numero: string;
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

export function RegistarPagamentoForm({
  contaPagarId,
  valorRestante,
  contasBancarias,
  sessaoCaixa,
}: {
  contaPagarId: string;
  valorRestante: number;
  contasBancarias: ContaBancariaOpt[];
  sessaoCaixa: SessaoCaixaInfo | null;
}) {
  const router = useRouter();
  const detalhe = `/fornecedores/contas-pagar/${contaPagarId}`;
  const [isPending, iniciarTransicao] = useTransition();
  const [formaActual, setFormaActual] = useState<FormaPagamento>('TRANSFERENCIA_BANCARIA');

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isDirty },
  } = useForm<CreatePagamentoInput>({
    resolver: zodResolver(CreatePagamentoSchema),
    defaultValues: {
      contaPagarId,
      dataPagamento: new Date(),
      valor: valorRestante,
      formaPagamento: 'TRANSFERENCIA_BANCARIA',
      contaBancariaId: undefined,
      referencia: '',
      observacoes: '',
    },
    mode: 'onBlur',
  });

  // Contas bancárias filtradas pelos tipos aceites para a forma actual
  const tiposAceites = TIPOS_CONTA_POR_FORMA[formaActual] ?? [];
  const contasFiltradas = contasBancarias.filter((c) => tiposAceites.includes(c.tipoConta));
  const precisaConta = formaActual !== 'NUMERARIO';

  // Action directa + navegação imediata — ver comentário no ficheiro anterior
  const onSubmit = handleSubmit((valores) => {
    iniciarTransicao(async () => {
      const res = await registarPagamentoAction(valores);
      if (!res.ok) {
        toast.error(res.error.message ?? 'Não foi possível registar o pagamento.');
        return;
      }
      toast.success('Pagamento registado.');
      router.push(detalhe);
    });
  });

  const err = (name: keyof CreatePagamentoInput) =>
    errors[name] ? (
      <p className="text-sm text-destructive">{String(errors[name]?.message)}</p>
    ) : null;

  return (
    <form onSubmit={onSubmit}>
      <UnsavedChangesGuard isDirty={isDirty && !isPending} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => router.push(detalhe)}>
              <X className="mr-2 h-4 w-4" /> Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending || (formaActual === 'NUMERARIO' && !sessaoCaixa)}
            >
              <Save className="mr-2 h-4 w-4" /> {isPending ? 'A registar…' : 'Registar pagamento'}
            </Button>
          </>
        }
      >
        <FormSection title="Pagamento">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Valor */}
            <div className="space-y-2">
              <Label htmlFor="valor">Valor (MZN) *</Label>
              <Input
                id="valor"
                type="number"
                step="0.01"
                min={0.01}
                max={valorRestante}
                {...register('valor', { valueAsNumber: true })}
              />
              {err('valor')}
            </div>

            {/* Data do pagamento */}
            <div className="space-y-2">
              <Label htmlFor="dataPagamento">Data do pagamento *</Label>
              <Input
                id="dataPagamento"
                type="date"
                defaultValue={hojeISO()}
                onChange={(e) => {
                  const [ano, mes, dia] = e.target.value.split('-').map(Number);
                  if (ano && mes && dia) {
                    setValue('dataPagamento', new Date(ano, mes - 1, dia, 12), { shouldDirty: true });
                  }
                }}
              />
              {err('dataPagamento')}
            </div>

            {/* Forma de pagamento */}
            <div className="space-y-2">
              <Label>Forma de pagamento *</Label>
              <Controller
                control={control}
                name="formaPagamento"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      setFormaActual(v as FormaPagamento);
                      // Limpar a conta bancária ao mudar de forma
                      setValue('contaBancariaId', undefined, { shouldDirty: true, shouldValidate: true });
                    }}
                  >
                    <SelectTrigger aria-label="Forma de pagamento">
                      <SelectValue placeholder="Seleccione">
                        {FORMAS_PAGAMENTO.find((f) => f.value === field.value)?.label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {FORMAS_PAGAMENTO.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {err('formaPagamento')}
            </div>

            {/* Conta bancária — visível apenas quando forma != NUMERARIO */}
            {precisaConta && (
              <div className="space-y-2">
                <Label>Conta bancária *</Label>
                <Controller
                  control={control}
                  name="contaBancariaId"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? ''}
                      onValueChange={(v) => field.onChange(v || undefined)}
                    >
                      <SelectTrigger aria-label="Conta bancária">
                        <SelectValue placeholder="Seleccione a conta">
                          {contasFiltradas.find((c) => c.id === field.value)?.label}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {contasFiltradas.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            Sem contas bancárias compatíveis
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
                  )}
                />
                {err('contaBancariaId')}
              </div>
            )}

            {/* Numerário — sessão de caixa */}
            {formaActual === 'NUMERARIO' && (
              <div className="space-y-2">
                {sessaoCaixa ? (
                  <p className="text-sm text-muted-foreground">
                    Sessão de caixa aberta:{' '}
                    <span className="font-medium text-foreground">{sessaoCaixa.numero}</span>.
                    O valor será debitado desta sessão.
                  </p>
                ) : (
                  <p className="text-sm text-destructive">
                    Não há sessão de caixa aberta. Para pagar em numerário, abra o caixa em{' '}
                    <Link href="/caixa/abertura" className="underline underline-offset-4">
                      Caixa › Abertura
                    </Link>{' '}
                    antes de continuar.
                  </p>
                )}
              </div>
            )}

            {/* Referência */}
            <div className="space-y-2">
              <Label htmlFor="referencia">Referência</Label>
              <Input id="referencia" {...register('referencia')} placeholder="N.º da transferência, cheque…" />
              {err('referencia')}
            </div>

            {/* Observações */}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea id="observacoes" rows={3} {...register('observacoes')} />
              {err('observacoes')}
            </div>
          </div>
        </FormSection>
      </FormPage>
    </form>
  );
}
