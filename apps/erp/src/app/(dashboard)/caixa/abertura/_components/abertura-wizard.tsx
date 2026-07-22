'use client';

/**
 * Wizard de abertura de caixa — 2 passos.
 *
 * Passo 1: Confirmação de pré-requisitos e inserção do fundo inicial.
 * Passo 2: Revisão e confirmação da abertura.
 *
 * Padrão: Stepper visual + react-hook-form + zodResolver + useTransition.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { CheckCircle, ArrowRight, ArrowLeft, Calculator, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Stepper, StepperContent, UnsavedChangesGuard } from '@/components/patterns';
import type { StepperStep } from '@/components/patterns';
import { abrirSessaoCaixa } from '@/server/actions/caixa.actions';
import { AbrirSessaoCaixaSchema, type AbrirSessaoCaixaInput } from '@/lib/validations/caixa';

const PASSOS: StepperStep[] = [
  { key: 'preparacao', label: 'Preparação', description: 'Verificar fundo' },
  { key: 'dados', label: 'Dados', description: 'Preencher fundo inicial' },
];

const LISTA_VERIFICACAO = [
  'Contei o dinheiro físico em caixa',
  'Verifiquei notas e moedas',
  'Confirmei o valor total disponível',
  'Identifico-me como responsável do turno',
];

export function AberturaWizard() {
  const router = useRouter();
  const [passo, setPasso] = useState<'preparacao' | 'dados'>('preparacao');
  const [verificados, setVerificados] = useState<Set<number>>(new Set());
  const [isPending, startTransition] = useTransition();

  const form = useForm<AbrirSessaoCaixaInput>({
    resolver: zodResolver(AbrirSessaoCaixaSchema),
    defaultValues: {
      fundoInicial: 0,
      observacoes: '',
    },
    mode: 'onBlur',
  });

  const isDirty = form.formState.isDirty;
  const fundoInicial = form.watch('fundoInicial');
  const observacoes = form.watch('observacoes');

  const toggleVerificado = (i: number) => {
    setVerificados((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const podeProsseguir = verificados.size === LISTA_VERIFICACAO.length;

  const onSubmit = form.handleSubmit((data) => {
    startTransition(async () => {
      const result = await abrirSessaoCaixa(data);
      if (result.ok) {
        toast.success('Caixa aberto com sucesso!');
        router.push('/caixa');
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao abrir caixa.');
      }
    });
  });

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={isDirty} />

      <StepperContent steps={PASSOS} currentStep={passo}>
        {passo === 'preparacao' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calculator className="h-5 w-5 text-primary" />
                  Lista de Verificação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Confirme cada ponto antes de prosseguir:
                </p>
                {LISTA_VERIFICACAO.map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleVerificado(i)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                    aria-checked={verificados.has(i)}
                    role="checkbox"
                  >
                    <div
                      className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        verificados.has(i)
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background'
                      }`}
                    >
                      {verificados.has(i) && <CheckCircle className="h-3 w-3" />}
                    </div>
                    <span className="text-sm">{item}</span>
                  </button>
                ))}
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => setPasso('dados')}
                disabled={!podeProsseguir}
              >
                Prosseguir
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {passo === 'dados' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <DollarSign className="h-5 w-5 text-primary" />
                  Dados da Abertura
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="fundoInicial"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fundo Inicial (MZN) *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          className="tabular-nums"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormDescription>
                        Valor total em dinheiro físico no início do turno
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="observacoes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Observações</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Observações sobre a abertura (opcional)…"
                          className="resize-none min-h-[80px]"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Resumo */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resumo da Abertura</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Fundo Inicial:</span>
                  <span className="font-bold tabular-nums">
                    MT{' '}
                    {(fundoInicial ?? 0).toLocaleString('pt-MZ', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                {observacoes && (
                  <>
                    <Separator />
                    <div className="text-sm">
                      <p className="text-muted-foreground mb-1">Observações:</p>
                      <p className="text-foreground">{observacoes}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPasso('preparacao')}
                disabled={isPending}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <Button type="button" onClick={onSubmit} disabled={isPending}>
                <CheckCircle className="mr-2 h-4 w-4" />
                {isPending ? 'A abrir caixa…' : 'Confirmar Abertura'}
              </Button>
            </div>
          </div>
        )}
      </StepperContent>
    </Form>
  );
}
