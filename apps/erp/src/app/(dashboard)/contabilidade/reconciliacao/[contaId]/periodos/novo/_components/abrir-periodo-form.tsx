'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { CalendarPlus, X } from 'lucide-react';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { AbrirPeriodoSchema } from '@/lib/validations/reconciliacao';
import { abrirPeriodoAction } from '@/server/actions/reconciliacao.actions';

type Valores = z.infer<typeof AbrirPeriodoSchema>;

export function AbrirPeriodoForm({ contaBancariaId, sugestaoInicio }: { contaBancariaId: string; sugestaoInicio: string }) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const base = `/contabilidade/reconciliacao/${contaBancariaId}`;
  const form = useForm<Valores>({
    resolver: zodResolver(AbrirPeriodoSchema),
    defaultValues: { contaBancariaId, dataInicio: sugestaoInicio, dataFim: '', saldoInicialBanco: '', saldoFinalBanco: '' },
    mode: 'onBlur',
  });

  const onSubmit = form.handleSubmit((v) =>
    iniciar(async () => {
      const r = await abrirPeriodoAction(v);
      if (!r.ok) return void toast.error(r.error.message);
      toast.success('Período aberto.');
      router.push(`${base}/periodos/${r.data.id}`);
      router.refresh();
    }),
  );

  const campoData = (name: 'dataInicio' | 'dataFim', label: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl><Input type="date" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
  const campoSaldo = (name: 'saldoInicialBanco' | 'saldoFinalBanco', label: string, ajuda: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl><Input inputMode="decimal" placeholder="0.00" className="tabular-nums" {...field} /></FormControl>
          <FormDescription>{ajuda}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" size="sm" disabled={aCorrer} onClick={() => router.push(base)}>
              <X className="h-4 w-4 mr-1.5" /> Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={aCorrer} onClick={onSubmit}>
              <CalendarPlus className="h-4 w-4 mr-1.5" />
              {aCorrer ? 'A abrir…' : 'Abrir período'}
            </Button>
          </>
        }
      >
        <FormSection title="Período" description="Um só período em aberto por conta, e sem sobreposição com os anteriores.">
          <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
            {campoData('dataInicio', 'Início')}
            {campoData('dataFim', 'Fim')}
          </div>
        </FormSection>
        <FormSection title="Saldos do extracto" description="Os saldos contabilísticos vêm do razão; estes são os que o banco declara.">
          <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
            {campoSaldo('saldoInicialBanco', 'Saldo inicial', 'No início do período, segundo o extracto.')}
            {campoSaldo('saldoFinalBanco', 'Saldo final', 'No fim do período, segundo o extracto.')}
          </div>
        </FormSection>
      </FormPage>
    </Form>
  );
}
