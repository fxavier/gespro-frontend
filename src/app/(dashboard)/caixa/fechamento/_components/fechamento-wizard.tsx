'use client';

/**
 * Wizard de fechamento de caixa — 3 passos.
 *
 * Passo 1: Selecionar/confirmar sessão activa.
 * Passo 2: Contagem física (notas e moedas MZN).
 * Passo 3: Resumo, diferença e confirmação.
 *
 * Padrão: Stepper + react-hook-form + zodResolver + useTransition.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { CheckCircle, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react';
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
} from '@/components/ui/form';
import { Stepper, StepperContent, UnsavedChangesGuard, StatusBadge } from '@/components/patterns';
import type { StepperStep } from '@/components/patterns';
import { fecharSessaoCaixa } from '@/server/actions/caixa.actions';
import { FecharSessaoCaixaSchema, type FecharSessaoCaixaInput } from '@/lib/validations/caixa';

const PASSOS: StepperStep[] = [
  { key: 'sessao', label: 'Sessão', description: 'Confirmar sessão' },
  { key: 'contagem', label: 'Contagem', description: 'Contar dinheiro' },
  { key: 'confirmacao', label: 'Confirmação', description: 'Confirmar fecho' },
];

// Denominações MZN
const DENOMINACOES = [
  { label: 'Nota MT 200', valor: 200, tipo: 'nota' },
  { label: 'Nota MT 100', valor: 100, tipo: 'nota' },
  { label: 'Nota MT 50', valor: 50, tipo: 'nota' },
  { label: 'Nota MT 20', valor: 20, tipo: 'nota' },
  { label: 'Nota MT 10', valor: 10, tipo: 'nota' },
  { label: 'Nota MT 5', valor: 5, tipo: 'nota' },
  { label: 'Moeda MT 10', valor: 10, tipo: 'moeda' },
  { label: 'Moeda MT 5', valor: 5, tipo: 'moeda' },
  { label: 'Moeda MT 2', valor: 2, tipo: 'moeda' },
  { label: 'Moeda MT 1', valor: 1, tipo: 'moeda' },
];

interface SessaoInfo {
  id: string;
  numero: string;
  dataAbertura: string;
  fundoInicial: string;
  status: string;
}

interface FechamentoWizardProps {
  sessaoActual?: SessaoInfo | null;
}

const formatMZN = (v: number) =>
  `MT ${v.toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function FechamentoWizard({ sessaoActual }: FechamentoWizardProps) {
  const router = useRouter();
  const [passo, setPasso] = useState<'sessao' | 'contagem' | 'confirmacao'>('sessao');
  const [quantidades, setQuantidades] = useState<Record<string, number>>(
    Object.fromEntries(DENOMINACOES.map((d) => [`${d.valor}_${d.tipo}`, 0]))
  );
  const [isPending, startTransition] = useTransition();

  const form = useForm<FecharSessaoCaixaInput>({
    resolver: zodResolver(FecharSessaoCaixaSchema),
    defaultValues: {
      sessaoCaixaId: sessaoActual?.id ?? '',
      fundoFinal: 0,
      observacoes: '',
    },
    mode: 'onBlur',
  });

  const isDirty = form.formState.isDirty;
  const observacoes = form.watch('observacoes');

  // Calcular total contado a partir das denominações
  const totalContado = DENOMINACOES.reduce((acc, d) => {
    const key = `${d.valor}_${d.tipo}`;
    return acc + (quantidades[key] ?? 0) * d.valor;
  }, 0);

  const fundoInicial = sessaoActual ? parseFloat(sessaoActual.fundoInicial) : 0;
  const diferenca = totalContado - fundoInicial;

  const handleContagemChange = (key: string, valor: number) => {
    setQuantidades((prev) => ({ ...prev, [key]: Math.max(0, valor) }));
    // Actualizar fundoFinal no form
    const novoTotal = DENOMINACOES.reduce((acc, d) => {
      const k = `${d.valor}_${d.tipo}`;
      const q = k === key ? Math.max(0, valor) : (quantidades[k] ?? 0);
      return acc + q * d.valor;
    }, 0);
    form.setValue('fundoFinal', novoTotal);
  };

  const onSubmit = form.handleSubmit((data) => {
    startTransition(async () => {
      const result = await fecharSessaoCaixa({ ...data, fundoFinal: totalContado });
      if (result.ok) {
        toast.success('Caixa fechado com sucesso!');
        router.push('/caixa');
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao fechar caixa.');
      }
    });
  });

  if (!sessaoActual) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          <AlertCircle className="h-12 w-12 text-warning" />
          <div className="text-center">
            <h2 className="text-lg font-semibold">Sem Sessão Activa</h2>
            <p className="text-sm text-muted-foreground mt-1">
              É necessário ter uma sessão de caixa aberta para efectuar o fecho.
            </p>
          </div>
          <Button asChild>
            <a href="/caixa/abertura">Abrir Caixa</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={isDirty} />

      <StepperContent steps={PASSOS} currentStep={passo}>
        {/* ─── Passo 1: Sessão ─────────────────────────────────────── */}
        {passo === 'sessao' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sessão a Fechar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Número</p>
                    <p className="font-medium tabular-nums">{sessaoActual.numero}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Estado</p>
                    <StatusBadge status={sessaoActual.status} />
                  </div>
                  <div>
                    <p className="text-muted-foreground">Abertura</p>
                    <p className="font-medium tabular-nums">
                      {new Date(sessaoActual.dataAbertura).toLocaleString('pt-MZ', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Fundo Inicial</p>
                    <p className="font-bold tabular-nums">{formatMZN(fundoInicial)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="button" onClick={() => setPasso('contagem')}>
                Prosseguir para Contagem
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ─── Passo 2: Contagem Física ─────────────────────────────── */}
        {passo === 'contagem' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contagem Física</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(['nota', 'moeda'] as const).map((tipo) => (
                  <div key={tipo}>
                    <h4 className="text-sm font-medium mb-3 capitalize">
                      {tipo === 'nota' ? 'Notas' : 'Moedas'}
                    </h4>
                    <div className="space-y-2">
                      {DENOMINACOES.filter((d) => d.tipo === tipo).map((d) => {
                        const key = `${d.valor}_${d.tipo}`;
                        const qtd = quantidades[key] ?? 0;
                        return (
                          <div key={key} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                            <span className="text-sm">{d.label}</span>
                            <Input
                              type="number"
                              min="0"
                              value={qtd}
                              onChange={(e) =>
                                handleContagemChange(key, parseInt(e.target.value) || 0)
                              }
                              className="w-24 tabular-nums text-right"
                            />
                            <div className="w-28 text-right text-sm tabular-nums text-muted-foreground">
                              {formatMZN(qtd * d.valor)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {tipo !== 'moeda' && <Separator className="mt-4" />}
                  </div>
                ))}

                <Separator />
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total Contado:</span>
                  <span className="text-xl font-bold tabular-nums">{formatMZN(totalContado)}</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPasso('sessao')}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <Button type="button" onClick={() => setPasso('confirmacao')}>
                Prosseguir
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ─── Passo 3: Confirmação ─────────────────────────────────── */}
        {passo === 'confirmacao' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resumo do Fecho</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Fundo Inicial:</span>
                  <span className="tabular-nums font-medium">{formatMZN(fundoInicial)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Total Contado:</span>
                  <span className="tabular-nums font-bold text-base">{formatMZN(totalContado)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Diferença:</span>
                  <span
                    className={`tabular-nums font-bold text-base ${
                      diferenca === 0
                        ? 'text-success'
                        : diferenca > 0
                          ? 'text-info'
                          : 'text-destructive'
                    }`}
                  >
                    {diferenca >= 0 ? '+' : ''}
                    {formatMZN(diferenca)}
                  </span>
                </div>

                {diferenca !== 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30 text-sm">
                    <AlertCircle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                    <p>
                      {diferenca > 0
                        ? 'Existe um excedente em caixa. Verifique se todas as transacções foram registadas.'
                        : 'Existe uma falha em caixa. Verifique a contagem e os movimentos registados.'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <FormField
                  control={form.control}
                  name="observacoes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Observações do Fecho</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Observações sobre o fecho (opcional)…"
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

            <div className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPasso('contagem')}
                disabled={isPending}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <Button type="button" onClick={onSubmit} disabled={isPending || totalContado === 0}>
                <CheckCircle className="mr-2 h-4 w-4" />
                {isPending ? 'A fechar caixa…' : 'Confirmar Fecho'}
              </Button>
            </div>
          </div>
        )}
      </StepperContent>
    </Form>
  );
}
