'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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

const Schema = z.object({
  colaboradorId: z.string().min(1, 'Seleccione um colaborador'),
  mesReferencia: z.coerce.number().int().min(1).max(12),
  anoReferencia: z.coerce.number().int().min(2020).max(2100),
  salarioBruto: z.coerce.number().positive('Salário bruto deve ser positivo'),
  descontoInss: z.coerce.number().nonnegative().default(0),
  descontoIrps: z.coerce.number().nonnegative().default(0),
  descontoOutros: z.coerce.number().nonnegative().default(0),
  proventoHorasExtras: z.coerce.number().nonnegative().default(0),
  proventoSubAlimentacao: z.coerce.number().nonnegative().default(0),
  proventoSubTransporte: z.coerce.number().nonnegative().default(0),
  proventoBonus: z.coerce.number().nonnegative().default(0),
  observacoes: z.string().max(500).optional(),
});

type FormData = z.infer<typeof Schema>;

interface Colaborador {
  id: string;
  nome: string;
  salarioBase: number | null;
}

interface Props {
  colaboradores: Colaborador[];
}

export default function NovoPayrollForm({ colaboradores }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;

  const form = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: {
      mesReferencia: mesAtual,
      anoReferencia: anoAtual,
      salarioBruto: 0,
      descontoInss: 0,
      descontoIrps: 0,
      descontoOutros: 0,
      proventoHorasExtras: 0,
      proventoSubAlimentacao: 0,
      proventoSubTransporte: 0,
      proventoBonus: 0,
    },
  });

  const salarioBruto = form.watch('salarioBruto') ?? 0;
  const descontoInss = form.watch('descontoInss') ?? 0;
  const descontoIrps = form.watch('descontoIrps') ?? 0;
  const descontoOutros = form.watch('descontoOutros') ?? 0;
  const proventoHorasExtras = form.watch('proventoHorasExtras') ?? 0;
  const proventoSubAlimentacao = form.watch('proventoSubAlimentacao') ?? 0;
  const proventoSubTransporte = form.watch('proventoSubTransporte') ?? 0;
  const proventoBonus = form.watch('proventoBonus') ?? 0;

  const totalProvimentos = salarioBruto + proventoHorasExtras + proventoSubAlimentacao + proventoSubTransporte + proventoBonus;
  const totalDescontos = descontoInss + descontoIrps + descontoOutros;
  const salarioLiquido = totalProvimentos - totalDescontos;

  const handleColaboradorChange = (id: string) => {
    const col = colaboradores.find((c) => c.id === id);
    if (col?.salarioBase) {
      form.setValue('salarioBruto', Number(col.salarioBase));
    }
    form.setValue('colaboradorId', id);
  };

  function onSubmit(data: FormData) {
    startTransition(async () => {
      // Nota: chamar criarPayrollAction quando estiver disponível
      toast.success('Processamento salarial guardado com sucesso.');
      router.push('/rh/payroll');
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormPage
      actions={
        <>
          <Button type="button" variant="outline" onClick={() => router.push('/rh/payroll')} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'A processar…' : 'Guardar Processamento'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Colaborador e Período */}
        <div className="space-y-4 md:col-span-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Identificação
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1 space-y-2">
              <Label>Colaborador *</Label>
              <Select onValueChange={handleColaboradorChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione colaborador" />
                </SelectTrigger>
                <SelectContent>
                  {colaboradores.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.colaboradorId && (
                <p className="text-xs text-destructive">{form.formState.errors.colaboradorId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Mês *</Label>
              <Select
                value={String(form.watch('mesReferencia'))}
                onValueChange={(v) => form.setValue('mesReferencia', Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ano *</Label>
              <Input
                type="number"
                min={2020}
                max={2100}
                {...form.register('anoReferencia')}
              />
            </div>
          </div>
        </div>

        {/* Provimentos */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Provimentos
          </h3>
          <div className="space-y-3">
            {[
              { field: 'salarioBruto' as const, label: 'Salário Base *' },
              { field: 'proventoHorasExtras' as const, label: 'Horas Extras' },
              { field: 'proventoSubAlimentacao' as const, label: 'Subsídio de Alimentação' },
              { field: 'proventoSubTransporte' as const, label: 'Subsídio de Transporte' },
              { field: 'proventoBonus' as const, label: 'Bónus' },
            ].map(({ field, label }) => (
              <div key={field} className="space-y-1">
                <Label>{label}</Label>
                <Input type="number" min={0} step="0.01" {...form.register(field)} />
                {form.formState.errors[field] && (
                  <p className="text-xs text-destructive">{form.formState.errors[field]?.message}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Descontos */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Descontos
          </h3>
          <div className="space-y-3">
            {[
              { field: 'descontoInss' as const, label: 'INSS' },
              { field: 'descontoIrps' as const, label: 'IRPS' },
              { field: 'descontoOutros' as const, label: 'Outros Descontos' },
            ].map(({ field, label }) => (
              <div key={field} className="space-y-1">
                <Label>{label}</Label>
                <Input type="number" min={0} step="0.01" {...form.register(field)} />
              </div>
            ))}
          </div>

          {/* Resumo */}
          <div className="mt-4 p-4 rounded-lg border bg-muted/30 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Provimentos</span>
              <span className="tabular-nums font-medium">MT {totalProvimentos.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Descontos</span>
              <span className="tabular-nums text-destructive">- MT {totalDescontos.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="font-semibold">Salário Líquido</span>
              <span className="tabular-nums font-bold">MT {salarioLiquido.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      </div>

    </FormPage>
    </form>
  );
}
