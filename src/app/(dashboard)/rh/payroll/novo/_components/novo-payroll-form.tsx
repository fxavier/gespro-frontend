'use client';

/**
 * Processamento da folha mensal em LOTE (Spec 06).
 *
 * O INSS (3%) e o IRPS (tabela progressiva) são calculados pelo motor
 * estatutário no servidor a partir das tabelas paramétricas vigentes —
 * NUNCA introduzidos manualmente.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormPage } from '@/components/patterns';
import { ProcessarFolhaSchema, type ProcessarFolhaInput } from '@/lib/validations/payroll';
import { processarFolhaMesAction } from '@/server/actions/payroll.actions';

const MESES = [
  { value: '1', label: 'Janeiro' },
  { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' },
  { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

interface Props {
  totalColaboradoresActivos: number;
}

export default function NovoPayrollForm({ totalColaboradoresActivos }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const agora = new Date();
  const form = useForm<ProcessarFolhaInput>({
    resolver: zodResolver(ProcessarFolhaSchema),
    defaultValues: {
      mes: agora.getMonth() + 1,
      ano: agora.getFullYear(),
    },
  });

  function onSubmit(data: ProcessarFolhaInput) {
    startTransition(async () => {
      const result = await processarFolhaMesAction(data);
      if (result.ok) {
        toast.success(
          `Folha ${String(data.mes).padStart(2, '0')}/${data.ano} processada para ${result.data.totalColaboradores} colaborador(es).`,
        );
        router.push('/rh/payroll');
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FormPage
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/rh/payroll')}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'A processar…' : 'Processar Folha do Mês'}
            </Button>
          </>
        }
      >
        <div className="space-y-6 max-w-xl">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Período de referência
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mês *</Label>
                <Select
                  value={String(form.watch('mes'))}
                  onValueChange={(v) => form.setValue('mes', Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.mes && (
                  <p className="text-xs text-destructive">{form.formState.errors.mes.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Ano *</Label>
                <Input type="number" min={2020} max={2100} {...form.register('ano')} />
                {form.formState.errors.ano && (
                  <p className="text-xs text-destructive">{form.formState.errors.ano.message}</p>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg border bg-muted/30 space-y-2 text-sm">
            <p className="font-medium">
              Serão processados{' '}
              <span className="tabular-nums">{totalColaboradoresActivos}</span> colaborador(es)
              activo(s).
            </p>
            <p className="text-muted-foreground">
              O cálculo é estatutário e automático: salário base + subsídios + horas extras
              (assiduidade) + comissões do mês; desconto de INSS (3% do trabalhador) e IRPS pela
              tabela progressiva vigente; encargo patronal de INSS (4%) apurado como custo da
              entidade. A folha fica <strong>Pendente</strong> para revisão antes de ser
              processada na contabilidade.
            </p>
          </div>
        </div>
      </FormPage>
    </form>
  );
}
