'use client';

/**
 * Formulário de conta bancária (criar/editar) — mesmo schema Zod do servidor.
 * saldoAtual não é editável (derivado dos movimentos — Requisito 1.3).
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { criarContaBancaria, atualizarContaBancaria } from '@/server/actions/contabilidade.actions';
import {
  CriarContaBancariaSchema,
  type CriarContaBancariaInput,
} from '@/lib/validations/contabilidade';

export type ContaPGCOption = { id: string; label: string };

const TIPOS_CONTA = [
  { value: 'CORRENTE', label: 'Corrente' },
  { value: 'POUPANCA', label: 'Poupança' },
  { value: 'DEPOSITO_PRAZO', label: 'Depósito a prazo' },
] as const;

export function ContaBancariaForm({
  contasPGC,
  contaId,
  valoresIniciais,
}: {
  contasPGC: ContaPGCOption[];
  /** Presente em modo edição. */
  contaId?: string;
  valoresIniciais?: Partial<CriarContaBancariaInput>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<CriarContaBancariaInput>({
    resolver: zodResolver(CriarContaBancariaSchema),
    defaultValues: {
      banco: valoresIniciais?.banco ?? '',
      agencia: valoresIniciais?.agencia ?? '',
      numeroConta: valoresIniciais?.numeroConta ?? '',
      tipoConta: valoresIniciais?.tipoConta ?? 'CORRENTE',
      moeda: valoresIniciais?.moeda ?? 'MZN',
      contaContabilId: valoresIniciais?.contaContabilId ?? '',
    },
    mode: 'onBlur',
  });

  const onSubmit = form.handleSubmit((data) => {
    startTransition(async () => {
      const res = contaId
        ? await atualizarContaBancaria({ id: contaId, ...data })
        : await criarContaBancaria(data);
      if (!res.ok) {
        const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        if (details?.fieldErrors) {
          Object.entries(details.fieldErrors).forEach(([field, messages]) => {
            form.setError(field as keyof CriarContaBancariaInput, {
              type: 'server',
              message: messages[0],
            });
          });
        } else {
          toast.error(res.error.message);
        }
        return;
      }
      toast.success(contaId ? 'Conta bancária actualizada.' : 'Conta bancária criada.');
      router.push('/contabilidade/contas-bancarias');
      router.refresh();
    });
  });

  const isDirty = form.formState.isDirty;

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={isDirty} />
      <FormPage
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => router.push('/contabilidade/contas-bancarias')}
            >
              <X className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A guardar…' : 'Guardar'}
            </Button>
          </>
        }
      >
        <FormSection title="Identificação" description="Dados da conta no banco">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="banco"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Banco</FormLabel>
                  <FormControl>
                    <Input placeholder="ex.: BIM, BCI, Standard Bank" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="agencia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agência</FormLabel>
                  <FormControl>
                    <Input placeholder="ex.: 001 — Maputo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="numeroConta"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de Conta</FormLabel>
                  <FormControl>
                    <Input className="font-mono" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tipoConta"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Conta</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIPOS_CONTA.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="moeda"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Moeda</FormLabel>
                  <FormControl>
                    <Input maxLength={3} className="uppercase font-mono" {...field} />
                  </FormControl>
                  <FormDescription>Código ISO de 3 letras (ex.: MZN)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection
          title="Ligação Contabilística"
          description="Conta folha do PGC (classe 1) onde os movimentos bancários são lançados"
        >
          <FormField
            control={form.control}
            name="contaContabilId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Conta PGC</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || undefined}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar conta PGC" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {contasPGC.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  O saldo contabilístico da reconciliação é calculado a partir do razão desta conta.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
      </FormPage>
    </Form>
  );
}
